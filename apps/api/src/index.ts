// Passalong sync API + web view. A Hono app on a Worker with one D1 database.
//
//   POST   /v1/accounts               mint an account; the token is the account
//   GET    /v1/me                      identity, teams, counts
//   PATCH  /v1/me                      { handle, name, email }
//   POST   /v1/teams                   { name } → create a team (you become owner)
//   GET    /v1/teams                   teams you belong to
//   GET    /v1/teams/:slug             one team with members (members only)
//   POST   /v1/teams/:slug/invites     { email? } → invite link (mailed when an email is given)
//   POST   /v1/invites/:code/accept    join the team behind an invite
//   GET    /v1/guides?q=&scope=        list/search: scope=all (default) | mine | <team slug>
//   GET    /v1/inbox                   guides handed to you (or your teams) you have not pulled
//   GET    /v1/board                   the queues: waiting, not working, in flight, landed, promote
//   GET    /v1/notifications?unread=   what happened while you were away
//   POST   /v1/notifications/read      { ids? } → mark read (everything unread when ids omitted)
//   PUT    /v1/guides/:id              upsert a guide (body: text/markdown; frontmatter team/to)
//   GET    /v1/guides/:id              guide as markdown (owner or team member); records a pull
//   PATCH  /v1/guides/:id/status       { status }  owner: any; team member: consumed/published
//   PUT    /v1/guides/:id/verdict      { ok, note? } → does it actually work?
//   DELETE /v1/guides/:id              owner only
//   GET    /g/:id/:key                 read-only web view (share link); .md for raw markdown
//   GET    /join/:code                 what an invite link lands on
//
// Static files (stylesheet, icons, robots.txt, 404 page) live in public/ and are served by the
// assets layer before this Worker runs; see wrangler.jsonc.
import { Hono } from "hono";
import {
  type MailEnv,
  sendConsumed,
  sendHandoff,
  sendInvite,
  sendPulled,
  sendVerdict,
} from "./email.js";
import { body as bodyOf, type Meta, parseMeta, STATUSES, setField } from "./guide.js";
import {
  feed,
  markRead,
  summary as notifSummary,
  notify,
  notifyAll,
  unreadCount,
} from "./notify.js";
import { renderGuide, renderHome, renderHub, renderJoin } from "./render.js";

type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> };

type Env = MailEnv & {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCOUNT_LIMIT?: RateLimiter;
  FREE_SYNC_LIMIT: string;
  ENVIRONMENT: string;
  PUBLIC_ORIGIN?: string;
};
type Vars = { account: string };
type Ctx = { env: Env; req: { url: string }; get: (k: "account") => string };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

const ID_RE = /^[a-z0-9]{6,12}$/;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function rand(length: number, alphabet = ALPHABET): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const now = () => new Date().toISOString();

const err = (c: { json: (o: unknown, s: number) => Response }, status: number, message: string) =>
  c.json({ message }, status);

// Share links are built from the request origin. Under `wrangler dev` a custom-domain route makes
// requests look like they came from production, so local dev overrides it via .dev.vars.
const origin = (c: { env: Env; req: { url: string } }) =>
  c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;

interface AccountRow {
  id: string;
  handle: string;
  name: string;
  email: string;
}
interface TeamRow {
  id: string;
  slug: string;
  name: string;
  created_by: string;
  created: string;
}
interface GuideRow {
  id: string;
  account_id: string;
  share_key: string;
  title: string;
  status: string;
  source_context: string;
  tags: string;
  stack: string;
  markdown: string;
  created: string;
  updated: string;
  pulls: number;
  team_id: string;
  to_account_id: string;
}
interface VerdictRow {
  guide_id: string;
  ok: number;
  note: string;
  at: string;
  handle: string;
}
interface PullRow {
  guide_id: string;
  account_id: string;
  via: string;
  at: string;
  handle: string;
}

const shareUrl = (base: string, row: Pick<GuideRow, "id" | "share_key">) =>
  `${base}/g/${row.id}/${row.share_key}`;

// ---- lookups ----------------------------------------------------------------------------

const db = (c: { env: Env }) => c.env.DB;

async function myTeams(c: Ctx): Promise<(TeamRow & { role: string })[]> {
  const { results } = await db(c)
    .prepare(
      `SELECT t.*, m.role FROM team t JOIN membership m ON m.team_id = t.id
       WHERE m.account_id = ? ORDER BY t.created`,
    )
    .bind(c.get("account"))
    .all<TeamRow & { role: string }>();
  return results;
}

async function teamBySlug(c: Ctx, slug: string): Promise<(TeamRow & { role: string }) | null> {
  return db(c)
    .prepare(
      `SELECT t.*, m.role FROM team t JOIN membership m ON m.team_id = t.id
       WHERE t.slug = ? AND m.account_id = ?`,
    )
    .bind(slug, c.get("account"))
    .first<TeamRow & { role: string }>();
}

