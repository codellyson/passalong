/**
 * Every account, for the owner's cross-app admin hub (admin.kreativekorna.com).
 *
 * The hub lists the people across all of the owner's apps in one place, and asks each app the same
 * questions in the same shape: admin-hub/CONTRACT.md, version 1. This is Passalong's answer: the
 * manifest, the list, one account and its activity, and the actions the hub can take on one.
 *
 * It is not an operator route: the hub is a server, not a person with a session. Reads carry a
 * shared secret, `ADMIN_SECRET`; writes are signed with a second one, `ADMIN_WRITE_SECRET`, so a
 * leaked read secret can change nothing. Unset — the default — every route answers 401 to
 * everyone, so a deployment that has never heard of the hub exposes nothing.
 *
 * Imports no sibling `.ts`, like gifts.ts: it is tested against a real SQLite with the real
 * migrations, and a value import of a sibling is what Node's type stripping cannot follow. That is
 * why the plan values below are written out rather than read from quota.ts, and why `comp` is
 * handed gifts.ts's `gift()` by its caller rather than importing it.
 */

type DB = D1Database;

async function hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The bearer the hub sent against the secret, compared in constant time over their hashes. */
export async function hubAllowed(authorization: string, secret: unknown): Promise<boolean> {
  const given = authorization.match(/^Bearer (\S+)$/)?.[1];
  if (typeof secret !== "string" || !secret || !given) return false;
  const [a, b] = await Promise.all([hex(given), hex(secret)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const WINDOW_SECONDS = 60;

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The operator's email when a write is signed with `ADMIN_WRITE_SECRET` and fresh, otherwise null.
 * The hub's reference verifier (admin-hub server/utils/signing.ts), copied as the contract says.
 *
 * `rawBody` must be the bytes as they arrived: parse first and you check a different string from
 * the one that was signed. A minute either way, so a captured request cannot be replayed later.
 */
export async function verifyHubRequest(
  req: Request,
  rawBody: string,
  secret: unknown,
  now = Date.now(),
): Promise<string | null> {
  const timestamp = req.headers.get("x-hub-timestamp");
  const operator = req.headers.get("x-hub-operator");
  const signature = req.headers.get("x-hub-signature");
  if (typeof secret !== "string" || !secret || !timestamp || !operator || !signature) return null;
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > WINDOW_SECONDS)
    return null;
  const url = new URL(req.url);
  const expected = await hmac(
    secret,
    `${req.method.toUpperCase()}\n${url.pathname + url.search}\n${timestamp}\n${operator}\n${rawBody}`,
  );
  // Constant time over two strings of the same length (64 hex characters when well formed).
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0 ? operator : null;
}

/**
 * The plan a person is on, as one word: what they bought (`solo`) beats the team seat that covers
 * them (`team`, quota.ts's rule), which beats their own column (`free` or `lapsed`). Derived on
 * read for the same reason quota() derives it — a copy on the account goes stale.
 */
const PLAN = `CASE WHEN a.plan = 'solo' THEN 'solo'
  WHEN EXISTS (SELECT 1 FROM membership m JOIN team t ON t.id = m.team_id
               WHERE m.account_id = a.id AND t.plan = 'team') THEN 'team'
  ELSE a.plan END`;

/** The last sign of them: a hub session started, or a CLI, MCP or connector token used. */
const SEEN = `(SELECT MAX(at) FROM (
  SELECT MAX(created) AS at FROM session WHERE account_id = a.id
  UNION ALL SELECT MAX(NULLIF(last_used, '')) FROM token WHERE account_id = a.id
  UNION ALL SELECT MAX(NULLIF(last_used, '')) FROM oauth_token WHERE account_id = a.id))`;

const USER = `SELECT a.id, a.email, a.handle, a.name, a.created, a.email_verified, a.news_mail_off,
  CASE WHEN a.suspended_at <> '' THEN 'suspended' ELSE 'active' END AS status,
  a.suspended_at, a.suspended_by, a.suspended_reason,
  ${PLAN} AS plan, ${SEEN} AS seen,
  (SELECT COUNT(*) FROM "work" w WHERE w.account_id = a.id) AS guides
  FROM account a`;

type Row = {
  id: string;
  email: string;
  handle: string;
  name: string;
  created: string;
  email_verified: string;
  news_mail_off: string;
  status: string;
  suspended_at: string;
  suspended_by: string;
  suspended_reason: string;
  plan: string;
  seen: string | null;
  guides: number;
};

const iso = (t: string) => new Date(t).toISOString();

function user(r: Row) {
  return {
    id: r.id,
    email: r.email || null,
    name: r.name || r.handle || null,
    status: r.status,
    created_at: iso(r.created),
    last_seen_at: r.seen ? iso(r.seen) : null,
    fields: {
      plan: r.plan,
      guides: r.guides,
      email_verified: !!r.email_verified,
      news: !r.news_mail_off,
    },
  };
}

export const MANIFEST = {
  contract: 1,
  app: "passalong",
  name: "Passalong",
  fields: [
    { key: "plan", label: "Plan", type: "enum", values: ["free", "solo", "team", "lapsed"] },
    // `guides` is the contract's key for what someone made; in Passalong that is work.
    { key: "guides", label: "Work", type: "number" },
    { key: "email_verified", label: "Email verified", type: "bool" },
    { key: "news", label: "Product news", type: "bool" },
  ],
  filters: ["status", "plan"],
  actions: [
    { id: "signout", label: "Sign out everywhere", level: "normal" },
    {
      id: "suspend",
      label: "Suspend",
      level: "caution",
      inputs: [
        { key: "reason", label: "Reason", type: "text", required: true },
        { key: "notify", label: "Email them that their account is suspended", type: "bool" },
      ],
    },
    { id: "unsuspend", label: "Unsuspend", level: "normal" },
    {
      id: "comp",
      label: "Give plan",
      level: "normal",
      inputs: [
        // gifts.ts gives Solo to a person and Team to a team; Team goes to the team they own.
        { key: "plan", label: "Plan", type: "enum", values: ["solo", "team"], required: true },
        { key: "until", label: "Until", type: "date", required: true },
        { key: "reason", label: "Reason", type: "text", required: true },
      ],
    },
  ],
  links: [{ label: "Gifts and announcements", url: "https://passalong.dev/admin" }],
};

type Query = Record<string, string | undefined>;

const offsetOf = (cursor: string | undefined) => Math.max(Math.floor(Number(cursor)) || 0, 0);

export async function adminUsers(db: DB, query: Query) {
  const limit = Math.min(Math.max(Math.floor(Number(query.limit)) || 50, 1), 200);
  // shortcut: offset cursor, fine at thousands of accounts; switch to keyset on (created, id) past that.
  const offset = offsetOf(query.cursor);
  const status = query["filter[status]"] || "";
  const plan = query["filter[plan]"] || "";
  const where = `WHERE (LOWER(email) LIKE ?1 OR LOWER(handle) LIKE ?1 OR LOWER(name) LIKE ?1)
    AND (?2 = '' OR plan = ?2) AND (?3 = '' OR status = ?3)`;
  const args = [`%${(query.q ?? "").trim().toLowerCase()}%`, plan, status];
  const order = query.sort === "created" ? "created, id" : "created DESC, id";
  const [rows, count] = await Promise.all([
    db
      .prepare(`SELECT * FROM (${USER}) ${where} ORDER BY ${order} LIMIT ?4 OFFSET ?5`)
      .bind(...args, limit, offset)
      .all<Row>(),
    db
      .prepare(`SELECT COUNT(*) AS n FROM (${USER}) ${where}`)
      .bind(...args)
      .first<{ n: number }>(),
  ]);
  const total = count?.n ?? 0;
  const users = rows.results.map(user);
  return {
    users,
    total,
    next_cursor: offset + users.length < total ? String(offset + users.length) : null,
  };
}

const day = (t: string) => (t ? t.slice(0, 10) : "Never");

/** One account with small tables of what it holds; null when there is no such account. */
export async function adminUser(db: DB, id: string) {
  const row = await db.prepare(`${USER} WHERE a.id = ?1`).bind(id).first<Row>();
  if (!row) return null;
  const [tokens, teams] = await Promise.all([
    // Names and times only: a token's hash is a credential's fingerprint and never leaves.
    db
      .prepare(
        `SELECT name, created, last_used FROM token WHERE account_id = ?1 AND revoked = ''
         ORDER BY created DESC LIMIT 20`,
      )
      .bind(id)
      .all<{ name: string; created: string; last_used: string }>(),
    db
      .prepare(
        `SELECT t.name, m.role FROM membership m JOIN team t ON t.id = m.team_id
         WHERE m.account_id = ?1 ORDER BY m.joined LIMIT 20`,
      )
      .bind(id)
      .all<{ name: string; role: string }>(),
  ]);
  return {
    user: user(row),
    suspension: row.suspended_at
      ? { reason: row.suspended_reason, by: row.suspended_by, at: iso(row.suspended_at) }
      : null,
    sections: [
      {
        title: "API tokens",
        columns: ["Name", "Created", "Last used"],
        rows: tokens.results.map((t) => [t.name || "Unnamed", day(t.created), day(t.last_used)]),
      },
      {
        title: "Teams",
        columns: ["Team", "Role"],
        rows: teams.results.map((t) => [t.name, t.role]),
      },
    ],
  };
}

/** What each thread line says, for a person reading someone's history. */
const SAID: Record<string, string> = {
  created: "Created",
  taken: "Took",
  progress: "Reported progress on",
  handed_in: "Finished",
  passed: "Passed on",
  released: "Let go of",
  reopened: "Reopened",
  asked: "Asked a question on",
  replied: "Replied on",
  noted: "Left a note on",
  said: "Wrote on",
};

const KIND: Record<string, string> = {
  created: "Work",
  taken: "Take",
  progress: "Progress",
  handed_in: "Finish",
  passed: "Pass",
  released: "Release",
  reopened: "Reopen",
  asked: "Question",
  replied: "Reply",
  noted: "Note",
  said: "Note",
};

const PAGE = 50;

/**
 * What the account did, newest first: the work it created and its lines on work threads
 * (`task_event`), ending in the account being made. Only rows that exist — Aptabase carries no
 * account ids, so nothing from analytics can be here.
 */
export async function adminActivity(db: DB, id: string, cursor?: string) {
  const exists = await db.prepare("SELECT 1 AS x FROM account WHERE id = ?1").bind(id).first();
  if (!exists) return null;
  // shortcut: offset cursor over the union, fine for one person's history; keyset on `at` past that.
  const offset = offsetOf(cursor);
  const rows = await db
    .prepare(
      `SELECT * FROM (
         SELECT created AS at, 'created' AS kind, title FROM "work" WHERE account_id = ?1
         UNION ALL
         SELECT e.at, e.kind, w.title FROM task_event e JOIN "work" w ON w.id = e.work_id
           WHERE e.account_id = ?1
         UNION ALL
         SELECT created, 'account', '' FROM account WHERE id = ?1
       ) ORDER BY at DESC LIMIT ?2 OFFSET ?3`,
    )
    .bind(id, PAGE + 1, offset)
    .all<{ at: string; kind: string; title: string }>();
  const more = rows.results.length > PAGE;
  const events = rows.results.slice(0, PAGE).map((r) =>
    r.kind === "account"
      ? { at: iso(r.at), kind: "Account", summary: "Created their account", link: null }
      : {
          at: iso(r.at),
          kind: KIND[r.kind] ?? "Thread",
          summary: `${SAID[r.kind] ?? "Acted on"} "${r.title}"`,
          link: null,
        },
  );
  return { events, next_cursor: more ? String(offset + PAGE) : null };
}

// ---- actions: POST /users/:id/actions/:action ----------------------------------------------------

/** What every way in answers a suspended account with: the middleware, sign-in, password reset. */
export const SUSPENDED = "This account is suspended.";

/** The account as a list item, after an action changed it. */
async function listItem(db: DB, id: string) {
  const row = await db.prepare(`${USER} WHERE a.id = ?1`).bind(id).first<Row>();
  return row ? user(row) : null;
}

/**
 * Everything that lets this account in, made useless: hub sessions, API tokens (revoked, not
 * deleted, so Settings still lists what there was), connector grants and their unredeemed codes, a
 * CLI sign-in approved in the browser but not yet collected, unused password-reset links, and
 * unused upload links. Not choice links or news-off links: neither signs anyone in, and a choice
 * link's pick is refused for a suspended account by the middleware's internal-call check.
 */
function revokeAll(db: DB, id: string, at: string) {
  return [
    db.prepare("DELETE FROM session WHERE account_id = ?").bind(id),
    db.prepare("UPDATE token SET revoked = ? WHERE account_id = ? AND revoked = ''").bind(at, id),
    db.prepare("DELETE FROM oauth_token WHERE account_id = ?").bind(id),
    db.prepare("DELETE FROM oauth_code WHERE account_id = ?").bind(id),
    db.prepare("DELETE FROM device_login WHERE account_id = ?").bind(id),
    db.prepare("UPDATE reset SET used = ? WHERE account_id = ? AND used = ''").bind(at, id),
    db.prepare("UPDATE upload SET used = ? WHERE account_id = ? AND used = ''").bind(at, id),
  ];
}

/** A refusal the hub shows as is: 400 for bad inputs, 404 for no such thing, 409 on purpose. */
export type ActionRefusal = { status: 400 | 404 | 409; error: string };

/** gifts.ts's `gift()`, handed in by the caller so this module imports no sibling. */
export type Give = (
  db: DB,
  o: { to: string; until: string; why: string; by: string; at: string },
) => Promise<{ id: string } | { status: 400 | 404 | 409; error: string }>;

export type ActionContext = {
  /** The hub's `X-Hub-Operator`, already verified: the actor recorded wherever one is. */
  operator: string;
  at: string;
  /** The deployment's `ADMIN_ACCOUNTS`, for a gift whose operator has no account here. */
  owners?: string;
  give: Give;
};

type Input = Record<string, unknown>;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

async function suspend(db: DB, id: string, input: Input, ctx: ActionContext) {
  const reason = text(input.reason).slice(0, 400);
  if (!reason) return { status: 400, error: "Say why: a suspension needs a reason." } as const;
  const was = await db
    .prepare("SELECT suspended_at FROM account WHERE id = ?")
    .bind(id)
    .first<{ suspended_at: string }>();
  if (was?.suspended_at)
    return {
      status: 409,
      error: `Already suspended since ${was.suspended_at.slice(0, 10)}.`,
    } as const;
  await db.batch([
    db
      .prepare(
        `UPDATE account SET suspended_at = ?, suspended_by = ?, suspended_reason = ?
         WHERE id = ? AND suspended_at = ''`,
      )
      .bind(ctx.at, ctx.operator, reason, id),
    ...revokeAll(db, id, ctx.at),
  ]);
  return null;
}

async function unsuspend(db: DB, id: string) {
  const r = await db
    .prepare(
      `UPDATE account SET suspended_at = '', suspended_by = '', suspended_reason = ''
       WHERE id = ? AND suspended_at <> ''`,
    )
    .bind(id)
    .run();
  return r.meta.changes
    ? null
    : ({ status: 409, error: "This account is not suspended." } as const);
}

/**
 * "Give plan", through gifts.ts so its rules hold — above all that a gift never touches a plan
 * someone pays for, which comes back here as gift()'s own 409. Solo goes to the person; Team goes
 * to the one team they own, since a Team plan belongs to a team and not to whoever is in it.
 *
 * `plan_grant.by_account` must name an account. The operator's email is matched to one; an
 * operator with no account here is recorded under the deployment's owner (`ADMIN_ACCOUNTS`), the
 * person who runs the hub, with their email in the reason so the gift still says who gave it.
 */
async function comp(db: DB, id: string, input: Input, ctx: ActionContext) {
  const plan = text(input.plan);
  const until = text(input.until);
  const reason = text(input.reason);
  if (plan !== "solo" && plan !== "team")
    return { status: 400, error: "Plan is solo or team." } as const;
  if (!reason) return { status: 400, error: "Say why: a gift needs a reason." } as const;
  let to = id;
  if (plan === "team") {
    const { results } = await db
      .prepare(
        `SELECT t.slug, t.name FROM membership m JOIN team t ON t.id = m.team_id
         WHERE m.account_id = ? AND m.role = 'owner' ORDER BY m.joined`,
      )
      .bind(id)
      .all<{ slug: string; name: string }>();
    if (results.length !== 1)
      return {
        status: 409,
        error: results.length
          ? `Owns ${results.length} teams (${results.map((t) => t.name).join(", ")}). Give the plan to one of them from /admin.`
          : "Owns no team. Team is given to a team: give Solo instead, or wait until they make one.",
      } as const;
    to = `team/${results[0]?.slug}`;
  }
  const mine = await db
    .prepare("SELECT id FROM account WHERE email <> '' AND LOWER(email) = LOWER(?)")
    .bind(ctx.operator)
    .first<{ id: string }>();
  let by = mine?.id ?? "";
  let why = reason;
  if (!by) {
    for (const owner of String(ctx.owners ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (await db.prepare("SELECT 1 AS x FROM account WHERE id = ?").bind(owner).first()) {
        by = owner;
        break;
      }
    }
    if (!by)
      return {
        status: 409,
        error: `${ctx.operator} has no Passalong account to record this gift under, and ADMIN_ACCOUNTS names none.`,
      } as const;
    why = `${reason} (given from the admin hub by ${ctx.operator})`;
  }
  const given = await ctx.give(db, { to, until, why, by, at: ctx.at });
  return "error" in given ? given : null;
}

/**
 * Do what the hub asked to one account, and answer with the account as it is now.
 * Unknown action or account: 404. The caller has verified the signature and sends any mail.
 */
export async function adminAction(
  db: DB,
  id: string,
  action: string,
  input: Input,
  ctx: ActionContext,
): Promise<{ ok: true; user: ReturnType<typeof user> } | ActionRefusal> {
  if (!["signout", "suspend", "unsuspend", "comp"].includes(action))
    return { status: 404, error: `No action called "${action}".` };
  if (!(await db.prepare("SELECT 1 AS x FROM account WHERE id = ?").bind(id).first()))
    return { status: 404, error: "No such account." };
  const refused =
    action === "signout"
      ? (await db.batch(revokeAll(db, id, ctx.at)), null)
      : action === "suspend"
        ? await suspend(db, id, input, ctx)
        : action === "unsuspend"
          ? await unsuspend(db, id)
          : await comp(db, id, input, ctx);
  if (refused) return refused;
  const item = await listItem(db, id);
  return item ? { ok: true, user: item } : { status: 404, error: "No such account." };
}
