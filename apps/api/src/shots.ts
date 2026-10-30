/**
 * Screenshot storage: what a stored file is called, and how the ones nobody wants go away.
 *
 * A shot is claimed by the work whose markdown points at it, and deleting that work takes it —
 * see `claimShots` and `dropShots` in index.ts. What neither of those covers is the upload that
 * was never referenced by anything: a tester attaches a screenshot, then closes the tab. Nothing
 * points at it, nothing will, and it sits in the bucket forever.
 *
 * That is the only way an orphan is made, so the sweep is small by construction. It runs on a
 * cron rather than opportunistically on the next upload, because "cleaned up whenever someone
 * happens to upload again" is not a property you can state, and a bucket that only shrinks when
 * it grows is a worse thing to reason about than one that is tidied every night.
 */

interface ShotEnv {
  DB: D1Database;
  SHOTS?: R2Bucket;
}

export const SHOT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Where the bytes live in the bucket. The row is the only record of which extension that was. */
export const shotKey = (id: string, type: string) => `${id}.${SHOT_TYPES[type] || "png"}`;

/**
 * Point a piece of work at the screenshots it carries, and let go of any it no longer does.
 *
 * `mine` is what the writer of this call put there — the ids in the document it just published, or
 * in the evidence it just handed in — and only the account that uploaded a shot can claim it.
 * Without `account_id` in that WHERE, naming someone else's id in your own markdown would take
 * their image, and deleting your work would then delete it.
 *
 * `carried` is everything the work points at from anywhere, which is what decides the release.
 * The two differ because a piece of work carries shots from more than one source and more than one person:
 * its own markdown, written by its author, and the evidence of each hand-in on it, written by
 * whoever did the work. Releasing on `mine` alone would mean an author's next edit dropped the
 * screenshot a teammate handed in — and a day later the sweep would delete it.
 *
 * A released shot becomes an orphan rather than being deleted here: the same upload can be
 * referenced by a second work, and a write is the wrong moment to decide nobody wants a file.
 */
export async function holdShots(
  db: D1Database,
  { account, work, mine, carried }: Hold,
): Promise<void> {
  const keep = [...new Set([...mine, ...carried])];
  const holes = keep.map(() => "?").join(",");
  const statements = [];
  if (mine.length)
    statements.push(
      db
        .prepare(
          `UPDATE shot SET work_id = ? WHERE account_id = ? AND id IN (${mine
            .map(() => "?")
            .join(",")})`,
        )
        .bind(work, account, ...mine),
    );
  statements.push(
    keep.length
      ? db
          .prepare(`UPDATE shot SET work_id = '' WHERE work_id = ? AND id NOT IN (${holes})`)
          .bind(work, ...keep)
      : db.prepare("UPDATE shot SET work_id = '' WHERE work_id = ?").bind(work),
  );
  await db.batch(statements);
}

/** What holdShots() needs: who is claiming, for what work, what they wrote, what it all carries. */
interface Hold {
  account: string;
  work: string;
  /** Shot ids in what this caller just wrote. Only these are claimed, and only for `account`. */
  mine: string[];
  /** Shot ids the work points at from anywhere. Anything outside this is released. */
  carried: string[];
}

/**
 * The evidence of every hand-in on a piece of work, and the proof on every proof, as it was written.
 *
 * A "works" proof carries screenshots of it working (see PROOF_DAYS), and they live on the
 * proof row rather than on a claim. Leaving them out here would let the author's next edit
 * release them, and the orphan sweep would take them a day later.
 *
 * Parsing it for shot ids is the caller's job: the parser lives in work.ts with the markdown it
 * was written for, and this file deliberately imports no sibling so it can be tested against a
 * real SQLite the way claims.ts is.
 */
