/**
 * Every account, for the owner's cross-app admin hub (admin.kreativekorna.com).
 *
 * The hub lists the people across all of the owner's apps in one place, and asks each app the same
 * questions in the same shape: admin-hub/CONTRACT.md, version 1. This is Passalong's answer to the
 * reads — the manifest, the list, one account and its activity. The hub's writes (suspend, sign
 * out, delete) are not here yet, so the manifest lists no actions and every account is `active`.
 *
 * It is not an operator route: the hub is a server, not a person with a session, so it carries a
 * shared secret, `ADMIN_SECRET`, set on this Worker and on the hub. Unset — the default — every
 * route answers 401 to everyone, so a deployment that has never heard of the hub exposes nothing.
 *
 * Imports no sibling `.ts`, like gifts.ts: it is tested against a real SQLite with the real
 * migrations, and a value import of a sibling is what Node's type stripping cannot follow. That is
 * why the plan values below are written out rather than read from quota.ts.
 */

type DB = {
  prepare(q: string): {
    bind(...args: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
};

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
    status: "active",
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
  actions: [],
  links: [{ label: "Gifts and announcements", url: "https://passalong.dev/admin" }],
};

type Query = Record<string, string | undefined>;

const offsetOf = (cursor: string | undefined) => Math.max(Math.floor(Number(cursor)) || 0, 0);

export async function adminUsers(db: DB, query: Query) {
  const limit = Math.min(Math.max(Math.floor(Number(query.limit)) || 50, 1), 200);
  // shortcut: offset cursor, fine at thousands of accounts; switch to keyset on (created, id) past that.
  const offset = offsetOf(query.cursor);
  const status = query["filter[status]"];
  // Nobody can be suspended yet, so asking for anything but active is asking for no one.
  if (status && status !== "active") return { users: [], total: 0, next_cursor: null };
  const plan = query["filter[plan]"] || "";
  const where = `WHERE (LOWER(email) LIKE ?1 OR LOWER(handle) LIKE ?1 OR LOWER(name) LIKE ?1)
    AND (?2 = '' OR plan = ?2)`;
  const args = [`%${(query.q ?? "").trim().toLowerCase()}%`, plan];
  const order = query.sort === "created" ? "created, id" : "created DESC, id";
  const [rows, count] = await Promise.all([
    db
      .prepare(`SELECT * FROM (${USER}) ${where} ORDER BY ${order} LIMIT ?3 OFFSET ?4`)
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
    suspension: null,
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
