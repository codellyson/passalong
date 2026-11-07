// What changed in Passalong that an agent should mention before it starts work.
//
// Oldest first. Add an entry when a release changes what an agent or its person would do
// differently; leave out anything only a person in the hub sees. Each is told once per account, on
// the first `take` after it is added (see `newsFor`), as a plain sentence the agent passes on. An id
// starts with the day it was added (YYYY-MM-DD): an account made after that day is never told it.
export const NEWS: { id: string; text: string }[] = [
  {
    id: "2026-10-08-default-team",
    text:
      "Passalong 0.15.0: a bug or task you file without a team now goes to your current team, " +
      "and `passalong login` picks your team when you are in only one. Update with " +
      "`npm i -g passalong@latest`.",
  },
  {
    id: "2026-11-07-1-6-hooks",
    text:
      "Passalong 1.6.0: a reply written while your agent works reaches it at its next step, work " +
      "stays the agent's while it works, and goes back to the queue the moment a session ends " +
      "instead of sitting quiet. Update with `npm i -g passalong@latest`, then run " +
      "`passalong setup` again so the new hooks are installed.",
  },
];

/** A few at most: an account that has been away should not be read a changelog. */
const MOST = 3;

/** The entries after `seen`, newest last. An id this build does not know counts as nothing seen. */
export function unseen(seen: string, news = NEWS): { id: string; text: string }[] {
  const at = news.findIndex((n) => n.id === seen);
  return news.slice(at + 1).slice(-MOST);
}

/**
 * What to tell the agent taking work for `account`, or "" when it has heard everything. Marks it
 * heard in the same breath: one agent says it for the whole account, and a second one starting a
 * minute later does not repeat it.
 */
export async function newsFor(db: D1Database, account: string): Promise<string> {
  const row = await db
    .prepare("SELECT news_seen, created FROM account WHERE id = ?")
    .bind(account)
    .first<{ news_seen: string; created: string }>();
  if (!row) return "";
  // Only what changed since the account was made: a new account's agent passed on a month-old
  // "Passalong 0.15.0 … update" to someone already on 1.5.0 (2026-11-07).
  const since = String(row.created ?? "").slice(0, 10);
  const fresh = unseen(row.news_seen).filter((n) => !since || n.id.slice(0, 10) >= since);
  const last = fresh[fresh.length - 1];
  if (!last) return "";
  await db.prepare("UPDATE account SET news_seen = ? WHERE id = ?").bind(last.id, account).run();
  return (
    "New in Passalong. Tell the user this in one line before you start the work:\n" +
    fresh.map((n) => `  - ${n.text}`).join("\n")
  );
}