export async function evidenceOn(db: D1Database, work: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT evidence AS text FROM claim WHERE work_id = ?1 AND evidence <> ''
       UNION ALL
       SELECT detail FROM proof WHERE work_id = ?1 AND detail <> ''`,
    )
    .bind(work)
    .all<{ text: string }>();
  return results.map((r) => r.text);
}

/**
 * How long proof outlives the work it proves, once that work is closed.
 *
 * Proof is a screenshot of the thing working: somebody says a piece of work works, and shows it. It is
 * there for the review, and the review ends when the author closes the work or approves the task.
 * Keeping every screenshot of every finished piece of work forever is storage nobody reads, so
 * five days after closing it goes — long enough to reopen something that was closed too early and
 * still see why somebody said it worked. What the work's own document shows is never proof: it
 * is the document, and it stays for as long as the work does.
 */
export const PROOF_DAYS = 5;

/** What a removed screenshot reads as, wherever the text around it pointed at it. */
export const PROOF_GONE = `[screenshot removed ${PROOF_DAYS} days after this was closed]`;

/** Text with every pointer at these shots — an image or a bare link — replaced by PROOF_GONE. */
export function strike(text: string, ids: string[]): string {
  let out = text;
  for (const id of ids) {
    out = out
      .replace(new RegExp(`!\\[[^\\]]*\\]\\([^)\\s]*/v1/shots/${id}\\b[^)]*\\)`, "g"), PROOF_GONE)
      .replace(new RegExp(`\\S*/v1/shots/${id}\\b\\S*`, "g"), PROOF_GONE);
  }
  return out;
}

/**
 * Delete the proof on work closed more than PROOF_DAYS ago.
 *
 * Proof is any shot a closed work holds that its own markdown does not name: the screenshots on
 * a "works" proof, and those in a hand-in's evidence. `updated` is when the work was closed —
 * closing writes the status into the markdown — and a piece of work edited or put back since starts the
 * clock again, which is the safe direction for it to be wrong in.
 *
 * The text that pointed at a removed shot says so rather than showing a broken image: a proof
 * that reads "works" beside an empty frame looks like proof that failed to load, not proof that
 * was tidied away on schedule. Bucket first and stop if it refuses, as sweepOrphans does.
 *
 * Every account alike: this is a fixed rule, not a setting (migration 0065 removed the switch).
 */
export async function sweepProof(
  env: ShotEnv,
  { days = PROOF_DAYS, limit = 200, at = Date.now() } = {},
) {
  const cutoff = new Date(at - days * 86_400_000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.type, s.work_id FROM shot s JOIN work g ON g.id = s.work_id
      WHERE g.status = 'done' AND g.updated < ?
        AND instr(g.markdown, '/v1/shots/' || s.id) = 0
      ORDER BY g.updated LIMIT ?`,
  )
    .bind(cutoff, limit)
    .all<{ id: string; type: string; work_id: string }>();
  if (!results.length) return { removed: 0, deferred: 0 };

  if (env.SHOTS) {
    try {
      await env.SHOTS.delete(results.map((r) => shotKey(r.id, r.type)));
    } catch {
      return { removed: 0, deferred: results.length };
    }
  }
  const ids = results.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    await env.DB.prepare(`DELETE FROM shot WHERE id IN (${slice.map(() => "?").join(",")})`)
      .bind(...slice)
      .run();
  }

  const byWork = new Map<string, string[]>();
  for (const r of results) byWork.set(r.work_id, [...(byWork.get(r.work_id) ?? []), r.id]);
  for (const [work, gone] of byWork) {
    const { results: said } = await env.DB.prepare(
      "SELECT account_id, note, detail FROM proof WHERE work_id = ?",
    )
      .bind(work)
      .all<{ account_id: string; note: string; detail: string }>();
    for (const v of said) {
      const note = strike(v.note, gone);
      const detail = strike(v.detail, gone);
      if (note !== v.note || detail !== v.detail)
        await env.DB.prepare(
          "UPDATE proof SET note = ?, detail = ? WHERE work_id = ? AND account_id = ?",
        )
          .bind(note, detail, work, v.account_id)
          .run();
    }
    const { results: held } = await env.DB.prepare(
      "SELECT evidence FROM claim WHERE work_id = ? AND evidence <> ''",
    )
      .bind(work)
      .all<{ evidence: string }>();
    for (const k of held) {
      const evidence = strike(k.evidence, gone);
      if (evidence !== k.evidence)
        await env.DB.prepare("UPDATE claim SET evidence = ? WHERE work_id = ?")
          .bind(evidence, work)
          .run();
    }
  }
  return { removed: results.length, deferred: 0 };
}