async function accounts(c: { env: Env }, ids: string[]): Promise<Map<string, AccountRow>> {
  const map = new Map<string, AccountRow>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const { results } = await db(c)
    .prepare(
      `SELECT id, handle, name, email FROM account WHERE id IN (${unique.map(() => "?").join(",")})`,
    )
    .bind(...unique)
    .all<AccountRow>();
  for (const a of results) map.set(a.id, a);
  return map;
}

/** Last few pulls per guide, excluding the owner's own, with the puller's handle. */
async function recentPulls(c: { env: Env }, rows: GuideRow[]): Promise<Map<string, PullRow[]>> {
  const map = new Map<string, PullRow[]>();
  if (!rows.length) return map;
  const { results } = await db(c)
    .prepare(
      `SELECT p.guide_id, p.account_id, p.via, p.at, COALESCE(a.handle, '') AS handle
       FROM pull p LEFT JOIN account a ON a.id = p.account_id
       WHERE p.guide_id IN (${rows.map(() => "?").join(",")})
       ORDER BY p.at DESC LIMIT 500`,
    )
    .bind(...rows.map((r) => r.id))
    .all<PullRow>();
  const owner = new Map(rows.map((r) => [r.id, r.account_id]));
  for (const p of results) {
    if (p.account_id && p.account_id === owner.get(p.guide_id)) continue;
    const list = map.get(p.guide_id) || [];
    if (list.length < 5) list.push(p);
    map.set(p.guide_id, list);
  }
  return map;
}

/** Current verdicts per guide, newest first. One row per person, so this is everyone's answer. */
async function verdicts(c: { env: Env }, rows: GuideRow[]): Promise<Map<string, VerdictRow[]>> {
  const map = new Map<string, VerdictRow[]>();
  if (!rows.length) return map;
  const { results } = await db(c)
    .prepare(
      `SELECT v.guide_id, v.ok, v.note, v.at, COALESCE(a.handle, '') AS handle
       FROM verdict v LEFT JOIN account a ON a.id = v.account_id
       WHERE v.guide_id IN (${rows.map(() => "?").join(",")})
       ORDER BY v.at DESC LIMIT 200`,
    )
    .bind(...rows.map((r) => r.id))
    .all<VerdictRow>();
  for (const v of results) map.set(v.guide_id, [...(map.get(v.guide_id) || []), v]);
  return map;
}

async function summaries(c: Ctx, rows: GuideRow[]) {
  const me = c.get("account");
  const base = origin(c);
  const teams = new Map((await myTeams(c)).map((t) => [t.id, t]));
  const people = await accounts(
    c,
    rows.flatMap((r) => [r.account_id, r.to_account_id]),
  );
  const pulls = await recentPulls(c, rows);
  const said = await verdicts(c, rows);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    created: r.created,
    updated: r.updated,
    source_context: r.source_context,
    tags: JSON.parse(r.tags) as string[],
    stack_assumptions: JSON.parse(r.stack) as string[],
    pulls: r.pulls,
    url: shareUrl(base, r),
    mine: r.account_id === me,
    from: people.get(r.account_id)?.handle || "",
    team: teams.get(r.team_id)?.slug || "",
    to: people.get(r.to_account_id)?.handle || "",
    for_me: r.to_account_id === me,
    // The latest word, plus whether anyone's standing verdict is still negative.
    verdict: (said.get(r.id) || [])[0]
      ? {
          ok: Boolean((said.get(r.id) as VerdictRow[])[0].ok),
          by: (said.get(r.id) as VerdictRow[])[0].handle,
          note: (said.get(r.id) as VerdictRow[])[0].note,
          at: (said.get(r.id) as VerdictRow[])[0].at,
        }
      : null,
    failing: (said.get(r.id) || []).some((v) => !v.ok),
    pulled_by: (pulls.get(r.id) || []).map((p) => ({
      handle: p.handle,
      via: p.via,
      at: p.at,
    })),
  }));
}

// ---- auth -------------------------------------------------------------------------------

