// Passalong sync API + web view. A Hono app on a Worker with one D1 database.
//
//   POST   /v1/accounts               mint an anonymous account + its first token
//   POST   /v1/auth/signup             { email, password } → account + session cookie
//   POST   /v1/auth/login              { email, password } → session cookie
//   POST   /v1/auth/logout             end this session
//   POST   /v1/auth/password           { email?, password } claim an account, or change it
//   POST   /v1/auth/forgot             { email } → emailed reset link (always answers the same)
//   POST   /v1/auth/reset              { code, password } → new password + session
//   GET    /v1/tokens                  CLI/MCP credentials on this account
//   POST   /v1/tokens                  { name } → a new token, shown once
//   DELETE /v1/tokens/:id              revoke one
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
//   PUT    /v1/guides/:id/ack          { taken, note }  the reader's first word back
//   PUT    /v1/guides/:id/verdict      { ok, note? } → does it actually work?
//   DELETE /v1/guides/:id              owner only
//   GET    /g/:id/:key.md              a guide's raw markdown (share link); records a pull
//   GET    /g/:id/:key/og.png          the unfurl card for that link
//   GET    /health                     what CI waits on after a deploy
//
// **This app is not deployed on its own.** apps/web mounts it — see
// apps/web/server/middleware/1.api.ts — so everything above is served from the Nuxt Worker, on the
// same origin as the pages. That is what lets one middleware accept either credential without the
// browser ever making a cross-origin call.
//
// Every page a person looks at is apps/web's: `/`, the guide page at `/g/:id/:key`, `/hub`,
// `/join/:code`, `/reset`, and the 404. What is left here is the machine surface, plus the two
// `/g/**` routes that stayed because a crawler and an agent fetch them, not a browser — and
// because `workers-og` is ~1.7MB of wasm that only the card should ever pay for.
import { Hono } from "hono";
import { type AnalyticsEnv, type Props, track } from "./analytics.js";
import {
  clearCookie,
  decoyHash,
  EMAIL_RE,
  hashPassword,
  isBreached,
  passwordProblem,
  rand,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
  sessionExpiry,
  sha256,
  verifyPassword,
} from "./auth.js";
import {
  type MailEnv,
  sendConsumed,
  sendHandoff,
  sendInvite,
  sendPulled,
  sendReset,
  sendVerdict,
} from "./email.js";
import {
  AREAS,
  type Meta,
  parseMeta,
  SEVERITIES,
  STATUSES,
  setField,
  setList,
  shotIds,
  slug,
  tagList,
} from "./guide.js";
import { handleMcp } from "./mcp-http.js";
import {
  announce,
  feed,
  line,
  markRead,
  summary as notifSummary,
  notify,
  notifyAll,
  post,
  unreadCount,
  webhookAllowed,
} from "./notify.js";
import {
  authorizationServerMetadata,
  errorRedirect,
  MCP_SCOPE,
  type OAuthClientRow,
  pkceMatches,
  protectedResourceMetadata,
  redirectAllowed,
  timingSafeEqual,
} from "./oauth.js";
import { grantFor, issueCode, issueTokens } from "./oauth-store.js";
import { renderOgImage } from "./og.js";
import { openapi } from "./openapi.js";
import { COUNTED, isFull, limitFor } from "./quota.js";
import { SHOT_TYPES, shotKey } from "./shots.js";

type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> };

type Env = MailEnv &
  AnalyticsEnv & {
    DB: D1Database;
    ASSETS: Fetcher;
    /** Screenshot bytes. Optional: a deployment without the bucket refuses uploads and serves
        every other route exactly as before. */
    SHOTS?: R2Bucket;
    ACCOUNT_LIMIT?: RateLimiter;
    FREE_SYNC_LIMIT: string;
    ENVIRONMENT: string;
    PUBLIC_ORIGIN?: string;
  };
type Vars = { account: string };
type Ctx = { env: Env; req: { url: string }; get: (k: "account") => string };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// The `www` → apex redirect used to be the first middleware here. It now lives in
// apps/web/server/middleware/0.canonical.ts, because this app only ever sees `/v1/*`, `/health`
// and the two machine routes — a page request to www would never have reached it. `hosts.ts` and
// its test stay put; only the caller moved.

const ID_RE = /^[a-z0-9]{6,12}$/;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
// Ids people read out loud: no lookalike characters. Secrets use auth.ts's wider alphabet.
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const rid = (n: number) => rand(n, ID_ALPHABET);

const now = () => new Date().toISOString();

/**
 * Fire an analytics event off the response path. Categorical props only — see analytics.ts for
 * why nothing identifying is allowed through here.
 */
function count(
  c: { env: Env; executionCtx?: { waitUntil(p: Promise<unknown>): void } },
  name: string,
  props: Props = {},
) {
  try {
    // Accessing executionCtx throws where there is none, which is why this is inside the try.
    c.executionCtx?.waitUntil(track(c.env, name, props));
  } catch {
    // No execution context (tests, some local paths): drop it rather than block.
  }
}

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
  report_id: string;
  area: string;
  severity: string;
  kind: string;
}
interface ReportRow {
  id: string;
  account_id: string;
  title: string;
  environment: string;
  team_id: string;
  to_account_id: string;
  created: string;
  updated: string;
}
interface VerdictRow {
  guide_id: string;
  ok: number;
  note: string;
  at: string;
  handle: string;
}
interface AckRow {
  guide_id: string;
  account_id: string;
  taken: number;
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

/**
 * Who has answered "are you doing this?", newest first, for a page of guides.
 *
 * Shaped exactly like `verdicts()` above because it is the same kind of fact — the reader's, not
 * the author's, and one standing answer per person.
 */
async function acks(c: { env: Env }, rows: GuideRow[]): Promise<Map<string, AckRow[]>> {
  const map = new Map<string, AckRow[]>();
  if (!rows.length) return map;
  const { results } = await db(c)
    .prepare(
      `SELECT k.guide_id, k.account_id, k.taken, k.note, k.at, COALESCE(a.handle, '') AS handle
       FROM ack k LEFT JOIN account a ON a.id = k.account_id
       WHERE k.guide_id IN (${rows.map(() => "?").join(",")})
       ORDER BY k.at DESC LIMIT 200`,
    )
    .bind(...rows.map((r) => r.id))
    .all<AckRow>();
  for (const k of results) map.set(k.guide_id, [...(map.get(k.guide_id) || []), k]);
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
  const answered = await acks(c, rows);
  // A row that belongs to a report says so by name, not by id: "part of Pre-release sweep" is a
  // link someone follows, and a bare eight characters is not.
  const reportIds = [...new Set(rows.map((r) => r.report_id).filter(Boolean))];
  const reportTitles = new Map<string, string>();
  if (reportIds.length) {
    const { results } = await c.env.DB.prepare(
      `SELECT id, title FROM report WHERE id IN (${reportIds.map(() => "?").join(",")})`,
    )
      .bind(...reportIds)
      .all<{ id: string; title: string }>();
    for (const row of results) reportTitles.set(row.id, row.title);
  }
  return rows.map((r) => {
    const heard = said.get(r.id) || [];
    // The latest word, plus whether anyone's standing verdict is still negative.
    const latest = heard[0];
    const answers = answered.get(r.id) || [];
    const own = answers.find((k) => k.account_id === me);
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      created: r.created,
      updated: r.updated,
      source_context: r.source_context,
      // Normalised on the way out as well as the way in: a guide stored before there was a rule
      // has its old spelling in the column until its author publishes it again.
      tags: tagList(JSON.parse(r.tags)),
      stack_assumptions: JSON.parse(r.stack) as string[],
      pulls: r.pulls,
      url: shareUrl(base, r),
      mine: r.account_id === me,
      from: people.get(r.account_id)?.handle || "",
      team: teams.get(r.team_id)?.slug || "",
      to: people.get(r.to_account_id)?.handle || "",
      for_me: r.to_account_id === me,
      report: r.report_id || "",
      report_title: reportTitles.get(r.report_id) || "",
      area: r.area || "",
      severity: r.severity || "",
      // Empty means transfer, which is what every guide written before bug reports existed is.
      kind: r.kind || "transfer",
      verdict: latest
        ? { ok: Boolean(latest.ok), by: latest.handle, note: latest.note, at: latest.at }
        : null,
      failing: heard.some((v) => !v.ok),
      // The first word back, before any work: who said they are on it, and who passed. A decline
      // is carried in full — the reason is the whole reason to say no out loud, exactly as it is
      // for a failing verdict.
      taken_by: answers.filter((k) => k.taken).map((k) => k.handle || "someone"),
      declined: answers
        .filter((k) => !k.taken)
        .map((k) => ({ by: k.handle, note: k.note, at: k.at })),
      // Your own standing answer, so the row can offer the other one rather than asking again.
      my_ack: own ? { taken: Boolean(own.taken), note: own.note, at: own.at } : null,
      pulled_by: (pulls.get(r.id) || []).map((p) => ({
        handle: p.handle,
        via: p.via,
        at: p.at,
      })),
    };
  });
}

