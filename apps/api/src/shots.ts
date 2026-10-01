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
 * The evidence of every hand-in on a guide, as it was written.
 *
 * Parsing it for shot ids is the caller's job: the parser lives in guide.ts with the markdown it
 * was written for, and this file deliberately imports no sibling so it can be tested against a
 * real SQLite the way claims.ts is.
 */
export async function evidenceOn(db: D1Database, guide: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT evidence FROM claim WHERE guide_id = ? AND evidence <> ''")
    .bind(guide)
    .all<{ evidence: string }>();
  return results.map((r) => r.evidence);
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