app.use("/v1/*", async (c, next) => {
  if (c.req.method === "POST" && c.req.path === "/v1/accounts") return next();
  const auth = c.req.header("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return err(c, 401, "missing bearer token — run `passalong login`");
  const row = await c.env.DB.prepare("SELECT id FROM account WHERE token_hash = ?")
    .bind(await sha256(token))
    .first<{ id: string }>();
  if (!row)
    return err(
      c,
      401,
      "token not recognized — run `passalong login` for a new account or paste a valid token",
    );
  c.set("account", row.id);
  await next();
});

app.post("/v1/accounts", async (c) => {
  if (c.env.ACCOUNT_LIMIT) {
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const { success } = await c.env.ACCOUNT_LIMIT.limit({ key: ip });
    if (!success)
      return err(c, 429, "too many accounts created from this address; try again in a minute");
  }
  const id = rand(10);
  const token = `pa_${rand(32, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`;
  await c.env.DB.prepare("INSERT INTO account (id, token_hash, created) VALUES (?, ?, ?)")
    .bind(id, await sha256(token), now())
    .run();
  return c.json({ account: id, token }, 201);
});

// ---- identity ---------------------------------------------------------------------------

app.get("/v1/me", async (c) => {
  const account = c.get("account");
  const me = await c.env.DB.prepare("SELECT id, handle, name, email FROM account WHERE id = ?")
    .bind(account)
    .first<AccountRow>();
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM guide WHERE account_id = ?")
    .bind(account)
    .first<{ n: number }>();
  const teams = (await myTeams(c)).map((t) => ({ slug: t.slug, name: t.name, role: t.role }));
  return c.json({
    account,
    handle: me?.handle || "",
    name: me?.name || "",
    email: me?.email || "",
    teams,
    guides: n?.n ?? 0,
    limit: Number(c.env.FREE_SYNC_LIMIT),
    unread: await unreadCount(c.env, account),
  });
});

app.patch("/v1/me", async (c) => {
  const account = c.get("account");
  const patch = (await c.req.json().catch(() => ({}))) as {
    handle?: string;
    name?: string;
    email?: string;
  };
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.handle !== undefined) {
    const h = patch.handle.trim().toLowerCase().replace(/^@/, "");
    if (!HANDLE_RE.test(h)) return err(c, 400, "handle: 2–31 chars, a–z 0–9 and dashes");
    const taken = await c.env.DB.prepare("SELECT id FROM account WHERE handle = ? AND id <> ?")
      .bind(h, account)
      .first();
    if (taken) return err(c, 409, `handle @${h} is taken`);
    sets.push("handle = ?");
    binds.push(h);
  }
  if (patch.name !== undefined) {
    sets.push("name = ?");
    binds.push(patch.name.trim().slice(0, 80));
  }
  if (patch.email !== undefined) {
    const e = patch.email.trim().toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return err(c, 400, "email does not look valid");
    sets.push("email = ?");
    binds.push(e);
  }
  if (!sets.length) return err(c, 400, "nothing to update: send handle, name, or email");
  await c.env.DB.prepare(`UPDATE account SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds, account)
    .run();
  const me = await c.env.DB.prepare("SELECT id, handle, name, email FROM account WHERE id = ?")
    .bind(account)
    .first<AccountRow>();
  return c.json(me);
});

// ---- teams ------------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

app.post("/v1/teams", async (c) => {
  const account = c.get("account");
  const { name } = (await c.req.json().catch(() => ({}))) as { name?: string };
  const clean = (name || "").trim().slice(0, 60);
  if (clean.length < 2) return err(c, 400, "team needs a name");
  let slug = slugify(clean);
  if (slug.length < 2) return err(c, 400, "team name needs some letters or digits");
  for (let i = 2; i < 50; i++) {
    const taken = await c.env.DB.prepare("SELECT id FROM team WHERE slug = ?").bind(slug).first();
    if (!taken) break;
    slug = `${slugify(clean)}-${i}`;
  }
  const id = rand(10);
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO team (id, slug, name, created_by, created) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, slug, clean, account, t),
    c.env.DB.prepare(
      "INSERT INTO membership (team_id, account_id, role, joined) VALUES (?, ?, 'owner', ?)",
    ).bind(id, account, t),
  ]);
  return c.json({ id, slug, name: clean, role: "owner" }, 201);
});

app.get("/v1/teams", async (c) => {
  const teams = await myTeams(c);
  return c.json({ teams: teams.map((t) => ({ slug: t.slug, name: t.name, role: t.role })) });
});

app.get("/v1/teams/:slug", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "no such team, or you are not a member");
  const { results: members } = await c.env.DB.prepare(
    `SELECT a.handle, a.name, m.role, m.joined FROM membership m JOIN account a ON a.id = m.account_id
     WHERE m.team_id = ? ORDER BY m.joined`,
  )
    .bind(team.id)
    .all<{ handle: string; name: string; role: string; joined: string }>();
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM guide WHERE team_id = ?")
    .bind(team.id)
    .first<{ n: number }>();
  return c.json({
    slug: team.slug,
    name: team.name,
    role: team.role,
    created: team.created,
    members,
    guides: n?.n ?? 0,
  });
});

app.post("/v1/teams/:slug/invites", async (c) => {
  const account = c.get("account");
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "no such team, or you are not a member");
  const { email } = (await c.req.json().catch(() => ({}))) as { email?: string };
  const to = (email || "").trim().toLowerCase();
  if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return err(c, 400, "email does not look valid");
  const code = rand(12);
  await c.env.DB.prepare(
    "INSERT INTO invite (code, team_id, email, created_by, created) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(code, team.id, to, account, now())
    .run();
  const url = `${origin(c)}/join/${code}`;
  let mailed = false;
  if (to) {
    const me = (await accounts(c, [account])).get(account);
    mailed = await sendInvite(c.env, {
      to,
      team: team.name,
      by: me?.name || (me?.handle ? `@${me.handle}` : "a teammate"),
      url,
    });
  }
  return c.json({ code, url, email: to, mailed }, 201);
});

app.post("/v1/invites/:code/accept", async (c) => {
  const account = c.get("account");
  const code = c.req.param("code");
  const inv = await c.env.DB.prepare(
    "SELECT i.*, t.slug, t.name FROM invite i JOIN team t ON t.id = i.team_id WHERE i.code = ?",
  )
    .bind(code)
    .first<{
      team_id: string;
      slug: string;
      name: string;
      used_by: string;
      created_by: string;
    }>();
  if (!inv) return err(c, 404, "invite not found");
  const already = await c.env.DB.prepare(
    "SELECT role FROM membership WHERE team_id = ? AND account_id = ?",
  )
    .bind(inv.team_id, account)
    .first<{ role: string }>();
  if (!already) {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO membership (team_id, account_id, role, joined) VALUES (?, ?, 'member', ?)",
      ).bind(inv.team_id, account, now()),
      c.env.DB.prepare(
        "UPDATE invite SET used_by = ?, used = ? WHERE code = ? AND used_by = ''",
      ).bind(account, now(), code),
    ]);
    // Whoever sent the invite is the one waiting to hear it was taken up.
    await notify(c.env, {
      to: inv.created_by,
      kind: "joined",
      actor_id: account,
      team_id: inv.team_id,
    });
  }
  return c.json({
    slug: inv.slug,
    name: inv.name,
    role: already?.role || "member",
    joined: !already,
  });
});

// ---- guides -----------------------------------------------------------------------------

app.get("/v1/guides", async (c) => {
  const account = c.get("account");
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const scope = (c.req.query("scope") || "all").trim();
  const teams = await myTeams(c);
  const binds: unknown[] = [];
  let where: string;
  if (scope === "mine") {
    where = "account_id = ?";
    binds.push(account);
  } else if (scope === "all") {
    const ids = teams.map((t) => t.id);
    where = ids.length
      ? `(account_id = ? OR team_id IN (${ids.map(() => "?").join(",")}))`
      : "account_id = ?";
    binds.push(account, ...ids);
  } else {
    const team = teams.find((t) => t.slug === scope);
    if (!team) return err(c, 404, `you are not in a team called "${scope}"`);
    where = "team_id = ?";
    binds.push(team.id);
  }
  let sql = `SELECT * FROM guide WHERE ${where}`;
  for (const t of q ? q.split(/\s+/) : []) {
    sql +=
      " AND (lower(title) LIKE ? OR lower(tags) LIKE ? OR lower(stack) LIKE ? OR lower(source_context) LIKE ? OR lower(markdown) LIKE ?)";
    const like = `%${t}%`;
    binds.push(like, like, like, like, like);
  }
  sql += " ORDER BY created DESC LIMIT 200";
  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<GuideRow>();
  return c.json({ guides: await summaries(c, results) });
});

// Handed to me (or to a team I'm in, by someone else) and not yet pulled by me.
async function inboxRows(c: Ctx, limit = 100): Promise<GuideRow[]> {
  const account = c.get("account");
  const ids = (await myTeams(c)).map((t) => t.id);
  const teamClause = ids.length
    ? `OR (team_id IN (${ids.map(() => "?").join(",")}) AND to_account_id = '')`
    : "";
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM guide
     WHERE account_id <> ? AND status = 'published'
       AND (to_account_id = ? ${teamClause})
       AND id NOT IN (SELECT guide_id FROM pull WHERE account_id = ?)
     ORDER BY created DESC LIMIT ?`,
  )
    .bind(account, account, ...ids, account, limit)
    .all<GuideRow>();
  return results;
}

app.get("/v1/inbox", async (c) => c.json({ guides: await summaries(c, await inboxRows(c)) }));

// ---- board ------------------------------------------------------------------------------

// A transfer is only finished when it lands on the other side, so the dashboard is queues
// rather than numbers: what is waiting on you, what you handed over and nobody has taken
// yet, what landed and is still open, and what has been pulled enough times to be worth keeping.
// Someone else pulling is what counts everywhere here — your own pull from another machine is
// not the transfer landing.
const STALE_DAYS = 7;
const PULLED_BY_OTHERS = `EXISTS (SELECT 1 FROM pull p WHERE p.guide_id = g.id
     AND p.account_id <> '' AND p.account_id <> g.account_id)`;
const FAILING = "EXISTS (SELECT 1 FROM verdict v WHERE v.guide_id = g.id AND v.ok = 0)";

app.get("/v1/board", async (c) => {
  const account = c.get("account");
  const mine = (sql: string, ...binds: unknown[]) =>
    c.env.DB.prepare(sql)
      .bind(account, ...binds)
      .all<GuideRow>();

  const [waiting, failing, flight, landed, promote] = await Promise.all([
    inboxRows(c, 20),
    // Someone tried your work and it does not hold up. The most actionable thing on the page.
    mine(
      `SELECT g.* FROM guide g WHERE g.account_id = ? AND g.status = 'published' AND ${FAILING}
       ORDER BY g.updated DESC LIMIT 20`,
    ).then((r) => r.results),
    // Handed to a person or a team, and still untouched by anyone but you.
    mine(
      `SELECT g.* FROM guide g WHERE g.account_id = ? AND g.status = 'published'
         AND (g.to_account_id <> '' OR g.team_id <> '') AND NOT ${PULLED_BY_OTHERS}
       ORDER BY g.created ASC LIMIT 20`,
    ).then((r) => r.results),
    // Someone has it and has not said it shipped. Guides past the promote line are shown there
    // instead, so one guide never occupies two cards.
    mine(
      `SELECT g.* FROM guide g WHERE g.account_id = ? AND g.status = 'published'
         AND g.pulls < 3 AND ${PULLED_BY_OTHERS} AND NOT ${FAILING}
       ORDER BY g.updated DESC LIMIT 20`,
    ).then((r) => r.results),
    mine(
      `SELECT g.* FROM guide g WHERE g.account_id = ? AND g.status = 'published' AND g.pulls >= 3
         AND NOT ${FAILING}
       ORDER BY g.pulls DESC LIMIT 20`,
    ).then((r) => r.results),
  ]);

  // One summaries() pass over every row, then split back into buckets: the lookups it does
  // (teams, people, recent pulls) are per-call, not per-row.
  const all = [...waiting, ...failing, ...flight, ...landed, ...promote];
  const byId = new Map((await summaries(c, all)).map((s) => [s.id, s]));
  const pick = (rows: GuideRow[]) => rows.map((r) => byId.get(r.id)).filter(Boolean);
  const cutoff = Date.now() - STALE_DAYS * 864e5;

  return c.json({
    waiting: pick(waiting),
    failing: pick(failing),
    in_flight: pick(flight).map((g) => ({
      ...g,
      stale: new Date(g?.created ?? 0).getTime() < cutoff,
    })),
    landed: pick(landed),
    promote: pick(promote),
    unread: await unreadCount(c.env, account),
  });
});

// ---- notifications ----------------------------------------------------------------------

app.get("/v1/notifications", async (c) => {
  const account = c.get("account");
  // `?unread` (bare, or =1) narrows to what you have not seen; absent means the whole feed.
  const flag = c.req.query("unread");
  const rows = await feed(c.env, account, {
    unread: flag !== undefined && flag !== "0" && flag !== "false",
    limit: Number(c.req.query("limit")) || 50,
  });
  return c.json({
    notifications: rows.map(notifSummary),
    unread: await unreadCount(c.env, account),
  });
});

app.post("/v1/notifications/read", async (c) => {
  const { ids } = (await c.req.json().catch(() => ({}))) as { ids?: number[] };
  const clean = (ids || []).map(Number).filter(Number.isInteger).slice(0, 200);
  const read = await markRead(c.env, c.get("account"), clean);
  return c.json({ read, unread: await unreadCount(c.env, c.get("account")) });
});

app.put("/v1/guides/:id", async (c) => {
  const account = c.get("account");
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return err(c, 400, "invalid guide id");
  let markdown = await c.req.text();
  if (!markdown.trim()) return err(c, 400, "empty body; send the guide as text/markdown");
  if (markdown.length > 512 * 1024) return err(c, 413, "guide is over 512KB");
  const meta: Meta = parseMeta(markdown);
  if (meta.id && meta.id !== id) return err(c, 400, "frontmatter id does not match the URL");
  if (!meta.title) return err(c, 400, "frontmatter needs a title");
  const status =
    meta.status && (STATUSES as readonly string[]).includes(meta.status)
      ? meta.status
      : "published";

  // Addressing: `team: <slug>` puts the guide in a team; `to: <handle>` hands it to a member.
  let team: (TeamRow & { role: string }) | null = null;
  let toAccount: AccountRow | null = null;
  if (meta.team) {
    team = await teamBySlug(c, String(meta.team));
    if (!team) return err(c, 400, `you are not in a team called "${meta.team}"`);
  }
  if (meta.to) {
    const handle = String(meta.to).replace(/^@/, "").toLowerCase();
    if (!team) return err(c, 400, "`to:` needs a `team:` — a handoff goes to a teammate");
    toAccount = await c.env.DB.prepare(
      `SELECT a.id, a.handle, a.name, a.email FROM account a JOIN membership m ON m.account_id = a.id
       WHERE a.handle = ? AND m.team_id = ?`,
    )
      .bind(handle, team.id)
      .first<AccountRow>();
    if (!toAccount) return err(c, 400, `@${handle} is not a member of ${team.slug}`);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id, account_id, share_key, created, team_id, to_account_id FROM guide WHERE id = ?",
  )
    .bind(id)
    .first<
      Pick<GuideRow, "id" | "account_id" | "share_key" | "created" | "team_id" | "to_account_id">
    >();
  if (existing && existing.account_id !== account)
    return err(c, 403, "that id belongs to another account");

  if (!existing) {
    const limit = Number(c.env.FREE_SYNC_LIMIT) || 25;
    const active = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM guide WHERE account_id = ? AND status IN ('published','promoted')",
    )
      .bind(account)
      .first<{ n: number }>();
    if ((active?.n ?? 0) >= limit) {
      return err(
        c,
        402,
        `free tier keeps ${limit} active synced guides; mark some consumed (passalong done <id>) or remove them`,
      );
    }
  }

  const base = origin(c);
  const share_key = existing?.share_key ?? rand(22);
  const url = shareUrl(base, { id, share_key });
  markdown = setField(markdown, "url", url);
  if (!meta.id) markdown = setField(markdown, "id", id);
  const t = now();
  const created = String(meta.created || existing?.created || t);

  await c.env.DB.prepare(
    `INSERT INTO guide (id, account_id, share_key, title, status, source_context, tags, stack, markdown, created, updated, team_id, to_account_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status, source_context=excluded.source_context,
       tags=excluded.tags, stack=excluded.stack, markdown=excluded.markdown, updated=excluded.updated,
       team_id=excluded.team_id, to_account_id=excluded.to_account_id`,
  )
    .bind(
      id,
      account,
      share_key,
      meta.title,
      status,
      String(meta.source_context || ""),
      JSON.stringify(meta.tags),
      JSON.stringify(meta.stack_assumptions),
      markdown,
      created,
      t,
      team?.id || "",
      toAccount?.id || "",
    )
    .run();

  // Tell whoever the guide just became relevant to. Re-publishing an unchanged address is not a
  // new event, so only a *newly* addressed person or a newly shared team hears anything.
  let notified = false;
  const addressed =
    toAccount && toAccount.id !== account && existing?.to_account_id !== toAccount.id;
  const newlyShared = team && existing?.team_id !== team.id;
  if (addressed || newlyShared) {
    const me = (await accounts(c, [account])).get(account);
    const fromHandle = me?.handle || "someone";
    if (addressed && toAccount) {
      await notify(c.env, {
        to: toAccount.id,
        kind: "handoff",
        guide_id: id,
        actor_id: account,
        team_id: team?.id,
        // A handoff to a named person is the one event worth an email: it is addressed work.
        mail: async () => {
          notified = await sendHandoff(c.env, {
            to: toAccount.email,
            fromHandle,
            title: String(meta.title),
            id,
            url,
            team: team?.name || "",
          });
          return notified;
        },
      });
    }
    // A team-wide share reaches the whole team's feed, but nobody's inbox: it is addressed to
    // no one in particular, and that is exactly the mail people learn to filter out.
    if (newlyShared && team) {
      const { results } = await c.env.DB.prepare(
        "SELECT account_id FROM membership WHERE team_id = ? AND account_id <> ?",
      )
        .bind(team.id, account)
        .all<{ account_id: string }>();
      const others = results.map((m) => m.account_id).filter((mid) => mid !== toAccount?.id);
      await notifyAll(c.env, others, {
        kind: "shared",
        guide_id: id,
        actor_id: account,
        team_id: team.id,
      });
    }
  }
  return c.json(
    {
      id,
      url,
      status,
      created: !existing,
      team: team?.slug || "",
      to: toAccount?.handle || "",
      notified,
    },
    existing ? 200 : 201,
  );
});