// ---- auth -------------------------------------------------------------------------------

// Open routes: creating an account, and the three that exist precisely because you cannot
// authenticate yet.
const PUBLIC = new Set([
  // A description of the API is not a use of it, and an agent platform fetches this before it has
  // anywhere to put a credential.
  "GET /v1/openapi.json",
  // The token endpoint proves the client to itself, with PKCE or a client secret. It cannot sit
  // behind the credential it exists to issue.
  "POST /v1/oauth/token",
  // RFC 7009: a client handing a credential back must never be refused for not having one. Being
  // told no here would leave the token live, which is the opposite of what was asked for.
  "POST /v1/oauth/revoke",
  "POST /v1/accounts",
  "POST /v1/auth/signup",
  "POST /v1/auth/login",
  "POST /v1/auth/forgot",
  "POST /v1/auth/reset",
]);

/**
 * Reading one screenshot, which cannot be in `PUBLIC` because the path carries an id.
 *
 * A screenshot is evidence inside a guide, and a guide travels as markdown to anyone holding its
 * share key. An image behind a login does not render in the document it was pasted into — it
 * renders as a broken image, for the reader the evidence was for. The id is the secret, which is
 * the same bargain the share key already makes.
 */
const publicShot = (method: string, path: string) =>
  method === "GET" && /^\/v1\/shots\/[a-z0-9]+$/.test(path);

/**
 * How the app tells its own dispatch apart from a request off the wire.
 *
 * The MCP tools work by calling this app's routes — one implementation of every rule, and it is
 * the route — but those calls are not new requests from a client. The caller was authenticated at
 * `/v1/mcp` before any tool ran, and re-presenting their credential on the inner call meant a
 * connector's token, scoped to the MCP endpoint, was refused by the scope check the moment a tool
 * reached `/v1/inbox`. Which is to say: with a connector, every tool failed.
 *
 * A symbol on the Request object, not a header. A header can be sent by anyone; a module-local
 * symbol cannot cross an HTTP boundary at all — the only way to have it is to be the code that put
 * it there.
 */
const INTERNAL = Symbol("passalong.internal.account");

type Marked = Record<symbol, unknown>;

/** Dispatch a request as an account this app has already authenticated. */
function asAccount(request: Request, account: string): Request {
  (request as unknown as Marked)[INTERNAL] = account;
  return request;
}

/**
 * A 401 that says which authorization server can fix it.
 *
 * RFC 9728: without this header a client that has no token knows only that it was refused. With
 * it, it can find the metadata, discover the endpoints and start a flow — which is what turns the
 * MCP endpoint into something a connector can be pointed at rather than something that has to be
 * explained.
 */
function unauthorizedResource(base: string, error: string, description: string): Response {
  return new Response(JSON.stringify({ message: description }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate":
        `Bearer realm="passalong", error="${error}", error_description="${description}", ` +
        `resource_metadata="${base}/.well-known/oauth-protected-resource"`,
    },
  });
}

