/**
 * A plan given rather than bought: who gave it, to whom, until when, and why.
 *
 * Comping somebody was an UPDATE typed against production. It worked, and recorded nothing — so
 * "why does this account have Solo" had no answer a month later, and a comp meant to last a quarter
 * lasted until somebody happened to look. See migrations/0026_gifts.sql.
 *
 * THE ONE RULE THIS MODULE EXISTS TO KEEP: a gift never touches a subscription. Not when it is
 * given, and not when it is revoked. A paid plan belongs to the provider — it is the provider that
 * says when it starts and stops — and an operator's good intentions writing over `plan_until` would
 * end a plan somebody is being charged for. So both directions check `subscription_id` first.
 *
 * Imports no sibling `.ts`, like claims.ts and billing.ts: it is tested against a real SQLite with
 * the real migrations, and a value import of a sibling is what Node's type stripping cannot follow.
 * `planNow()` in quota.ts is the reading half of the same feature and is deliberately separate —
 * every request reads a plan, and almost none of them give one away.
 */

/** Who may give a plan away, from the deployment's `ADMIN_ACCOUNTS`. Unset means nobody. */
export function isAdmin(list: unknown, account: string): boolean {
  if (!account) return false;
  return String(list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(account);
}

/** Who a gift is for: one person, or one team. */
export interface Subject {
  kind: "account" | "team";
  id: string;
  name: string;
}

/**
 * The person or team a reference names. `@handle` or a bare handle is a person; `team/slug` is a
 * team. Null when nothing matches, which the caller reports rather than guessing at.
 */
export async function findSubject(db: D1Database, ref: string): Promise<Subject | null> {
  const said = String(ref ?? "").trim();
  if (!said) return null;
  if (said.startsWith("team/")) {
    const slug = said.slice("team/".length).trim().toLowerCase();
    const row = await db
      .prepare("SELECT id, name FROM team WHERE slug = ?")
      .bind(slug)
      .first<{ id: string; name: string }>();
    return row ? { kind: "team", id: row.id, name: row.name || slug } : null;
  }
  const handle = said.replace(/^@/, "").trim().toLowerCase();
  const row = await db
    .prepare("SELECT id, name, handle FROM account WHERE handle = ? OR id = ?")
    .bind(handle, handle)
    .first<{ id: string; name: string; handle: string }>();
  if (!row) return null;
  return { kind: "account", id: row.id, name: row.name || `@${row.handle || row.id}` };
}

/** A refusal, in the words the operator reads. */
type Refusal = { error: string; status: 400 | 404 | 409 };

const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/;

/**
 * Give a plan away. `until` is required and must be in the future, because the thing that makes
 * this a gift rather than a quiet second pricing tier is that it ends.
 *
 * A date with no time means the end of that day would be generous and the start of it is what a
 * bare ISO date sorts as, so `2027-09-23` becomes `2027-09-23T23:59:59.999Z`: nobody typing a date
 * means "and it stops at midnight as that day begins".
 */
export async function gift(
  db: D1Database,
  {
    to,
    until,
    why = "",
    seats = 0,
    by,
    at,
  }: { to: string; until: string; why?: string; seats?: number; by: string; at: string },
): Promise<{ id: string; subject: Subject; until: string } | Refusal> {
  const said = String(until ?? "").trim();
  if (!said) return { status: 400, error: "say when it ends: a gift with no `until` never ends" };
  if (!ISO.test(said) || Number.isNaN(Date.parse(said)))
    return { status: 400, error: `"${said}" is not a date — use 2027-09-23, or a full ISO time` };
  const ends = said.includes("T") ? new Date(said).toISOString() : `${said}T23:59:59.999Z`;
  if (ends <= at) return { status: 400, error: `${ends.slice(0, 10)} is in the past` };

  const subject = await findSubject(db, to);
  if (!subject) return { status: 404, error: `no account or team called "${to}"` };

  const table = subject.kind === "account" ? "account" : "team";
  const holder = await db
    .prepare(`SELECT plan, subscription_id FROM ${table} WHERE id = ?`)
    .bind(subject.id)
    .first<{ plan: string; subscription_id: string }>();
  if (!holder) return { status: 404, error: `no account or team called "${to}"` };
  if (holder.subscription_id)
    return {
      status: 409,
      error: `${subject.name} is paying for a plan — cancel that with the provider first, or leave it alone`,
    };

  const plan = subject.kind === "account" ? "solo" : "team";
  const seatCount = subject.kind === "team" ? Math.max(0, Math.trunc(Number(seats) || 0)) : 0;
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await db.batch([
    subject.kind === "account"
      ? db
          .prepare("UPDATE account SET plan = ?, plan_until = ?, plan_since = ? WHERE id = ?")
          .bind(plan, ends, at, subject.id)
      : db
          .prepare(
            "UPDATE team SET plan = ?, seats = ?, plan_until = ?, plan_since = ? WHERE id = ?",
          )
          .bind(plan, seatCount, ends, at, subject.id),
    db
      .prepare(
        `INSERT INTO plan_grant (id, subject_kind, subject_id, plan, seats, until, why, by_account, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        subject.kind,
        subject.id,
        plan,
        seatCount,
        ends,
        String(why ?? "")
          .trim()
          .slice(0, 400),
        by,
        at,
      ),
  ]);
  return { id, subject, until: ends };
}

/**
 * End a gift now.
 *
 * The plan goes back to `lapsed`, which is already the word for "had one, has not now" and already
 * falls back to whatever the account would have had anyway — its grandfathered ceiling, or nothing.
 * The record is marked rather than deleted: what was given and what happened to it are the same
 * question, and half of it is not an answer.
 *
 * If the subject has since bought a subscription, only the record is closed. Their plan is theirs.
 */
export async function revokeGift(
  db: D1Database,
  id: string,
  { at }: { at: string },
): Promise<{ subject_kind: string; subject_id: string } | Refusal> {
  const row = await db
    .prepare("SELECT subject_kind, subject_id, revoked_at FROM plan_grant WHERE id = ?")
    .bind(id)
    .first<{ subject_kind: string; subject_id: string; revoked_at: string }>();
  if (!row) return { status: 404, error: `no gift with id ${id}` };
  if (row.revoked_at)
    return {
      status: 409,
      error: `that gift was already taken back on ${row.revoked_at.slice(0, 10)}`,
    };

  const table = row.subject_kind === "account" ? "account" : "team";
  const holder = await db
    .prepare(`SELECT plan_until, subscription_id FROM ${table} WHERE id = ?`)
    .bind(row.subject_id)
    .first<{ plan_until: string; subscription_id: string }>();
  const theirs = !holder?.plan_until || Boolean(holder?.subscription_id);
  await db.batch([
    db.prepare("UPDATE plan_grant SET revoked_at = ? WHERE id = ?").bind(at, id),
    ...(theirs
      ? []
      : [
          db
            .prepare(
              `UPDATE ${table} SET plan = 'lapsed', plan_until = '', plan_since = ? WHERE id = ?`,
            )
            .bind(at, row.subject_id),
        ]),
  ]);
  return { subject_kind: row.subject_kind, subject_id: row.subject_id };
}

/** Every gift, newest first, in the words an operator reads them in. */
export async function gifts(
  db: D1Database,
  { at, limit = 100 }: { at: string; limit?: number },
): Promise<
  {
    id: string;
    to: string;
    kind: string;
    plan: string;
    seats: number;
    until: string;
    why: string;
    by: string;
    at: string;
    /** Still doing something: not revoked, and not past its date. */
    live: boolean;
  }[]
> {
  const { results } = await db
    .prepare(
      `SELECT g.*,
              COALESCE(NULLIF(a.name, ''), '@' || NULLIF(a.handle, ''), a.id) AS to_person,
              COALESCE(NULLIF(t.name, ''), t.slug) AS to_team,
              COALESCE(NULLIF(b.name, ''), '@' || NULLIF(b.handle, ''), b.id) AS by_name
         FROM plan_grant g
         LEFT JOIN account a ON g.subject_kind = 'account' AND a.id = g.subject_id
         LEFT JOIN team t ON g.subject_kind = 'team' AND t.id = g.subject_id
         LEFT JOIN account b ON b.id = g.by_account
        ORDER BY g.at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{
      id: string;
      subject_kind: string;
      subject_id: string;
      plan: string;
      seats: number;
      until: string;
      why: string;
      at: string;
      revoked_at: string;
      to_person: string;
      to_team: string;
      by_name: string;
    }>();
  return results.map((r) => ({
    id: r.id,
    to: (r.subject_kind === "account" ? r.to_person : r.to_team) || r.subject_id,
    kind: r.subject_kind,
    plan: r.plan,
    seats: r.seats,
    until: r.until,
    why: r.why,
    by: r.by_name || r.at,
    at: r.at,
    live: !r.revoked_at && r.until > at,
  }));
}