/** A guide the caller may read: their own, or one in a team they belong to. */
async function readableGuide(
  c: Ctx,
  id: string,
): Promise<{ row: GuideRow; owner: boolean } | null> {
  const row = await db(c).prepare("SELECT * FROM guide WHERE id = ?").bind(id).first<GuideRow>();
  if (!row) return null;
  const me = c.get("account");
  if (row.account_id === me) return { row, owner: true };
  if (row.team_id) {
    const m = await db(c)
      .prepare("SELECT role FROM membership WHERE team_id = ? AND account_id = ?")
      .bind(row.team_id, me)
      .first();
    if (m) return { row, owner: false };
  }
  return null;
}

/**
 * Record a pull and tell the author it landed — the other half of the transfer, and the one
 * question a sender actually has. `account` is '' for an anonymous share-link read.
 */
async function recordPull(
  c: { env: Env; req: { url: string } },
  row: GuideRow,
  account: string,
  via: string,
) {
  await db(c).batch([
    db(c)
      .prepare("INSERT INTO pull (guide_id, account_id, via, at) VALUES (?, ?, ?, ?)")
      .bind(row.id, account, via, now()),
    db(c).prepare("UPDATE guide SET pulls = pulls + 1 WHERE id = ?").bind(row.id),
  ]);
  if (row.account_id === account) return; // pulling your own guide on another machine
  const people = await accounts(c, [account, row.account_id]);
  await notify(c.env, {
    to: row.account_id,
    kind: "pulled",
    guide_id: row.id,
    actor_id: account,
    team_id: row.team_id,
    // Only a named person's pull is worth an inbox. An anonymous link read has no "who" to
    // report and anything can open a URL, so it stays in the feed.
    mail: account
      ? () =>
          sendPulled(c.env, {
            to: people.get(row.account_id)?.email || "",
            byHandle: people.get(account)?.handle || "",
            title: row.title,
            id: row.id,
            url: shareUrl(origin(c), row),
          })
      : undefined,
  });
}