/** Either credential proves the same thing, so every route below is unchanged by having two. */
app.use("/v1/*", async (c, next) => {
  // The app calling itself for someone it already authenticated. Checked first, because there is
  // nothing left to check: the credential was verified at the boundary this came from.
  const internal = (c.req.raw as unknown as Marked)[INTERNAL];
  if (typeof internal === "string" && internal) {
    c.set("account", internal);
    return next();
  }
  if (PUBLIC.has(`${c.req.method} ${c.req.path}`)) return next();
  if (publicShot(c.req.method, c.req.path)) return next();

  const auth = c.req.header("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  // An OAuth access token, held by a connector rather than pasted by a person. It reaches what its
  // scope names and nothing else — which is the whole reason a connector gets one of these instead
  // of a copy of your API token.
  if (token.startsWith("pa_at_")) {
    const grant = await grantFor(c.env.DB, token);
    if (!grant) return unauthorizedResource(origin(c), "invalid_token", "token expired or revoked");
    if (grant.scope !== MCP_SCOPE || c.req.path !== "/v1/mcp") {
      return unauthorizedResource(
        origin(c),
        "insufficient_scope",
        `this grant reaches ${grant.scope} only`,
      );
    }
    c.executionCtx.waitUntil(
      c.env.DB.prepare("UPDATE oauth_token SET last_used = ? WHERE access_hash = ?")
        .bind(now(), grant.access_hash)
        .run()
        .then(
          () => {},
          () => {},
        ),
    );
    c.set("account", grant.account_id);
    return next();
  }

  if (token) {
    const row = await c.env.DB.prepare(
      "SELECT id, account_id FROM token WHERE hash = ? AND revoked = ''",
    )
      .bind(await sha256(token))
      .first<{ id: string; account_id: string }>();
    if (!row) {
      return c.req.path === "/v1/mcp"
        ? unauthorizedResource(origin(c), "invalid_token", "token not recognized, or revoked")
        : err(c, 401, "token not recognized, or revoked — mint a new one in your hub");
    }
    c.set("account", row.account_id);
    // Best effort, off the response path: knowing a token is unused is what makes it safe to
    // revoke. `executionCtx` throws where there is none, so this never speaks for itself.
    try {
      c.executionCtx.waitUntil(
        c.env.DB.prepare("UPDATE token SET last_used = ? WHERE id = ?").bind(now(), row.id).run(),
      );
    } catch {}
    return next();
  }

  const sid = readCookie(c.req.header("cookie"), SESSION_COOKIE);
  if (sid) {
    const row = await c.env.DB.prepare(
      "SELECT account_id FROM session WHERE hash = ? AND expires > ?",
    )
      .bind(await sha256(sid), now())
      .first<{ account_id: string }>();
    if (!row) return err(c, 401, "session expired — sign in again");
    c.set("account", row.account_id);
    return next();
  }
  // A client with no credential at all is the ordinary first request to an MCP endpoint. Answering
  // it with a bare 401 tells it only that it was refused; answering with the challenge tells it
  // which authorization server can fix that, which is the whole point of publishing the metadata.
  if (c.req.path === "/v1/mcp") {
    return unauthorizedResource(origin(c), "invalid_request", "authorization required");
  }
  return err(c, 401, "not signed in — sign in at /hub, or send a token from your hub");
});

async function startSession(c: Ctx, account: string): Promise<string> {
  const sid = rand(40);
  await db(c)
    .prepare("INSERT INTO session (hash, account_id, created, expires) VALUES (?, ?, ?, ?)")
    .bind(await sha256(sid), account, now(), sessionExpiry())
    .run();
  return sessionCookie(sid, c.req.url);
}

app.post("/v1/accounts", async (c) => {
  if (c.env.ACCOUNT_LIMIT) {
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const { success } = await c.env.ACCOUNT_LIMIT.limit({ key: ip });
    if (!success)
      return err(c, 429, "too many accounts created from this address; try again in a minute");
  }
  const id = rid(10);
  const token = `pa_${rand(32)}`;
  await c.env.DB.batch([
    // token_hash is the retired identity column: NOT NULL UNIQUE, read by nothing. See 0005.
    c.env.DB.prepare("INSERT INTO account (id, created, token_hash) VALUES (?, ?, ?)").bind(
      id,
      now(),
      `retired:${rid(24)}`,
    ),
    c.env.DB.prepare(
      "INSERT INTO token (id, account_id, name, hash, created) VALUES (?, ?, ?, ?, ?)",
    ).bind(rid(10), id, "first token", await sha256(token), now()),
  ]);
  count(c, "account_created", { kind: "anonymous" });
  return c.json({ account: id, token }, 201);
});

// ---- signing in -------------------------------------------------------------------------

const cred = async (c: { req: { json: () => Promise<unknown> } }) => {
  const b = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  return { email: (b.email || "").trim().toLowerCase(), password: b.password || "" };
};

/** Same shape whatever went wrong: which half of a login failed is not the caller's business. */
const BAD_LOGIN = "email or password is wrong";

/** Every place a password is set runs the same two checks: long enough, and not already public. */
async function passwordRefusal(password: string): Promise<string | null> {
  const problem = passwordProblem(password);
  if (problem) return problem;
  if (await isBreached(password))
    return "that password appears in a public breach list — please pick another";
  return null;
}

app.post("/v1/auth/signup", async (c) => {
  if (c.env.ACCOUNT_LIMIT) {
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const { success } = await c.env.ACCOUNT_LIMIT.limit({ key: ip });
    if (!success) return err(c, 429, "too many sign-ups from this address; try again in a minute");
  }
  const { email, password } = await cred(c);
  if (!EMAIL_RE.test(email)) return err(c, 400, "that does not look like an email address");
  const refusal = await passwordRefusal(password);
  if (refusal) return err(c, 400, refusal);
  const taken = await c.env.DB.prepare("SELECT id FROM account WHERE email = ?")
    .bind(email)
    .first();
  if (taken) return err(c, 409, "an account already uses that email — sign in instead");

  const id = rid(10);
  await c.env.DB.prepare(
    "INSERT INTO account (id, created, email, password_hash, token_hash) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, now(), email, await hashPassword(password), `retired:${rid(24)}`)
    .run();
  count(c, "account_created", { kind: "password" });
  return c.json({ account: id, email }, 201, { "set-cookie": await startSession(c, id) });
});

app.post("/v1/auth/login", async (c) => {
  const { email, password } = await cred(c);
  const row = await c.env.DB.prepare(
    "SELECT id, password_hash FROM account WHERE email = ? AND password_hash <> ''",
  )
    .bind(email)
    .first<{ id: string; password_hash: string }>();
  // Hash anyway when there is no such account, so a missing email is not faster than a wrong
  // password.
  const ok = await verifyPassword(password, row ? row.password_hash : await decoyHash());
  if (!row || !ok) return err(c, 401, BAD_LOGIN);
  return c.json({ account: row.id }, 200, { "set-cookie": await startSession(c, row.id) });
});

app.post("/v1/auth/logout", async (c) => {
  const sid = readCookie(c.req.header("cookie"), SESSION_COOKIE);
  if (sid)
    await c.env.DB.prepare("DELETE FROM session WHERE hash = ?")
      .bind(await sha256(sid))
      .run();
  return c.json({ ok: true }, 200, { "set-cookie": clearCookie(c.req.url) });
});

/**
 * Claiming an account, or changing the password on one. Anonymous accounts — the ones `passalong
 * login` and invite links create — start with no email and no password; this is how they become
 * something you can sign in to.
 */
app.post("/v1/auth/password", async (c) => {
  const account = c.get("account");
  const { email, password } = await cred(c);
  const me = await c.env.DB.prepare("SELECT email, password_hash FROM account WHERE id = ?")
    .bind(account)
    .first<{ email: string; password_hash: string }>();
  const refusal = await passwordRefusal(password);
  if (refusal) return err(c, 400, refusal);
  const address = email || me?.email || "";
  if (!EMAIL_RE.test(address)) return err(c, 400, "an email is needed to sign in with a password");
  if (address !== me?.email) {
    const taken = await c.env.DB.prepare("SELECT id FROM account WHERE email = ? AND id <> ?")
      .bind(address, account)
      .first();
    if (taken) return err(c, 409, "an account already uses that email");
  }
  await c.env.DB.prepare("UPDATE account SET email = ?, password_hash = ? WHERE id = ?")
    .bind(address, await hashPassword(password), account)
    .run();
  // Changing a password ends every other session; a stolen one should not outlive the change.
  await c.env.DB.prepare("DELETE FROM session WHERE account_id = ?").bind(account).run();
  return c.json({ email: address }, 200, { "set-cookie": await startSession(c, account) });
});

app.post("/v1/auth/forgot", async (c) => {
  const { email } = await cred(c);
  const row = await c.env.DB.prepare("SELECT id FROM account WHERE email = ? AND email <> ''")
    .bind(email)
    .first<{ id: string }>();
  if (row) {
    const code = rand(40);
    await c.env.DB.prepare(
      "INSERT INTO reset (hash, account_id, created, expires) VALUES (?, ?, ?, ?)",
    )
      .bind(
        await sha256(code),
        row.id,
        now(),
        new Date(Date.now() + 3600e3).toISOString(), // an hour is long enough to read an email
      )
      .run();
    await sendReset(c.env, { to: email, url: `${origin(c)}/reset#${code}` });
  }
  // Always the same answer: this endpoint must not say whether an address has an account.
  return c.json({ sent: true });
});

app.post("/v1/auth/reset", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { code?: string; password?: string };
  const refusal = await passwordRefusal(b.password || "");
  if (refusal) return err(c, 400, refusal);
  const hash = await sha256(b.code || "");
  const row = await c.env.DB.prepare(
    "SELECT account_id FROM reset WHERE hash = ? AND used = '' AND expires > ?",
  )
    .bind(hash, now())
    .first<{ account_id: string }>();
  if (!row) return err(c, 400, "that reset link has expired or already been used");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE account SET password_hash = ? WHERE id = ?").bind(
      await hashPassword(b.password as string),
      row.account_id,
    ),
    c.env.DB.prepare("UPDATE reset SET used = ? WHERE hash = ?").bind(now(), hash),
    // Whoever was signed in before the reset should not still be.
    c.env.DB.prepare("DELETE FROM session WHERE account_id = ?").bind(row.account_id),
  ]);
  return c.json({ ok: true }, 200, { "set-cookie": await startSession(c, row.account_id) });
});

// ---- tokens -----------------------------------------------------------------------------

// A token is a credential for one CLI or MCP server, not the account. Named so you can tell them
// apart, and revocable so a leaked laptop does not cost you everything.
app.get("/v1/tokens", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, created, last_used FROM token
     WHERE account_id = ? AND revoked = '' ORDER BY created DESC`,
  )
    .bind(c.get("account"))
    .all();
  return c.json({ tokens: results });
});

app.post("/v1/tokens", async (c) => {
  const { name } = (await c.req.json().catch(() => ({}))) as { name?: string };
  const label = (name || "").trim().slice(0, 60) || "untitled";
  const token = `pa_${rand(32)}`;
  const id = rid(10);
  await c.env.DB.prepare(
    "INSERT INTO token (id, account_id, name, hash, created) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, c.get("account"), label, await sha256(token), now())
    .run();
  // The only time the plaintext exists outside the caller's machine.
  return c.json({ id, name: label, token }, 201);
});

app.delete("/v1/tokens/:id", async (c) => {
  const { meta } = await c.env.DB.prepare(
    "UPDATE token SET revoked = ? WHERE id = ? AND account_id = ? AND revoked = ''",
  )
    .bind(now(), c.req.param("id"), c.get("account"))
    .run();
  if (!meta.changes) return err(c, 404, "no such token");
  return c.json({ id: c.req.param("id"), revoked: true });
});

// ---- identity ---------------------------------------------------------------------------

app.get("/v1/me", async (c) => {
  const account = c.get("account");
  const me = await c.env.DB.prepare(
    "SELECT id, handle, name, email, password_hash FROM account WHERE id = ?",
  )
    .bind(account)
    .first<AccountRow & { password_hash: string }>();
  const room = await quota(c, account);
  const teams = (await myTeams(c)).map((t) => ({ slug: t.slug, name: t.name, role: t.role }));
  return c.json({
    account,
    handle: me?.handle || "",
    name: me?.name || "",
    email: me?.email || "",
    teams,
    // What is counted, not what exists: an archived guide takes up no room, so a warning drawn
    // from a total would have told people to delete things that were already out of the way.
    guides: room.used,
    limit: room.limit,
    unread: await unreadCount(c.env, account),
    // Whether this account can be signed in to, so the hub can offer to claim an anonymous one.
    // Never the hash itself.
    has_password: Boolean(me?.password_hash),
  });
});

/**
 * What this account has used of the free tier, and its ceiling.
 *
 * One function, two callers — `/v1/me`, which draws the warning, and the publish path, which
 * refuses the share. They were separate queries counting different things, so the interface
 * warned at a number the server did not enforce.
 */
async function quota(c: Ctx, account: string): Promise<{ used: number; limit: number }> {
  const marks = COUNTED.map(() => "?").join(", ");
  const row = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM guide WHERE account_id = ? AND status IN (${marks})) AS used,
            (SELECT sync_limit FROM account WHERE id = ?) AS own`,
  )
    .bind(account, ...COUNTED, account)
    .first<{ used: number; own: number }>();
  return {
    used: row?.used ?? 0,
    limit: limitFor(row?.own, c.env.FREE_SYNC_LIMIT),
  };
}

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
  const id = rid(10);
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO team (id, slug, name, created_by, created) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, slug, clean, account, t),
    c.env.DB.prepare(
      "INSERT INTO membership (team_id, account_id, role, joined) VALUES (?, ?, 'owner', ?)",
    ).bind(id, account, t),
  ]);
  count(c, "team_created");
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
  const chCount = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM team_channel WHERE team_id = ?")
    .bind(team.id)
    .first<{ n: number }>();
  return c.json({
    slug: team.slug,
    name: team.name,
    role: team.role,
    created: team.created,
    members,
    guides: n?.n ?? 0,
    channels: chCount?.n ?? 0,
  });
});

