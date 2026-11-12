/**
 * Deleting an account, for the owner's admin hub (`delete`, admin-hub/CONTRACT.md v1).
 *
 * The line it draws is between what is theirs alone and what other people now hold:
 *
 * - **Gone:** work only they could act on (no team, sent to nobody but themselves), their personal
 *   projects with their documents and files, a team that has nobody else in it with its work and
 *   projects, every screenshot and file on that work or never attached to any, their credentials,
 *   connectors, devices, notifications, inbox, memberships and claims (released, so held work goes
 *   back to Ready), and the R2 objects behind all of it.
 * - **Kept:** work they wrote into a team or sent to someone, and what they said, proved and edited
 *   on other people's work and documents. That is the record other people rely on; deleting it
 *   would delete their history too. It stays attributed to the emptied row (0086), shown as
 *   "Deleted account". Work sent *to* them by someone else stays, addressed to nobody.
 * - **Refused (409):** owning a team that has anyone else in it (they must hand it over first), a
 *   Solo plan still being paid for and not cancelled (the provider would go on charging), and an
 *   account that runs Passalong (remove the role first, so the product is never left without one).
 *
 * Billing columns stay on the row and gifts stay in `plan_grant`: those are the financial records,
 * and once the email, name and handle are gone nothing in them names a person.
 *
 * Imports no sibling `.ts`, so it runs against real SQLite in a test: the R2 bucket and the key
 * layouts of shots.ts, attachments.ts and projects.ts are handed in by the caller.
 */

type DB = D1Database;

export type Keys = {
  shot: (id: string, type: string) => string;
  attachment: (id: string, type: string) => string;
  file: (project: string, file: string) => string;
};

export type DeleteContext = {
  at: string;
  /** The deployment's `ADMIN_ACCOUNTS`: the platform's owner is never deleted from the hub. */
  owners?: string;
  /** Where shots, attachments and project files live. Absent (local dev): only rows go. */
  bucket?: Pick<R2Bucket, "delete">;
  keys: Keys;
};

type Refusal = { status: 404 | 409; error: string };

/** Teams they own with nobody else in them. `?1` is the account throughout. */
const LONE_TEAMS = `SELECT m.team_id FROM membership m WHERE m.account_id = ?1 AND m.role = 'owner'
  AND NOT EXISTS (SELECT 1 FROM membership o WHERE o.team_id = m.team_id AND o.account_id <> ?1)`;

/** Work nobody else holds: private and unaddressed (or sent to themselves), or in a lone team. */
const LONE_WORK = `SELECT id FROM "work" WHERE (account_id = ?1 AND team_id = '' AND to_group_id = ''
  AND to_account_id IN ('', ?1)) OR team_id IN (${LONE_TEAMS})`;

const LONE_PROJECTS = `SELECT id FROM "project" WHERE (created_by = ?1 AND team_id = '')
  OR team_id IN (${LONE_TEAMS})`;

/** Screenshots and files going with the work, plus their own that were never attached. */
const LONE_UPLOADS = `WHERE work_id IN (${LONE_WORK}) OR (account_id = ?1 AND work_id = '')`;

/** Tables that are only ever about this one account. */
const THEIRS = [
  "session",
  "token",
  "oauth_token",
  "oauth_code",
  "oauth_consent",
  "oauth_client",
  "device_login",
  "reset",
  "email_verify",
  "upload",
  "inbound",
  "inbound_sender",
  "inbound_work",
  "runner",
  "news_off_link",
  "announcement_sent",
  "choice_link",
  "document_seen",
  "group_member",
  "push_subscription",
  "pull",
  "notification",
  "claim",
  "membership",
];

/** R2 deletes at most 1000 keys a call. */
async function dropObjects(bucket: DeleteContext["bucket"], keys: string[]) {
  if (!bucket) return;
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
}