/**
 * Proof a guide reached someone who never runs `pull`. Saying it works, or marking it consumed,
 * is not something you can do without having had the guide — but for a browser-only receiver
 * (a tester, a designer) no pull row exists, so the sender's board says "never picked up" about
 * work that has already been checked, and the receiver's inbox never clears.
 *
 * No notification: the verdict or the status change is the news, and "@x pulled" alongside
 * "@x verified" is the same fact told twice.
 */
async function recordReceipt(c: Ctx, row: GuideRow, via: string) {
  const account = c.get("account");
  if (!account || row.account_id === account) return;
  const seen = await db(c)
    .prepare("SELECT 1 AS n FROM pull WHERE guide_id = ? AND account_id = ?")
    .bind(row.id, account)
    .first();
  if (seen) return;
  await db(c).batch([
    db(c)
      .prepare("INSERT INTO pull (guide_id, account_id, via, at) VALUES (?, ?, ?, ?)")
      .bind(row.id, account, via, now()),
    db(c).prepare("UPDATE guide SET pulls = pulls + 1 WHERE id = ?").bind(row.id),
  ]);
}

app.get("/v1/guides/:id", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, "no such guide (or it is not in one of your teams)");
  await recordPull(c, found.row, c.get("account"), "cli");
  return c.text(found.row.markdown, 200, { "content-type": "text/markdown; charset=utf-8" });
});