/**
 * A team's channels. Owners only, because a channel is a credential for a room.
 *
 * The URL is never read back — anyone holding it can post there, so it is written and then only
 * ever named. What the screen gets instead is whether each one is currently failing, which is the
 * question a list of channels actually has to answer.
 */
app.get("/v1/teams/:slug/channels", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "no such team, or you are not a member");
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, created, failures, last_error, substr(url, 1, 40) AS hint
     FROM team_channel WHERE team_id = ? ORDER BY created`,
  )
    .bind(team.id)
    .all();
  // A leading fragment, not the URL: enough to tell two channels apart at a glance, far short of
  // enough to post to either.
  return c.json({
    channels: results.map((r) => {
      const row = r as Record<string, unknown>;
      const hint = String(row.hint || "");
      let host = "";
      try {
        host = new URL(`${hint}`).hostname;
      } catch {
        host = "";
      }
      return { ...row, hint: undefined, host };
    }),
  });
});

app.post("/v1/teams/:slug/channels", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "no such team, or you are not a member");
  if (team.role !== "owner") return err(c, 403, "only an owner can change the team's channels");
  const body = await c.req
    .json<{ name?: string; url?: string }>()
    .catch(() => ({}) as { name?: string; url?: string });

  const url = String(body.url ?? "").trim();
  if (!webhookAllowed(url)) {
    return err(c, 400, "the channel URL must be https, with no credentials in it");
  }
  const { n } = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM team_channel WHERE team_id = ?")
    .bind(team.id)
    .first<{ n: number }>()) ?? { n: 0 };
  if (n >= 8) return err(c, 400, "a team keeps up to 8 channels; remove one first");

  const id = rid(12);
  await c.env.DB.prepare(
    "INSERT INTO team_channel (id, team_id, name, url, created, created_by) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, team.id, String(body.name || "").slice(0, 60), url, now(), c.get("account"))
    .run();
  return c.json({ channel: { id, name: body.name || "" } }, 201);
});

app.delete("/v1/teams/:slug/channels/:id", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "no such team, or you are not a member");
  if (team.role !== "owner") return err(c, 403, "only an owner can change the team's channels");
  const { meta } = await c.env.DB.prepare("DELETE FROM team_channel WHERE id = ? AND team_id = ?")
    .bind(c.req.param("id"), team.id)
    .run();
  if (!meta.changes) return err(c, 404, "no such channel");
  return c.json({ id: c.req.param("id"), removed: true });
});

/** Post a line to one channel so someone can watch it arrive. Owners only. */
app.post("/v1/teams/:slug/channels/:id/test", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "no such team, or you are not a member");
  if (team.role !== "owner") return err(c, 403, "only an owner can test the team's channels");
  const channel = await c.env.DB.prepare(
    "SELECT id, url, failures FROM team_channel WHERE id = ? AND team_id = ?",
  )
    .bind(c.req.param("id"), team.id)
    .first<{ id: string; url: string; failures: number }>();
  if (!channel) return err(c, 404, "no such channel");
  const result = await post(
    c.env,
    channel,
    `Passalong is connected to ${team.slug}. Verdicts and handoffs will arrive here.`,
  );
  // The channel's own answer, because "it did not arrive" is otherwise unattributable.
  return c.json({ delivered: result.ok, status: result.status, error: result.error });
});

app.post("/v1/teams/:slug/invites", async (c) => {
  const account = c.get("account");
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "no such team, or you are not a member");
  const { email } = (await c.req.json().catch(() => ({}))) as { email?: string };
  const to = (email || "").trim().toLowerCase();
  if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return err(c, 400, "email does not look valid");
  const code = rid(12);
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
    count(c, "member_joined");
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

// ---- evidence ---------------------------------------------------------------------------

/**
 * A screenshot, stored so a guide can point at it.
 *
 * Evidence has to outlive the browser tab it was dropped into: a guide travels as markdown, an
 * image in markdown is a URL, and a `blob:` URL is meaningless to everyone but the person who
 * made it. So the bytes go in R2 and the issue's markdown carries `![alt](<origin>/v1/shots/id)`,
 * which the guide page already renders as a figure and its CSP already allows.
 *
 * The upload is raw bytes with a content-type, not multipart: there is one file per request and
 * parsing a multipart body to find it would be work in service of nothing.
 */
const SHOT_MAX = 5 * 1024 * 1024;

/**
 * Point a document's screenshots at it, and let go of any it no longer carries.
 *
 * Run on every write, because the document is what decides. `account_id` in the WHERE is the load
 * bearing part: without it, naming someone else's shot id in your own markdown would claim their
 * image, and deleting your guide would then delete it.
 */
async function claimShots(c: Ctx, account: string, guide: string, markdown: string) {
  const ids = shotIds(markdown);
  const holes = ids.map(() => "?").join(",");
  const statements = ids.length
    ? [
        c.env.DB.prepare(
          `UPDATE shot SET guide_id = ? WHERE account_id = ? AND id IN (${holes})`,
        ).bind(guide, account, ...ids),
        // An edit that drops an image releases it. It becomes an orphan rather than being
        // deleted here: the same upload can be referenced by a second guide, and a write is the
        // wrong moment to decide nobody wants a file.
        c.env.DB.prepare(
          `UPDATE shot SET guide_id = '' WHERE guide_id = ? AND id NOT IN (${holes})`,
        ).bind(guide, ...ids),
      ]
    : [c.env.DB.prepare("UPDATE shot SET guide_id = '' WHERE guide_id = ?").bind(guide)];
  await c.env.DB.batch(statements);
}

/**
 * Take a guide's evidence with it.
 *
 * R2 first: a bucket object with no row is invisible to everything and costs storage, while a row
 * with no object is a broken image on a page. If the delete half-fails, the second failure mode is
 * the one that is still recoverable.
 */
async function dropShots(c: Ctx, guide: string) {
  const { results } = await c.env.DB.prepare("SELECT id, type FROM shot WHERE guide_id = ?")
    .bind(guide)
    .all<{ id: string; type: string }>();
  if (!results.length) return;
  const bucket = c.env.SHOTS;
  if (bucket) {
    await bucket.delete(results.map((r) => shotKey(r.id, r.type))).catch(() => {
      // The rows go anyway. An object nothing points at is waste; a row pointing at nothing
      // that is gone would be worse.
    });
  }
  await c.env.DB.prepare("DELETE FROM shot WHERE guide_id = ?").bind(guide).run();
}

app.post("/v1/shots", async (c) => {
  const account = c.get("account");
  const bucket = c.env.SHOTS;
  if (!bucket) return err(c, 501, "this deployment has no screenshot storage configured");

  const type = (c.req.header("content-type") || "").split(";")[0]?.trim() || "";
  const ext = SHOT_TYPES[type];
  if (!ext) return err(c, 415, `screenshots must be ${Object.keys(SHOT_TYPES).join(", ")}`);

  const body = await c.req.arrayBuffer();
  if (!body.byteLength) return err(c, 400, "empty upload");
  if (body.byteLength > SHOT_MAX) return err(c, 413, "screenshots are capped at 5MB");

  const id = rid(12);
  await bucket.put(shotKey(id, type), body, { httpMetadata: { contentType: type } });
  await c.env.DB.prepare(
    "INSERT INTO shot (id, account_id, guide_id, name, type, bytes, created) VALUES (?, ?, '', ?, ?, ?, ?)",
  )
    .bind(
      id,
      account,
      String(c.req.header("x-shot-name") || "").slice(0, 120),
      type,
      body.byteLength,
      now(),
    )
    .run();
  return c.json(
    { shot: { id, url: `${origin(c)}/v1/shots/${id}`, type, bytes: body.byteLength } },
    201,
  );
});

/**
 * Served to anyone with the link, like the guide that embeds it. The id is the secret — a guide's
 * share key is the same bargain, and an image behind a login is an image that does not render in
 * the markdown the guide was pasted into.
 */
app.get("/v1/shots/:id", async (c) => {
  const bucket = c.env.SHOTS;
  const id = c.req.param("id");
  if (!bucket || !/^[a-z0-9]{6,16}$/.test(id)) return c.notFound();
  const row = await c.env.DB.prepare("SELECT type FROM shot WHERE id = ?")
    .bind(id)
    .first<{ type: string }>();
  if (!row) return c.notFound();
  const object = await bucket.get(shotKey(id, row.type));
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      "content-type": row.type,
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
});

// ---- reports ----------------------------------------------------------------------------

/**
 * A report is a parent, and deliberately little else: a title, an environment, and who it went
 * to. Everything a reader acts on lives on the issues, because an issue is a guide and the whole
 * product already knows what to do with one.
 *
 * It exists at all for two reasons a tag could not cover: a set handed over together should
 * arrive together, and "6 issues across 3 areas" should survive one of them being fixed.
 */
app.post("/v1/reports", async (c) => {
  const account = c.get("account");
  const body = await c.req
    .json<{
      title?: string;
      environment?: string;
      team?: string;
      to?: string;
    }>()
    .catch(() => ({}) as Record<string, string>);

  let team: (TeamRow & { role: string }) | null = null;
  let toAccount: AccountRow | null = null;
  if (body.team) {
    team = await teamBySlug(c, String(body.team));
    if (!team) return err(c, 400, `you are not in a team called "${body.team}"`);
  }
  if (body.to) {
    const handle = String(body.to).replace(/^@/, "").toLowerCase();
    if (!team) return err(c, 400, "`to` needs a `team` — a report goes to a teammate");
    toAccount = await c.env.DB.prepare(
      `SELECT a.id, a.handle, a.name, a.email FROM account a JOIN membership m ON m.account_id = a.id
       WHERE a.handle = ? AND m.team_id = ?`,
    )
      .bind(handle, team.id)
      .first<AccountRow>();
    if (!toAccount) return err(c, 400, `@${handle} is not a member of ${team.slug}`);
  }

  const id = rid(8);
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO report (id, account_id, title, environment, team_id, to_account_id, created, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      account,
      String(body.title || "").slice(0, 200),
      slug(body.environment, 16),
      team?.id || "",
      toAccount?.id || "",
      t,
      t,
    )
    .run();
  return c.json(
    { report: { id, title: body.title || "", environment: slug(body.environment, 16) } },
    201,
  );
});

/** One report and its issues, grouped the way they were filed. */
app.get("/v1/reports/:id", async (c) => {
  const account = c.get("account");
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return err(c, 400, "invalid report id");
  const row = await c.env.DB.prepare("SELECT * FROM report WHERE id = ?")
    .bind(id)
    .first<ReportRow>();
  // A report you cannot see is one that does not exist: which reports an account has is not
  // something a 403 should confirm.
  if (!row) return err(c, 404, "no such report");
  const mine = row.account_id === account;
  const teams = await myTeams(c);
  const shared = row.team_id && teams.some((t) => t.id === row.team_id);
  if (!mine && !shared) return err(c, 404, "no such report");

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM guide WHERE report_id = ? ORDER BY area, created",
  )
    .bind(id)
    .all<GuideRow>();
  return c.json({ report: await reportSummary(c, row, results) });
});

/**
 * The report's own fields, after the fact. Its issues are guides and are updated as guides; this
 * is only the parent — the title someone gave the sweep, and who it is for.
 */
app.patch("/v1/reports/:id", async (c) => {
  const account = c.get("account");
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return err(c, 400, "invalid report id");
  const row = await c.env.DB.prepare("SELECT * FROM report WHERE id = ?")
    .bind(id)
    .first<ReportRow>();
  if (!row || row.account_id !== account) return err(c, 404, "no such report");

  const body = await c.req
    .json<{ title?: string; environment?: string; team?: string; to?: string }>()
    .catch(() => ({}) as Record<string, string>);

  let team_id = row.team_id;
  let to_account_id = row.to_account_id;
  if (body.team !== undefined) {
    if (!body.team) {
      team_id = "";
      to_account_id = "";
    } else {
      const team = await teamBySlug(c, String(body.team));
      if (!team) return err(c, 400, `you are not in a team called "${body.team}"`);
      team_id = team.id;
    }
  }
  if (body.to !== undefined) {
    const handle = String(body.to).replace(/^@/, "").toLowerCase();
    if (!handle) to_account_id = "";
    else {
      if (!team_id) return err(c, 400, "`to` needs a `team` — a report goes to a teammate");
      const person = await c.env.DB.prepare(
        `SELECT a.id, a.handle, a.name, a.email FROM account a JOIN membership m ON m.account_id = a.id
         WHERE a.handle = ? AND m.team_id = ?`,
      )
        .bind(handle, team_id)
        .first<AccountRow>();
      if (!person) return err(c, 400, `@${handle} is not on that team`);
      to_account_id = person.id;
    }
  }

  await c.env.DB.prepare(
    "UPDATE report SET title = ?, environment = ?, team_id = ?, to_account_id = ?, updated = ? WHERE id = ?",
  )
    .bind(
      body.title === undefined ? row.title : String(body.title).slice(0, 200),
      body.environment === undefined ? row.environment : slug(body.environment, 16),
      team_id,
      to_account_id,
      now(),
      id,
    )
    .run();
  return c.body(null, 204);
});

/** Every report I filed, newest first, each with its counts. */
app.get("/v1/reports", async (c) => {
  const account = c.get("account");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM report WHERE account_id = ? ORDER BY created DESC LIMIT 50",
  )
    .bind(account)
    .all<ReportRow>();
  if (!results.length) return c.json({ reports: [] });
  const ids = results.map((r) => r.id);
  const { results: issues } = await c.env.DB.prepare(
    `SELECT * FROM guide WHERE report_id IN (${ids.map(() => "?").join(",")})`,
  )
    .bind(...ids)
    .all<GuideRow>();
  const reports = [];
  for (const row of results) {
    reports.push(
      await reportSummary(
        c,
        row,
        issues.filter((g) => g.report_id === row.id),
      ),
    );
  }
  return c.json({ reports });
});

/**
 * The shape both report routes answer with. Areas are a GROUP BY, not a table — the grouping is
 * derived from the issues every time, so removing the last issue in an area removes the area.
 */
async function reportSummary(c: Ctx, row: ReportRow, issues: GuideRow[]) {
  const teams = new Map((await myTeams(c)).map((t) => [t.id, t]));
  const people = await accounts(c, [row.account_id, row.to_account_id]);
  const summarised = await summaries(c, issues);
  const areas = new Map<string, typeof summarised>();
  for (const issue of summarised) {
    const key = issue.area || "";
    const bucket = areas.get(key);
    if (bucket) bucket.push(issue);
    else areas.set(key, [issue]);
  }
  return {
    id: row.id,
    title: row.title,
    environment: row.environment,
    created: row.created,
    updated: row.updated,
    mine: row.account_id === c.get("account"),
    from: people.get(row.account_id)?.handle || "",
    team: teams.get(row.team_id)?.slug || "",
    to: people.get(row.to_account_id)?.handle || "",
    issues: summarised.length,
    open: summarised.filter((i) => i.status === "draft").length,
    failing: summarised.filter((i) => i.failing).length,
    areas: [...areas].map(([area, list]) => ({ area, issues: list })),
  };
}

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
       -- Passing on something takes it off your board and puts it back on its author's. Saying
       -- "on it" does not: you still owe the work, so it stays where you will see it.
       AND id NOT IN (SELECT guide_id FROM ack WHERE account_id = ? AND taken = 0)
     -- Named beats dropped. Someone writing your handle chose you; a guide shared with a team you
     -- happen to be in chose nobody, and sorting both by age alone buried the one addressed to you
     -- under whatever else the team published today.
     ORDER BY CASE WHEN to_account_id = ? THEN 0 ELSE 1 END, created DESC LIMIT ?`,
  )
    .bind(account, account, ...ids, account, account, account, limit)
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
// Addressed to someone and still untouched by them. Named because the buckets below are tested in
// order and the first match wins (DESIGN_BRIEF §2), so the later ones have to say what they are
// not: each query carries the negation of every bucket above it rather than trusting the reader —
// or the CLI, or the agent tool — to apply the order themselves.
const IN_FLIGHT = `(g.to_account_id <> '' OR g.team_id <> '') AND NOT ${PULLED_BY_OTHERS}`;