/** Why this account cannot be deleted right now, or null. */
async function refusal(db: DB, id: string, owners: string): Promise<Refusal | null> {
  const row = await db
    .prepare(
      "SELECT role, plan, subscription_id, plan_ends FROM account WHERE id = ? AND deleted_at = ''",
    )
    .bind(id)
    .first<{ role: string; plan: string; subscription_id: string; plan_ends: string }>();
  if (!row) return { status: 404, error: "No such account." };
  const owner = owners
    .split(",")
    .map((s) => s.trim())
    .includes(id);
  if (owner || row.role === "super")
    return { status: 409, error: "Runs Passalong as an admin. Remove the role first." };
  if (row.subscription_id && row.plan === "solo" && !row.plan_ends)
    return {
      status: 409,
      error: "Pays for Solo. Cancel the subscription with the provider first.",
    };
  const team = await db
    .prepare(
      `SELECT t.name, COUNT(o.account_id) AS n FROM membership m
         JOIN team t ON t.id = m.team_id
         JOIN membership o ON o.team_id = m.team_id AND o.account_id <> m.account_id
       WHERE m.account_id = ? AND m.role = 'owner'
       GROUP BY t.id ORDER BY n DESC LIMIT 1`,
    )
    .bind(id)
    .first<{ name: string; n: number }>();
  if (team)
    return {
      status: 409,
      error: `Owns ${team.name} with ${team.n} other member${team.n === 1 ? "" : "s"}. Transfer it or remove them first.`,
    };
  return null;
}

/**
 * Delete the account. Answers with the email it had, for the confirmation the caller sends, or a
 * refusal. R2 first, rows after (as dropShots does): an object nothing points at is waste, a row
 * pointing at nothing is a broken image, and if the objects fail nothing has been deleted yet.
 */
export async function deleteAccount(
  db: DB,
  id: string,
  ctx: DeleteContext,
): Promise<{ email: string } | Refusal> {
  const refused = await refusal(db, id, ctx.owners ?? "");
  if (refused) return refused;
  const [shots, files, projectFiles, who] = await Promise.all([
    db
      .prepare(`SELECT id, type FROM shot ${LONE_UPLOADS}`)
      .bind(id)
      .all<{ id: string; type: string }>(),
    db
      .prepare(`SELECT id, type FROM attachment ${LONE_UPLOADS}`)
      .bind(id)
      .all<{ id: string; type: string }>(),
    db
      .prepare(`SELECT project_id, id FROM project_file WHERE project_id IN (${LONE_PROJECTS})`)
      .bind(id)
      .all<{ project_id: string; id: string }>(),
    db.prepare("SELECT email FROM account WHERE id = ?").bind(id).first<{ email: string }>(),
  ]);
  await dropObjects(ctx.bucket, [
    ...shots.results.map((r) => ctx.keys.shot(r.id, r.type)),
    ...files.results.map((r) => ctx.keys.attachment(r.id, r.type)),
    ...projectFiles.results.map((r) => ctx.keys.file(r.project_id, r.id)),
  ]);
  const run = (q: string) => db.prepare(q).bind(id);
  // Order matters: each set is a query over tables an earlier statement may already have changed,
  // so what depends on the lone work and teams goes before them, and memberships go last.
  await db.batch([
    run(`DELETE FROM shot ${LONE_UPLOADS}`),
    run(`DELETE FROM attachment ${LONE_UPLOADS}`),
    // Other people's unread notices about work that is going, as deleting one piece of work does.
    run(`DELETE FROM notification WHERE read_at = '' AND work_id IN (${LONE_WORK})`),
    run(`DELETE FROM "project" WHERE id IN (${LONE_PROJECTS})`),
    run(`DELETE FROM "work" WHERE id IN (${LONE_WORK})`),
    run(`DELETE FROM team WHERE id IN (${LONE_TEAMS})`),
    run(`UPDATE "work" SET to_account_id = '' WHERE to_account_id = ?1`),
    ...THEIRS.map((t) => run(`DELETE FROM ${t} WHERE account_id = ?1`)),
    db
      .prepare(
        `UPDATE account SET email = '', name = 'Deleted account', handle = '', password_hash = '',
           email_verified = '', setup = '', news_mail_off = '', news_seen = '',
           suspended_at = '', suspended_by = '', suspended_reason = '', deleted_at = ?2
         WHERE id = ?1`,
      )
      .bind(id, ctx.at),
  ]);
  return { email: who?.email ?? "" };
}