app.patch("/v1/guides/:id/status", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, "no such guide");
  const { status } = (await c.req.json().catch(() => ({}))) as { status?: string };
  if (!status || !(STATUSES as readonly string[]).includes(status))
    return err(c, 400, `status must be one of ${STATUSES.join(", ")}`);
  if (!found.owner && !["consumed", "published"].includes(status))
    return err(c, 403, "only the author can promote or draft a guide; you can mark it consumed");
  const markdown = setField(found.row.markdown, "status", status);
  await c.env.DB.prepare("UPDATE guide SET status = ?, markdown = ?, updated = ? WHERE id = ?")
    .bind(status, markdown, now(), found.row.id)
    .run();
  // The end of the loop: someone else shipped what you handed them.
  if (!found.owner && status === "consumed") {
    await recordReceipt(c, found.row, "web");
    const account = c.get("account");
    const people = await accounts(c, [account, found.row.account_id]);
    await notify(c.env, {
      to: found.row.account_id,
      kind: "consumed",
      guide_id: found.row.id,
      actor_id: account,
      team_id: found.row.team_id,
      mail: () =>
        sendConsumed(c.env, {
          to: people.get(found.row.account_id)?.email || "",
          byHandle: people.get(account)?.handle || "someone",
          title: found.row.title,
          id: found.row.id,
        }),
    });
  }
  return c.json({ id: found.row.id, status });
});