app.get("/v1/board", async (c) => {
  const account = c.get("account");
  const mine = (sql: string, ...binds: unknown[]) =>
    c.env.DB.prepare(sql)
      .bind(account, ...binds)
      .all<GuideRow>();

  const [waiting, failing, flight, landed] = await Promise.all([
    inboxRows(c, 20),
    // Someone tried your work and it does not hold up. The most actionable thing on the page.
    mine(
      `SELECT g.* FROM guide g WHERE g.account_id = ? AND g.status = 'published' AND ${FAILING}
       ORDER BY g.updated DESC LIMIT 20`,
    ).then((r) => r.results),
    // Handed to a person or a team, and still untouched by anyone but you. A failed verdict wins
    // over "nobody has it yet": a verdict usually implies a pull row, but one left by the guide's
    // own author does not (recordReceipt skips itself), so without this guard a self-verdict of
    // { ok: false } on an unpulled guide would fill a card here and in `failing` at the same time.
    mine(
      `SELECT g.* FROM guide g WHERE g.account_id = ? AND g.status = 'published'
         AND ${IN_FLIGHT} AND NOT ${FAILING}
       ORDER BY g.created ASC LIMIT 20`,
    ).then((r) => r.results),
    // Someone else has it. This used to stop at three pulls, above which a guide moved to a
    // "worth keeping" queue of its own — but that was a counter with a bucket around it, and it
    // meant something nobody acts on. The pull count is on the row; being pulled by someone else
    // is itself the negation of `in_flight`, so this needs no separate guard against it.
    mine(
      `SELECT g.* FROM guide g WHERE g.account_id = ? AND g.status = 'published'
         AND ${PULLED_BY_OTHERS} AND NOT ${FAILING}
       ORDER BY g.updated DESC LIMIT 20`,
    ).then((r) => r.results),
  ]);

  // One summaries() pass over every row, then split back into buckets: the lookups it does
  // (teams, people, recent pulls) are per-call, not per-row.
  const all = [...waiting, ...failing, ...flight, ...landed];
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
    // Kept, always empty, for one release. `passalong board` in the published CLI reads
    // `b.promote.length` with no guard, so dropping the key outright makes an installed 0.1.0
    // throw rather than degrade. It goes when the CLI's own removal ships.
    promote: [] as ReturnType<typeof pick>,
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
  // The document, either as itself or wrapped in JSON.
  //
  // `text/markdown` is the honest shape and what the CLI sends: the guide *is* the body. But an
  // agent platform that builds its calls from an OpenAPI document — a ChatGPT action, Gemini
  // function calling — only knows how to send JSON, so without this the one route that publishes
  // anything is the one route those agents cannot reach.
  const sentJson =
    (c.req.header("content-type") || "").split(";")[0]?.trim() === "application/json";
  let markdown = "";
  if (sentJson) {
    const wrapper = await c.req.json<{ markdown?: unknown }>().catch(() => null);
    if (typeof wrapper?.markdown === "string") markdown = wrapper.markdown;
  } else {
    markdown = await c.req.text();
  }
  if (!markdown.trim()) {
    return err(
      c,
      400,
      sentJson
        ? 'empty guide; send {"markdown": "---\\ntitle: ...\\n---\\n\\n## Problem ..."}'
        : 'empty body; send the guide as text/markdown, or JSON as {"markdown": "..."}',
    );
  }
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

  // A report is the parent of a set of issues, and it is addressed as a unit: an issue can only
  // join a report the same account owns. Everything else about the issue — its own share key, its
  // own pull, its own verdict — is untouched by having a parent, which is the point of making an
  // issue a guide rather than a row inside one.
  let report: ReportRow | null = null;
  if (meta.report) {
    const wanted = String(meta.report);
    if (!ID_RE.test(wanted)) return err(c, 400, "`report:` is not a valid report id");
    report = await c.env.DB.prepare("SELECT * FROM report WHERE id = ?")
      .bind(wanted)
      .first<ReportRow>();
    if (!report) return err(c, 400, `no report called "${wanted}"`);
    if (report.account_id !== account) return err(c, 403, "that report belongs to another account");
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
    const room = await quota(c, account);
    if (isFull(room.used, room.limit)) {
      return err(
        c,
        402,
        `free tier keeps ${room.limit} active synced guides; archive some in the hub (or ` +
          "`passalong done <id>`) to make room, or remove them",
      );
    }
  }

  const base = origin(c);
  const share_key = existing?.share_key ?? rid(22);
  const url = shareUrl(base, { id, share_key });
  markdown = setField(markdown, "url", url);
  if (!meta.id) markdown = setField(markdown, "id", id);
  // `parseMeta` already normalised what it read, so this writes the one style back into the
  // document the author will pull again. It is a no-op when they already agree, which is every
  // publish after the first.
  markdown = setList(markdown, "tags", meta.tags);
  const t = now();
  const created = String(meta.created || existing?.created || t);

  await c.env.DB.prepare(
    `INSERT INTO guide (id, account_id, share_key, title, status, source_context, tags, stack, markdown, created, updated, team_id, to_account_id, report_id, area, severity, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status, source_context=excluded.source_context,
       tags=excluded.tags, stack=excluded.stack, markdown=excluded.markdown, updated=excluded.updated,
       team_id=excluded.team_id, to_account_id=excluded.to_account_id,
       report_id=excluded.report_id, area=excluded.area, severity=excluded.severity, kind=excluded.kind`,
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
      report?.id || "",
      slug(meta.area),
      slug(meta.severity, 8),
      slug(meta.kind, 16) === "bug" ? "bug" : "",
    )
    .run();

  await claimShots(c, account, id, markdown);

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
    if (team) {
      await announce(c.env, {
        kind: toAccount ? "handoff" : "shared",
        team_id: team.id,
        text: line({
          kind: toAccount ? "handoff" : "shared",
          actor: fromHandle,
          title: String(meta.title),
          team: toAccount ? `${team.slug} / @${toAccount.handle}` : team.slug,
          times: 1,
        }),
        url,
      });
    }
  }
  count(c, existing ? "guide_updated" : "guide_shared", {
    addressed: Boolean(toAccount),
    team: Boolean(team),
  });
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
  count(c as { env: Env }, "guide_pulled", { via, own: row.account_id === account });
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
  // Anything a person who is not the author does to a guide, its author hears about. Archiving
  // told them and un-archiving did not, which is the asymmetry that let a guide move on somebody
  // else's say-so in silence.
  if (!found.owner && status === "published") {
    await notify(c.env, {
      to: found.row.account_id,
      kind: "reopened",
      guide_id: found.row.id,
      actor_id: c.get("account"),
      team_id: found.row.team_id,
    });
  }
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
  // Once for the room, after once-per-person above. A failed verdict is the thing this product
  // exists to surface, and a channel is where a team sees it today rather than eventually.
  await announce(c.env, {
    kind: body.ok ? "verified" : "failed",
    team_id: found.row.team_id,
    text: line({
      kind: body.ok ? "verified" : "failed",
      actor: people.get(account)?.handle || "",
      title: found.row.title,
      team: "",
      times: 1,
      note,
    }),
    url: shareUrl(origin(c), found.row),
  });
  count(c, "verdict_given", { ok: body.ok });
  return c.json({ id: found.row.id, ok: body.ok, note });
});

