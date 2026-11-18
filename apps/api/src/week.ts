// The week in review: what got finished last week, mailed to each person on Monday morning.
//
// It lists work by name and who finished it, and nothing else: no totals or streaks, for the same
// reason the log renders none (log.ts). It owns no table — a piece of work is in it when it is
// Done with `outcome = 'finished'` and its standing proof is dated inside the week — so it cannot
// disagree with the board. A person sees what they could see on the board: their own work, and
// the work of every team they are in now.
//
// Imports no sibling, so test/week.test.mjs can run it against real SQLite with every migration.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the week before the one `at` is in, and of the week `at` is in. */
export function lastWeek(at: string): { from: string; to: string } {
  const d = new Date(at);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const to = today - ((d.getUTCDay() + 6) % 7) * DAY_MS;
  return { from: new Date(to - 7 * DAY_MS).toISOString(), to: new Date(to).toISOString() };
}

export interface Finished {
  id: string;
  title: string;
  /** Who handed it in: their name, else their handle, else ''. */
  by: string;
  at: string;
}

export interface WeekMail {
  account_id: string;
  email: string;
  work: Finished[];
}

/**
 * Everyone with an address who could see something finished last week, and what. Oldest first, so
 * the mail reads as the week went. Someone who saw nothing finished is left out: an empty mail is
 * noise.
 */
export async function weekToMail(db: D1Database, at: string): Promise<WeekMail[]> {
  const { from, to } = lastWeek(at);
  const { results } = await db
    .prepare(
      `SELECT a.id AS account_id, a.email, w.id, w.title, pr.at,
              COALESCE(NULLIF(f.name, ''), NULLIF(f.handle, ''), '') AS by
         FROM account a
         JOIN work w ON w.account_id = a.id
                     OR (w.team_id <> '' AND w.team_id IN
                          (SELECT team_id FROM membership WHERE account_id = a.id))
         JOIN proof pr ON pr.work_id = w.id
         LEFT JOIN account f ON f.id = pr.account_id
        WHERE a.email <> '' AND a.week_mail_off = '' AND a.suspended_at = '' AND a.deleted_at = ''
          AND w.status = 'done' AND w.outcome = 'finished'
          AND pr.at >= ?1 AND pr.at < ?2
        ORDER BY a.id, pr.at`,
    )
    .bind(from, to)
    .all<{
      account_id: string;
      email: string;
      id: string;
      title: string;
      at: string;
      by: string;
    }>();
  const out = new Map<string, WeekMail>();
  for (const r of results) {
    const m: WeekMail = out.get(r.account_id) ?? {
      account_id: r.account_id,
      email: r.email,
      work: [],
    };
    // A piece with two proofs (two people's) is listed once, under the first.
    if (!m.work.some((w) => w.id === r.id))
      m.work.push({ id: r.id, title: r.title, by: r.by, at: r.at });
    out.set(r.account_id, m);
  }
  return [...out.values()];
}

/** On or off from Settings. Off records when. */
export async function setWeekMail(db: D1Database, account: string, on: boolean, at: string) {
  await db
    .prepare("UPDATE account SET week_mail_off = ? WHERE id = ?")
    .bind(on ? "" : at, account)
    .run();
}