// A verdict is the reader's answer to "does this work?", and the only way the sender learns that
// their handoff did not land. Deliberately separate from status: status is the author's lifecycle
// and holds one value, while a verdict belongs to whoever tried it and can be negative.
const NOTE_MAX = 280;

app.put("/v1/guides/:id/verdict", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, "no such guide (or it is not in one of your teams)");
  const account = c.get("account");
  const body = (await c.req.json().catch(() => ({}))) as { ok?: boolean; note?: string };
  if (typeof body.ok !== "boolean") return err(c, 400, "send { ok: true } or { ok: false }");
  const note = (body.note || "").trim().slice(0, NOTE_MAX);
  // One line, not a thread. Saying "it doesn't work" without saying how helps nobody, and
  // anything longer than this is a conversation the product deliberately does not host.
  if (!body.ok && !note) return err(c, 400, "say what went wrong: send a note with { ok: false }");

  await c.env.DB.prepare(
    `INSERT INTO verdict (guide_id, account_id, ok, note, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guide_id, account_id) DO UPDATE SET ok = excluded.ok, note = excluded.note, at = excluded.at`,
  )
    .bind(found.row.id, account, body.ok ? 1 : 0, note, now())
    .run();
  await recordReceipt(c, found.row, "verdict");

  const people = await accounts(c, [account, found.row.account_id]);
  await notify(c.env, {
    to: found.row.account_id,
    kind: body.ok ? "verified" : "failed",
    guide_id: found.row.id,
    actor_id: account,
    team_id: found.row.team_id,
    note,
    mail: () =>
      sendVerdict(c.env, {
        to: people.get(found.row.account_id)?.email || "",
        byHandle: people.get(account)?.handle || "",
        title: found.row.title,
        id: found.row.id,
        url: shareUrl(origin(c), found.row),
        ok: body.ok === true,
        note,
      }),
  });
  return c.json({ id: found.row.id, ok: body.ok, note });
});