/**
 * The receiver's first word back: "on it", or "not me, and here is why".
 *
 * This is the hop the product had no signal for. Between handing something over and someone
 * pulling it, the sender saw "in flight · not pulled yet" whether the receiver had queued it for
 * Thursday or never opened it — so the only way to tell was to go and ask.
 *
 * Declining requires a reason for the same reason a failing verdict does: "no" without "why"
 * leaves the sender exactly where the silence did. It is one line, not a thread.
 */
app.put("/v1/guides/:id/ack", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, "no such guide (or it is not in one of your teams)");
  const account = c.get("account");
  // The author is not a party to this. They can see who answered; answering their own handoff
  // would be telling themselves something they already know.
  if (found.owner) return err(c, 403, "this is the reader's answer; your own guide has none");
  const body = (await c.req.json().catch(() => ({}))) as { taken?: boolean; note?: string };
  if (typeof body.taken !== "boolean")
    return err(c, 400, "send { taken: true } to take it, or { taken: false } to pass");
  const note = (body.note || "").trim().slice(0, NOTE_MAX);
  if (!body.taken && !note)
    return err(c, 400, "say why you are passing: send a note with { taken: false }");

  await c.env.DB.prepare(
    `INSERT INTO ack (guide_id, account_id, taken, note, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guide_id, account_id) DO UPDATE SET taken = excluded.taken, note = excluded.note, at = excluded.at`,
  )
    .bind(found.row.id, account, body.taken ? 1 : 0, note, now())
    .run();

  const people = await accounts(c, [account, found.row.account_id]);
  const kind = body.taken ? "taken" : "declined";
  await notify(c.env, {
    to: found.row.account_id,
    kind,
    guide_id: found.row.id,
    actor_id: account,
    team_id: found.row.team_id,
    note,
  });
  // And once for the room. A guide nobody has taken is the thing a channel is for: it is work
  // that has stopped moving, and whoever picks it up is probably reading there.
  await announce(c.env, {
    kind,
    team_id: found.row.team_id,
    text: line({
      kind,
      actor: people.get(account)?.handle || "",
      title: found.row.title,
      team: "",
      times: 1,
      note,
    }),
    url: shareUrl(origin(c), found.row),
  });
  count(c, "guide_acked", { taken: body.taken });
  return c.json({ id: found.row.id, taken: body.taken, note });
});