/**
 * What was said in a piece of work's conversation that points at a screenshot: a person's reply with a
 * picture or a file on it. Same reason as the evidence above — it is a document somebody wrote, it is not the
 * work's markdown, and without it the author's next edit would release the picture and the sweep
 * would delete it a day later.
 */
export async function conversationOn(db: D1Database, work: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT body FROM task_event WHERE work_id = ? AND (body LIKE '%/v1/shots/%' OR body LIKE '%/v1/attachments/%')",
    )
    .bind(work)
    .all<{ body: string }>();
  return results.map((r) => r.body);
}

/**
 * Delete uploads no work ever claimed.
 *
 * The age is the whole safety of it. A shot is claimed when the work naming it is written, which
 * is minutes after the upload at worst and never before it — so anything unclaimed and older than
 * a day belongs to a form somebody abandoned. A shorter window would race a tester who is still
 * typing.
 *
 * Bounded per run so one sweep cannot spend a scheduled invocation's whole budget on a backlog;
 * the next night takes the next batch.
 */
export async function sweepOrphans(env: ShotEnv, { hours = 24, limit = 500 } = {}) {
  const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
  const { results } = await env.DB.prepare(
    "SELECT id, type FROM shot WHERE work_id = '' AND created < ? ORDER BY created LIMIT ?",
  )
    .bind(cutoff, limit)
    .all<{ id: string; type: string }>();
  if (!results.length) return { swept: 0, deferred: 0 };

  // The bucket first, for the same reason work deletion does it that way: an object with no row
  // is invisible waste, a row pointing at a file that is gone is a broken image on a page.
  //
  // And if the bucket refuses, stop. Deleting the rows anyway would strand those objects for good:
  // the row is the only record that they exist, so nothing would ever look for them again. Leaving
  // both means tomorrow's run tries the same batch.
  if (env.SHOTS) {
    try {
      await env.SHOTS.delete(results.map((r) => shotKey(r.id, r.type)));
    } catch {
      return { swept: 0, deferred: results.length };
    }
  }
  // In slices: D1 refuses a statement binding more than 100 parameters, and a batch is up to 500.
  const ids = results.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    await env.DB.prepare(`DELETE FROM shot WHERE id IN (${slice.map(() => "?").join(",")})`)
      .bind(...slice)
      .run();
  }
  return { swept: results.length, deferred: 0 };
}

/**
 * When each of these closed work loses its proof screenshots, for the ones that will: closed,
 * holding a shot its own markdown does not name. The same two conditions sweepProof deletes on, so a date shown here is a date that
 * happens. At most one slice of bound ids per call (D1 takes 100).
 */
export async function proofExpiry(
  db: D1Database,
  ids: string[],
  days = PROOF_DAYS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { results } = await db
    .prepare(
      `SELECT g.id, MIN(g.updated) AS updated FROM work g
         JOIN shot s ON s.work_id = g.id
        WHERE g.id IN (${ids.map(() => "?").join(",")}) AND g.status = 'done'
          AND instr(g.markdown, '/v1/shots/' || s.id) = 0
        GROUP BY g.id`,
    )
    .bind(...ids)
    .all<{ id: string; updated: string }>();
  for (const r of results)
    out.set(r.id, new Date(Date.parse(r.updated) + days * 86_400_000).toISOString());
  return out;
}
