// The week in review: what got finished last week, mailed to each person on Monday morning.
//
// It tells the week project by project, each piece in its finisher's own words (the first sentence
// of their hand-in write-up, else the work's summary), never a sentence somebody else wrote for
// them: a summary written afterwards by something that was not there can say what nobody claimed.
// Nothing else: no totals or streaks, for the same
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
  /** What was done, in the finisher's words: the first sentence of the write-up, else the summary's. */
  said: string;
  /** The project it is filed in that this reader can see, '' for none. */
  project: string;
}

/** The first sentence of somebody's words, whitespace folded, cut at a word past 200 characters. */
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = /[.!?](?=\s|$)/.exec(flat);
  const one = end ? flat.slice(0, end.index + 1) : flat;
  if (one.length <= 200) return one;
  const cut = one.slice(0, 200);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : 200)}…`;
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
      `SELECT a.id AS account_id, a.email, w.id, w.title, w.summary, pr.at, pr.writeup,
              COALESCE(NULLIF(f.name, ''), NULLIF(f.handle, ''), '') AS by,
              -- Only a project this reader can see: the work's team's, or their own private one.
              COALESCE((SELECT p.title FROM project_work pw JOIN project p ON p.id = pw.project_id
                         WHERE pw.work_id = w.id
                           AND ((p.team_id <> '' AND p.team_id = w.team_id)
                                OR (p.team_id = '' AND p.created_by = a.id))
                         ORDER BY p.title LIMIT 1), '') AS project
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
      summary: string;
      at: string;
      writeup: string;
      by: string;
      project: string;
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
      m.work.push({
        id: r.id,
        title: r.title,
        by: r.by,
        at: r.at,
        said: firstSentence(r.writeup || r.summary || r.title),
        project: r.project,
      });
    out.set(r.account_id, m);
  }
  return [...out.values()];
}

/**
 * The week told project by project: each project in the order its first piece was finished, work
 * filed in none last under ''.
 */
export function byProject(work: Finished[]): { project: string; work: Finished[] }[] {
  const groups = new Map<string, Finished[]>();
  for (const w of work) groups.set(w.project, [...(groups.get(w.project) ?? []), w]);
  const none = groups.get("");
  groups.delete("");
  const out = [...groups].map(([project, work]) => ({ project, work }));
  return none ? [...out, { project: "", work: none }] : out;
}

/** On or off from Settings. Off records when. */
export async function setWeekMail(db: D1Database, account: string, on: boolean, at: string) {
  await db
    .prepare("UPDATE account SET week_mail_off = ? WHERE id = ?")
    .bind(on ? "" : at, account)
    .run();
}