app.delete("/v1/guides/:id", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, "no such guide");
  if (!found.owner) return err(c, 403, "only the author can remove a guide");
  // Before the guide, so a failure leaves the guide to try again rather than orphaning its
  // evidence with nothing left pointing at it.
  await dropShots(c, found.row.id);
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

// A guide's raw markdown is the owner's own text, but a share link is fetched by other people —
// and by agents. The CSP turns anything script-shaped in it inert instead of trusting a sanitizer.
// The same header on the rendered page now comes from apps/web's route rules (shared/csp.ts).
const VIEW_HEADERS = {
  "content-security-policy":
    "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' https: data:; manifest-src 'self'; base-uri 'none'; form-action 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

app.get("/g/:id/:key{.+\\.md}", async (c) => {
  const row = await shared(c, c.req.param("id"), c.req.param("key").replace(/\.md$/, ""));
  if (!row) return c.text("no such guide", 404);
  await recordPull(c, row, "", "link");
  return c.text(row.markdown, 200, {
    "content-type": "text/markdown; charset=utf-8",
    ...VIEW_HEADERS,
  });
});

// The unfurl card. Deliberately not counted as a pull: this is fetched by crawlers, not people.
// A miss answers with a bare 404 rather than the 404 *page* — this endpoint returns an image, and
// its caller is an unfurler that will never render HTML.
app.get("/g/:id/:key/og.png", async (c) => {
  const row = await shared(c, c.req.param("id"), c.req.param("key"));
  if (!row) return c.text("no such guide", 404, VIEW_HEADERS);
  return renderOgImage(c.env, c.req.url, { id: row.id, meta: parseMeta(row.markdown) });
});

/**
 * The API, described for agents that only speak HTTP — a ChatGPT action, Gemini function calling,
 * anything that cannot run `passalong mcp` because that is a local process. See openapi.ts for
 * what it deliberately leaves out.
 */
app.get("/v1/openapi.json", (c) =>
  c.json(openapi(origin(c)), 200, { "cache-control": "public, max-age=300" }),
);

/**
 * The MCP server at an address.
 *
 * `passalong mcp` is stdio and reaches only what can run a local process. This is the same tools
 * over HTTP, for assistants that add outside tools as remote servers.
 *
 * It sits under `/v1/` so the credential middleware above has already run: the bearer token that
 * authenticates every other call authenticates this one, and a tool never sees a request the API
 * would have refused. Each tool then dispatches back through this same app carrying that header,
 * so there is one implementation of every rule and it is the route.
 */
app.all("/v1/mcp", async (c) => {
  if (c.req.method !== "POST") {
    // No session and no server-initiated messages, so there is nothing for a GET stream or a
    // DELETE to do. Say which method works rather than answering an empty stream.
    return c.json({ message: "POST JSON-RPC to this endpoint" }, 405, { allow: "POST" });
  }
  const base = origin(c);
  const vocabulary = {
    areas: AREAS.map((a) => a.slug).join(", "),
    severities: SEVERITIES.map((s) => `${s.slug} ${s.label.toLowerCase()}`).join(", "),
  };
  return handleMcp(
    c.req.raw,
    async (method, path, body) => {
      const res = await app.fetch(
        asAccount(
          new Request(`${base}${path}`, {
            method,
            headers: body === undefined ? {} : { "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
          c.get("account"),
        ),
        c.env,
        c.executionCtx,
      );
      return { status: res.status, text: await res.text() };
    },
    vocabulary,
  );
});

// ---- oauth ---------------------------------------------------------------------------------

/**
 * Discovery. Both documents are public and neither is a use of the API: a client reads them before
 * it has any credential at all, which is the point.
 */
app.get("/.well-known/oauth-authorization-server", (c) =>
  c.json(authorizationServerMetadata(origin(c)), 200, { "cache-control": "public, max-age=300" }),
);
app.get("/.well-known/oauth-protected-resource", (c) =>
  c.json(protectedResourceMetadata(origin(c)), 200, { "cache-control": "public, max-age=300" }),
);
// Some clients look for the resource document beneath the resource's own path rather than at the
// host root. Answering both costs one line and saves a support conversation.
app.get("/.well-known/oauth-protected-resource/v1/mcp", (c) =>
  c.json(protectedResourceMetadata(origin(c)), 200, { "cache-control": "public, max-age=300" }),
);

/**
 * Where the client sends the person, and where the person says yes.
 *
 * This route does not render the consent screen — /oauth/consent does, as a page, because it needs
 * the session cookie and a person reading it. What happens here is only validation: refuse an
 * unusable request outright, and hand a usable one to the page with everything it needs.
 *
 * The redirect_uri is checked before anything is bounced back to it. Sending an error to an
 * unregistered address is how an authorization server becomes an open redirector.
 */
app.get("/oauth/authorize", async (c) => {
  const q = c.req.query();
  const client = q.client_id
    ? await c.env.DB.prepare("SELECT * FROM oauth_client WHERE id = ? AND revoked = ''")
        .bind(q.client_id)
        .first<OAuthClientRow>()
    : null;
  if (!client) return c.text("unknown client_id", 400);
  if (!redirectAllowed(client.redirect_uri, q.redirect_uri)) {
    return c.text("redirect_uri does not match the one registered for this client", 400);
  }
  const redirect = q.redirect_uri || client.redirect_uri;

  if (q.response_type !== "code") {
    return c.redirect(
      errorRedirect(redirect, q.state, "unsupported_response_type", "only `code` is supported"),
    );
  }
  if (!q.code_challenge || (q.code_challenge_method || "plain") !== "S256") {
    return c.redirect(
      errorRedirect(redirect, q.state, "invalid_request", "PKCE with S256 is required"),
    );
  }
  const url = new URL(`${origin(c)}/oauth/consent`);
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("client_name", client.name || client.id);
  return c.redirect(url.toString(), 302);
});

/**
 * The person approved. Mint the code.
 *
 * Session cookie only — never a bearer token. Approving a grant is something a person does in a
 * browser, and accepting an API token here would let one credential silently mint another.
 */
app.post("/v1/oauth/approve", async (c) => {
  // Session cookie only, checked here rather than assumed: the middleware above accepts either
  // credential, so without this an API token could mint a connector grant — one credential
  // quietly creating another, longer-lived one, which is the laundering this whole flow exists to
  // prevent. Approving is something a person does in a browser.
  if (!readCookie(c.req.header("cookie"), SESSION_COOKIE)) {
    return err(
      c,
      403,
      "approve a connector while signed in to your hub — a token cannot grant one",
    );
  }
  const account = c.get("account");
  type Approval = {
    client_id?: string;
    redirect_uri?: string;
    state?: string;
    code_challenge?: string;
  };
  const body = await c.req.json<Approval>().catch(() => ({}) as Approval);
  const client = body.client_id
    ? await c.env.DB.prepare("SELECT * FROM oauth_client WHERE id = ? AND revoked = ''")
        .bind(body.client_id)
        .first<OAuthClientRow>()
    : null;
  if (!client) return err(c, 400, "unknown client_id");
  if (!redirectAllowed(client.redirect_uri, body.redirect_uri)) {
    return err(c, 400, "redirect_uri does not match the one registered");
  }
  if (!body.code_challenge) return err(c, 400, "PKCE with S256 is required");

  const code = await issueCode(c.env.DB, {
    client_id: client.id,
    account_id: account,
    challenge: body.code_challenge,
    method: "S256",
    redirect_uri: body.redirect_uri || client.redirect_uri,
    scope: MCP_SCOPE,
  });
  const url = new URL(body.redirect_uri || client.redirect_uri);
  url.searchParams.set("code", code);
  if (body.state) url.searchParams.set("state", body.state);
  count(c, "oauth_granted", {});
  return c.json({ redirect: url.toString() });
});

/**
 * Code for tokens, or refresh for tokens.
 *
 * Public. The client proves itself here with PKCE, or with its secret if it was given one — which
 * is why this is the one `/v1/*` path outside the credential middleware.
 */
app.post("/v1/oauth/token", async (c) => {
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, string>);
  const field = (name: string) => String((form as Record<string, unknown>)[name] ?? "");

  // client_secret_basic puts the credentials in the header; client_secret_post puts them in the
  // body; a public client sends only its id. All three end up as the same two values.
  let clientId = field("client_id");
  let clientSecret = field("client_secret");
  const basic = c.req.header("authorization") || "";
  if (basic.startsWith("Basic ")) {
    const [id, secret] = atob(basic.slice(6)).split(":");
    clientId = decodeURIComponent(id || "");
    clientSecret = decodeURIComponent(secret || "");
  }

  const client = clientId
    ? await c.env.DB.prepare("SELECT * FROM oauth_client WHERE id = ? AND revoked = ''")
        .bind(clientId)
        .first<OAuthClientRow>()
    : null;
  if (!client) return c.json({ error: "invalid_client" }, 401);
  if (client.secret_hash && !timingSafeEqual(client.secret_hash, await sha256(clientSecret))) {
    return c.json({ error: "invalid_client" }, 401);
  }

  const grantType = field("grant_type");

  if (grantType === "refresh_token") {
    const presented = field("refresh_token");
    const row = await c.env.DB.prepare(
      "SELECT * FROM oauth_token WHERE refresh_hash = ? AND client_id = ?",
    )
      .bind(await sha256(presented), client.id)
      .first<{ access_hash: string; account_id: string; scope: string }>();
    if (!row) return c.json({ error: "invalid_grant" }, 400);
    // Rotation: the old pair goes as the new one is written, so a refresh token is worth one use.
    return c.json(
      await issueTokens(
        c.env.DB,
        { client_id: client.id, account_id: row.account_id, scope: row.scope },
        row.access_hash,
      ),
    );
  }

  if (grantType !== "authorization_code") {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }

  const row = await c.env.DB.prepare("SELECT * FROM oauth_code WHERE code = ?")
    .bind(await sha256(field("code")))
    .first<{
      code: string;
      client_id: string;
      account_id: string;
      challenge: string;
      redirect_uri: string;
      scope: string;
      expires: string;
      redeemed: string;
    }>();
  if (!row || row.client_id !== client.id) return c.json({ error: "invalid_grant" }, 400);
  if (row.redeemed || row.expires <= now()) return c.json({ error: "invalid_grant" }, 400);
  if (field("redirect_uri") && !timingSafeEqual(row.redirect_uri, field("redirect_uri"))) {
    return c.json({ error: "invalid_grant" }, 400);
  }
  if (!(await pkceMatches(field("code_verifier"), row.challenge))) {
    return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
  }

  // Spent before the tokens exist: a code that races itself redeems once.
  await c.env.DB.prepare("UPDATE oauth_code SET redeemed = ? WHERE code = ? AND redeemed = ''")
    .bind(now(), row.code)
    .run();
  count(c, "oauth_token_issued", {});
  return c.json(
    await issueTokens(c.env.DB, {
      client_id: client.id,
      account_id: row.account_id,
      scope: row.scope,
    }),
  );
});

/** Hand a token back. Public, per RFC 7009: a client giving up a credential should never be told no. */
app.post("/v1/oauth/revoke", async (c) => {
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, string>);
  const token = String((form as Record<string, unknown>).token ?? "");
  if (token) {
    const hash = await sha256(token);
    await c.env.DB.prepare("DELETE FROM oauth_token WHERE access_hash = ? OR refresh_hash = ?")
      .bind(hash, hash)
      .run();
  }
  return c.body(null, 200);
});

/** The clients you have registered, and what each one is currently holding. */
app.get("/v1/oauth/clients", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.redirect_uri, c.created, c.secret_hash <> '' AS confidential,
            (SELECT COUNT(*) FROM oauth_token t WHERE t.client_id = c.id) AS grants
     FROM oauth_client c WHERE c.account_id = ? AND c.revoked = '' ORDER BY c.created DESC`,
  )
    .bind(c.get("account"))
    .all();
  return c.json({ clients: results });
});

/**
 * Register a connector.
 *
 * The secret is optional and the default is not to have one: a public client with PKCE is the
 * better shape when the "client" is a configuration form in somebody else's product. When one is
 * asked for it is shown once, like every other credential here.
 */
app.post("/v1/oauth/clients", async (c) => {
  const account = c.get("account");
  type NewClient = { name?: string; redirect_uri?: string; confidential?: boolean };
  const body = await c.req.json<NewClient>().catch(() => ({}) as NewClient);
  const redirect = String(body.redirect_uri || "").trim();
  if (!/^https:\/\/[^\s]+$/.test(redirect)) {
    return err(c, 400, "redirect_uri must be an https URL — copy it from the connector's form");
  }
  const id = `pa_client_${rid(20)}`;
  const secret = body.confidential ? `pa_cs_${rid(40)}` : "";
  await c.env.DB.prepare(
    `INSERT INTO oauth_client (id, account_id, name, secret_hash, redirect_uri, created)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      account,
      String(body.name || "").slice(0, 60),
      secret ? await sha256(secret) : "",
      redirect,
      now(),
    )
    .run();
  // Shown once. There is no route that returns it again.
  return c.json({ client: { id, secret, redirect_uri: redirect } }, 201);
});

