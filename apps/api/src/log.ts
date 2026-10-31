/**
 * Your own acts, newest first.
 *
 * Every other surface in the product is organised by state: the board is four queues of what needs
 * someone now, the work page sorts by who is blocked, and `activity` is what *other* people did
 * while you were away — addressed to you, and it clears when you read it. None of them is ordered
 * by time, and none of them contains the thing you did yourself: a notification is a row addressed
 * to whoever should hear about an act, and nobody needs to be told about their own.
 *
 * So the record of your own work was the one thing the product stored everywhere and showed
 * nowhere. This reads it back. It invents no table — publishing writes a `work`, pulling writes a
 * `pull`, proofs and the thread write their own rows, and all four are already timestamped. It is a
 * UNION over rows that exist, which is also why it needs no migration and can never disagree with
 * the board: there is nothing here to keep in step.
 *
 * Two things it deliberately does not do.
 *
 * It is **not** a count of anything. No totals, no streak, no per-week number. `docs/PRD.md` §9
 * says what Passalong is not, and a dashboard is the shape this would take if it were allowed to
 * summarise instead of list.
 *
 * And it is **not** a record of what you worked on — only of what you passed along. Work that
 * never became a piece of work leaves no row here, and no amount of querying will invent one. Every
 * surface that renders this has to say so, or an empty month reads as a month you did nothing.
 */

/** What you did. Past tense, one word, and the same word the CLI uses for the command that did it. */
export type Act = "created" | "pulled" | "works" | "broken" | "took" | "passed";

export interface LogRow {
  act: Act;
  at: string;
  /** A proof's or a pass's reason. Empty for a publish and for a pull. */
  detail: string;
  work_id: string;
  title: string;
  source_context: string;
  share_key: string;
  /** The work's author, so `mine` is decided here rather than by four separate CASE arms. */
  owner: string;
}

export interface LogEnv {
  DB: D1Database;
}

/**
 * The four things a person does to a piece of work, as one stream.
 *
 * `created` reads `work.created` rather than a row of its own: creating the work *is* the act,
 * and the work is still the only place it is recorded. An archived work stays in the log — this
 * is a record of what happened, not a view of what is current, so nothing here filters on status.
 *
 * Pulling your own work lands here sometimes, and which times is not obvious. `recordPull` does
 * not skip the author — every fetch of `/v1/work/:id` writes a row, whoever asked — but the CLI's
 * `pull` resolves from the local store first and only calls the API when the work carries a team,
 * so that a teammate's cached copy still registers as a pull for them. The upshot: re-pulling your
 * own work in another repo is in your log when it was shared with a team, and invisible when it
 * was not. That is the receipt model showing through, and it is `mine` on a `pulled` row rather
 * than a missing row, which is the more honest of the two.
 *
 * The `GROUP BY` on the pull arm is load-bearing, though no longer for the reason it was written
 * for. `pull` is not one row per act of taking something: `recordPull` writes one on every fetch of
 * `/v1/work/:id` and never dedupes, on purpose — the pull count is how travelled a piece of work is, and
 * re-reading it is part of that.
 *
 * What used to make that acute was the CLI resolving an id by fetching the work, so `passalong
 * take x` followed by `passalong pull x` left two rows seconds apart and this list claimed you
 * pulled the same thing twice in a minute. That is fixed at the source now: a take and a hand-in
 * resolve an id without a fetch, so they write no pull row at all.
 *
 * The clause stays, because the fix removed a cause and not the property. A person who pulls a
 * work on Monday and again on Thursday still has two rows, `take` writes one every time an
 * agent opens a piece of work it means to work on, and rows from before the fix are still in the table. The
 * act this list renders is taking delivery of a piece of work, which happens once; every extra row is the
 * delivery's bookkeeping and belongs to the board, not here. `MIN(p.at)` dates the act from the
 * first of them for the same reason.
 */
const LOG_SQL = `
  SELECT 'created' AS act, g.created AS at, '' AS detail,
         g.id AS work_id, g.title AS title, g.source_context AS source_context,
         g.share_key AS share_key, g.account_id AS owner
    FROM work g WHERE g.account_id = ?
  UNION ALL
  SELECT 'pulled', MIN(p.at), '', g.id, g.title, g.source_context, g.share_key, g.account_id
    FROM pull p JOIN work g ON g.id = p.work_id WHERE p.account_id = ?
   GROUP BY p.work_id
  UNION ALL
  SELECT CASE WHEN v.ok = 1 THEN 'works' ELSE 'broken' END,
         v.at, v.note, g.id, g.title, g.source_context, g.share_key, g.account_id
    FROM proof v JOIN work g ON g.id = v.work_id WHERE v.account_id = ?
  UNION ALL
  SELECT CASE WHEN k.kind = 'taken' THEN 'took' ELSE 'passed' END,
         k.at, k.body, g.id, g.title, g.source_context, g.share_key, g.account_id
    FROM task_event k JOIN work g ON g.id = k.work_id
   WHERE k.account_id = ? AND k.kind IN ('taken', 'passed')`;

/** `2026`, `2026-09`, `2026-09-11`, or a full ISO instant. `at` is ISO, so a prefix compares. */
export const SINCE_RE = /^\d{4}(-\d{2}(-\d{2}(T[\d:.]+Z?)?)?)?$/;

export async function logFeed(
  env: LogEnv,
  account: string,
  { repo = "", since = "", limit = 100 } = {},
): Promise<LogRow[]> {
  const binds: unknown[] = [account, account, account, account];
  let where = "";
  if (since) {
    where += " WHERE at >= ?";
    binds.push(since);
  }
  if (repo) {
    where += `${where ? " AND" : " WHERE"} lower(source_context) LIKE ?`;
    binds.push(`%${repo.toLowerCase()}%`);
  }
  const { results } = await env.DB.prepare(
    `SELECT * FROM (${LOG_SQL})${where} ORDER BY at DESC LIMIT ?`,
  )
    .bind(...binds, Math.min(Math.max(limit, 1), 200))
    .all<LogRow>();
  return results;
}

/**
 * One line, written once.
 *
 * The same rule as `line()` in notify.ts and for the same reason: the CLI, the MCP tools and the
 * hub all print the server's sentence, so a wording change lands in three places at once and the
 * three can never drift into describing the same act differently.
 */
export function line(r: Pick<LogRow, "act" | "title" | "detail">): string {
  const title = r.title ? `"${r.title}"` : "a piece of work";
  const why = r.detail ? `: ${r.detail}` : "";
  // The `act` values are the API's and stay as they are; the sentence uses the words a person uses.
  switch (r.act) {
    case "created":
      return `sent ${title}`;
    case "pulled":
      return `opened ${title}`;
    case "works":
      return `said ${title} worked`;
    case "broken":
      return `said ${title} didn't work${why}`;
    case "took":
      return `took ${title}`;
    case "passed":
      return `passed on ${title}${why}`;
    default:
      return `did something with ${title}`;
  }
}

/**
 * The shape sent out, shaped like a notification's: the id to act on, the fields to group by, and
 * the rendered sentence. `url` is here and not on a notification because a log row's whole purpose
 * is to get you back to the thing — and every act in it is one you were authorised to perform, so
 * the share key it carries is one you already had.
 */
export const summary = (base: string, account: string) => (r: LogRow) => ({
  act: r.act,
  at: r.at,
  work: r.work_id,
  title: r.title,
  repo: r.source_context,
  url: `${base}/w/${r.work_id}/${r.share_key}`,
  mine: r.owner === account,
  note: r.detail,
  text: line(r),
});
