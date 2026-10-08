/**
 * Screenshot storage: what a stored file is called, and how the ones nobody wants go away.
 *
 * A shot is claimed by the guide whose markdown points at it, and deleting that guide takes it —
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
 * Point a guide at the screenshots it carries, and let go of any it no longer does.
 *
 * `mine` is what the writer of this call put there — the ids in the document it just published, or
 * in the evidence it just handed in — and only the account that uploaded a shot can claim it.
 * Without `account_id` in that WHERE, naming someone else's id in your own markdown would take
 * their image, and deleting your guide would then delete it.
 *
 * `carried` is everything the guide points at from anywhere, which is what decides the release.
 * The two differ because a guide carries shots from more than one source and more than one person:
 * its own markdown, written by its author, and the evidence of each hand-in on it, written by
 * whoever did the work. Releasing on `mine` alone would mean an author's next edit dropped the
 * screenshot a teammate handed in — and a day later the sweep would delete it.
 *
 * A released shot becomes an orphan rather than being deleted here: the same upload can be
 * referenced by a second guide, and a write is the wrong moment to decide nobody wants a file.
 */
export async function holdShots(
  db: D1Database,
  { account, guide, mine, carried }: Hold,
): Promise<void> {
  const keep = [...new Set([...mine, ...carried])];
  const holes = keep.map(() => "?").join(",");
  const statements = [];
  if (mine.length)
    statements.push(
      db
        .prepare(
          `UPDATE shot SET guide_id = ? WHERE account_id = ? AND id IN (${mine
            .map(() => "?")
            .join(",")})`,
        )
        .bind(guide, account, ...mine),
    );
  statements.push(
    keep.length
      ? db
          .prepare(`UPDATE shot SET guide_id = '' WHERE guide_id = ? AND id NOT IN (${holes})`)
          .bind(guide, ...keep)
      : db.prepare("UPDATE shot SET guide_id = '' WHERE guide_id = ?").bind(guide),
  );
  await db.batch(statements);
}

/** What holdShots() needs: who is claiming, for what guide, what they wrote, what it all carries. */
interface Hold {
  account: string;
  guide: string;
  /** Shot ids in what this caller just wrote. Only these are claimed, and only for `account`. */
  mine: string[];
  /** Shot ids the guide points at from anywhere. Anything outside this is released. */
  carried: string[];
}

/**
 * The evidence of every hand-in on a guide, and the proof on every verdict, as it was written.
 *
 * A "works" verdict carries screenshots of it working (see PROOF_DAYS), and they live on the
 * verdict row rather than on a claim. Leaving them out here would let the author's next edit
 * release them, and the orphan sweep would take them a day later.
 *
 * Parsing it for shot ids is the caller's job: the parser lives in guide.ts with the markdown it
 * was written for, and this file deliberately imports no sibling so it can be tested against a
 * real SQLite the way claims.ts is.
 */