app.delete("/v1/guides/:id", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, "no such guide");
  if (!found.owner) return err(c, 403, "only the author can remove a guide");
  await c.env.DB.prepare("DELETE FROM guide WHERE id = ?").bind(found.row.id).run();
  return c.json({ id: found.row.id, deleted: true });
});

// ---- share links ------------------------------------------------------------------------

async function shared(c: { env: Env }, id: string, key: string): Promise<GuideRow | null> {
  if (!ID_RE.test(id) || !/^[a-z0-9]{16,32}$/.test(key)) return null;
  return c.env.DB.prepare("SELECT * FROM guide WHERE id = ? AND share_key = ?")
    .bind(id, key)
    .first<GuideRow>();
}

// Guides are the owner's own markdown, but a share link is viewed by other people. The CSP
// turns anything script-shaped in that markdown inert instead of trusting a sanitizer. Styles
// come from /styles.css (a static asset), so inline styles are refused too.
const VIEW_HEADERS = {
  "content-security-policy":
    "default-src 'none'; style-src 'self'; img-src 'self' https: data:; manifest-src 'self'; base-uri 'none'; form-action 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

// The 404 page is a static asset, so unmatched routes hand it back with the right status.
async function notFoundPage(c: { env: Env; req: { url: string } }): Promise<Response> {
  const asset = await c.env.ASSETS.fetch(new URL("/404.html", c.req.url));
  return new Response(asset.body, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", ...VIEW_HEADERS },
  });
}

app.get("/g/:id/:key{.+\\.md}", async (c) => {
  const row = await shared(c, c.req.param("id"), c.req.param("key").replace(/\.md$/, ""));
  if (!row) return c.text("no such guide", 404);
  await recordPull(c, row, "", "link");
  return c.text(row.markdown, 200, {
    "content-type": "text/markdown; charset=utf-8",
    ...VIEW_HEADERS,
  });
});

app.get("/g/:id/:key", async (c) => {
  const row = await shared(c, c.req.param("id"), c.req.param("key"));
  if (!row) return notFoundPage(c);
  const meta = parseMeta(row.markdown);
  // ?view=verify leads with what the reader has to check. It is a link, not a toggle, because
  // guide pages run no script — the CSP is what makes rendering someone else's markdown safe.
  const html = renderGuide(
    {
      id: row.id,
      meta,
      body: bodyOf(row.markdown),
      url: shareUrl(origin(c), row),
      pulls: row.pulls,
    },
    c.req.query("view") === "verify" ? "verify" : "guide",
  );
  return c.html(html, 200, VIEW_HEADERS);
});

app.get("/join/:code", async (c) => {
  const inv = await c.env.DB.prepare(
    "SELECT i.code, t.name FROM invite i JOIN team t ON t.id = i.team_id WHERE i.code = ?",
  )
    .bind(c.req.param("code"))
    .first<{ code: string; name: string }>();
  if (!inv) return notFoundPage(c);
  return c.html(
    renderJoin({ team: inv.name, code: inv.code, url: `${origin(c)}/join/${inv.code}` }),
    200,
    // Joining happens in the browser, so this page runs script like the hub does. It renders no
    // user-authored markdown — only the team name — so it is not the surface the strict CSP guards.
    HUB_HEADERS,
  );
});

app.get("/", (c) => c.html(renderHome(), 200, VIEW_HEADERS));

// The hub and the invite page run script: their own static files, talking only to this origin.
// Guide pages, which render markdown someone else wrote, keep the stricter VIEW_HEADERS.
const HUB_HEADERS = {
  ...VIEW_HEADERS,
  "content-security-policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'",
};
app.get("/hub", (c) => c.html(renderHub(), 200, HUB_HEADERS));
app.get("/health", (c) => c.json({ ok: true }));

app.notFound((c) =>
  c.req.path.startsWith("/v1/") ? err(c, 404, "no such route") : notFoundPage(c),
);

app.onError((e, c) => {
  console.error(e);
  return err(c, 500, "internal error");
});

export default app;
