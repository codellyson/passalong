/**
 * Every account, for the owner's cross-app admin hub (admin.kreativekorna.com).
 *
 * The hub lists the people across all of the owner's apps in one place, and asks each app the same
 * question in the same shape: `{ app, users: [{ id, email, handle, created_at, extra }], total,
 * next_cursor }`. This is Passalong's answer.
 *
 * It is not an operator route: the hub is a server, not a person with a session, so it carries a
 * shared secret, `ADMIN_SECRET`, set on this Worker and on the hub. Unset — the default — the route
 * answers 401 to everyone, so a deployment that has never heard of the hub exposes nothing.
 *
 * Imports no sibling `.ts`, like gifts.ts: it is tested against a real SQLite with the real
 * migrations, and a value import of a sibling is what Node's type stripping cannot follow.
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

type Row = {
  id: string;
  email: string;
  handle: string;
  name: string;
  created: string;
  plan: string;
};

export async function adminUsers(db: DB, query: { q?: string; limit?: string; cursor?: string }) {
  const q = `%${(query.q ?? "").trim().toLowerCase()}%`;
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  // shortcut: offset cursor, fine at thousands of accounts; switch to keyset on (created, id) past that.
  const offset = Math.max(Number(query.cursor) || 0, 0);
  const where = "WHERE LOWER(email) LIKE ?1 OR LOWER(handle) LIKE ?1 OR LOWER(name) LIKE ?1";
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `SELECT id, email, handle, name, created, plan FROM account ${where} ORDER BY created DESC, id LIMIT ?2 OFFSET ?3`,
      )
      .bind(q, limit, offset)
      .all<Row>(),
    db.prepare(`SELECT COUNT(*) AS n FROM account ${where}`).bind(q).first<{ n: number }>(),
  ]);
  const total = count?.n ?? 0;
  const users = rows.results.map((r) => ({
    id: r.id,
    email: r.email || null,
    handle: r.handle || r.name || null,
    created_at: new Date(r.created).toISOString(),
    extra: { plan: r.plan },
  }));
  return {
    app: "passalong",
    users,
    total,
    next_cursor: offset + users.length < total ? String(offset + users.length) : null,
  };
}