export async function evidenceOn(db: D1Database, guide: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT evidence AS text FROM claim WHERE guide_id = ?1 AND evidence <> ''
       UNION ALL
       SELECT detail FROM verdict WHERE guide_id = ?1 AND detail <> ''`,
    )
    .bind(guide)
    .all<{ text: string }>();
  return results.map((r) => r.text);
}

/**
 * How long proof outlives the guide it proves, once that guide is closed.
 *
 * Proof is a screenshot of the thing working: somebody says a guide works, and shows it. It is
 * there for the review, and the review ends when the author closes the guide or approves the task.
 * Keeping every screenshot of every finished piece of work forever is storage nobody reads, so
 * five days after closing it goes — long enough to reopen something that was closed too early and
 * still see why somebody said it worked. What the guide's own document shows is never proof: it
 * is the document, and it stays for as long as the guide does.
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
 * Delete the proof on guides closed more than PROOF_DAYS ago.
 *
 * Proof is any shot a closed guide holds that its own markdown does not name: the screenshots on
 * a "works" verdict, and those in a hand-in's evidence. `updated` is when the guide was closed —
 * closing writes the status into the markdown — and a guide edited or put back since starts the
 * clock again, which is the safe direction for it to be wrong in.
 *
 * The text that pointed at a removed shot says so rather than showing a broken image: a verdict
 * that reads "works" beside an empty frame looks like proof that failed to load, not proof that
 * was tidied away on schedule. Bucket first and stop if it refuses, as sweepOrphans does.
 *
 * Not for an account that has asked to keep everything (`account.keep_forever`): its guides' proof
 * stays, whoever closed them.
 */
export async function sweepProof(
  env: ShotEnv,
  { days = PROOF_DAYS, limit = 200, at = Date.now() } = {},
) {
  const cutoff = new Date(at - days * 86_400_000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.type, s.guide_id FROM shot s JOIN guide g ON g.id = s.guide_id
        JOIN account a ON a.id = g.account_id
      WHERE g.status = 'consumed' AND g.updated < ? AND a.keep_forever = 0
        AND instr(g.markdown, '/v1/shots/' || s.id) = 0
      ORDER BY g.updated LIMIT ?`,
  )
    .bind(cutoff, limit)
    .all<{ id: string; type: string; guide_id: string }>();
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

  const byGuide = new Map<string, string[]>();
  for (const r of results) byGuide.set(r.guide_id, [...(byGuide.get(r.guide_id) ?? []), r.id]);
  for (const [guide, gone] of byGuide) {
    const { results: said } = await env.DB.prepare(
      "SELECT account_id, note, detail FROM verdict WHERE guide_id = ?",
    )
      .bind(guide)
      .all<{ account_id: string; note: string; detail: string }>();
    for (const v of said) {
      const note = strike(v.note, gone);
      const detail = strike(v.detail, gone);
      if (note !== v.note || detail !== v.detail)
        await env.DB.prepare(
          "UPDATE verdict SET note = ?, detail = ? WHERE guide_id = ? AND account_id = ?",
        )
          .bind(note, detail, guide, v.account_id)
          .run();
    }
    const { results: held } = await env.DB.prepare(
      "SELECT place, evidence FROM claim WHERE guide_id = ? AND evidence <> ''",
    )
      .bind(guide)
      .all<{ place: string; evidence: string }>();
    for (const k of held) {
      const evidence = strike(k.evidence, gone);
      if (evidence !== k.evidence)
        await env.DB.prepare("UPDATE claim SET evidence = ? WHERE guide_id = ? AND place = ?")
          .bind(evidence, guide, k.place)
          .run();
    }
  }
  return { removed: results.length, deferred: 0 };
}

/**
 * What was said in a guide's conversation that points at a screenshot: a person's reply with a
 * picture or a file on it. Same reason as the evidence above — it is a document somebody wrote, it is not the
 * guide's markdown, and without it the author's next edit would release the picture and the sweep
 * would delete it a day later.
 */
export async function conversationOn(db: D1Database, guide: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT body FROM task_event WHERE guide_id = ? AND (body LIKE '%/v1/shots/%' OR body LIKE '%/v1/attachments/%')",
    )
    .bind(guide)
    .all<{ body: string }>();
  return results.map((r) => r.body);
}

/**
 * Delete uploads no guide ever claimed.
 *
 * The age is the whole safety of it. A shot is claimed when the guide naming it is written, which
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
    "SELECT id, type FROM shot WHERE guide_id = '' AND created < ? ORDER BY created LIMIT ?",
  )
    .bind(cutoff, limit)
    .all<{ id: string; type: string }>();
  if (!results.length) return { swept: 0, deferred: 0 };

  // The bucket first, for the same reason guide deletion does it that way: an object with no row
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
 * When each of these closed guides loses its proof screenshots, for the ones that will: closed,
 * holding a shot its own markdown does not name, and written by somebody who has not asked to keep
 * everything. The same three conditions sweepProof deletes on, so a date shown here is a date that
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
      `SELECT g.id, MIN(g.updated) AS updated FROM guide g
         JOIN account a ON a.id = g.account_id
         JOIN shot s ON s.guide_id = g.id
        WHERE g.id IN (${ids.map(() => "?").join(",")}) AND g.status = 'consumed'
          AND a.keep_forever = 0 AND instr(g.markdown, '/v1/shots/' || s.id) = 0
        GROUP BY g.id`,
    )
    .bind(...ids)
    .all<{ id: string; updated: string }>();
  for (const r of results)
    out.set(r.id, new Date(Date.parse(r.updated) + days * 86_400_000).toISOString());
  return out;
}