app.delete("/v1/oauth/clients/:id", async (c) => {
  const id = c.req.param("id");
  const owned = await c.env.DB.prepare(
    "SELECT id FROM oauth_client WHERE id = ? AND account_id = ?",
  )
    .bind(id, c.get("account"))
    .first<{ id: string }>();
  if (!owned) return err(c, 404, "no such client");
  // Revoke the client and everything it holds: a connector you have removed should stop working
  // now, not in an hour when its access token happens to expire.
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE oauth_client SET revoked = ? WHERE id = ?").bind(now(), id),
    c.env.DB.prepare("DELETE FROM oauth_token WHERE client_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM oauth_code WHERE client_id = ?").bind(id),
  ]);
  return c.json({ id, revoked: true });
});

app.get("/health", (c) => c.json({ ok: true }));

// Every route this app serves is machine-facing now, so a miss is JSON rather than a page. The
// pages — `/`, `/g/:id/:key`, `/hub`, `/join/:code`, `/reset` and the 404 itself — are Nuxt's,
// and a request that matches none of the routes above never reaches here: apps/web's middleware
// only hands over `/v1/*`, `/health` and the two machine routes.
app.notFound((c) => err(c, 404, "no such route"));

app.onError((e, c) => {
  console.error(e);
  return err(c, 500, "internal error");
});

export default app;
