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
  await env.DB.prepare(`DELETE FROM shot WHERE id IN (${results.map(() => "?").join(",")})`)
    .bind(...results.map((r) => r.id))
    .run();
  return { swept: results.length, deferred: 0 };
}
