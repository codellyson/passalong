/**
 * How much of the free tier an account has used, and where its ceiling is.
 *
 * This exists because the two answers used to be computed in two places and disagreed: the hub's
 * banner counted every guide an account had, while the publish path counted only the ones that
 * actually take up room. So the interface said "25 of 25, the next share will be refused" while
 * shares went on working, and the number people were asked to act on was not the number being
 * enforced.
 */

/** What a synced guide is, for counting: the statuses that occupy room on the hosted copy. */
export const COUNTED = ["published", "promoted"] as const;

/**
 * An account's ceiling. The per-account override wins when it is set; zero means "not set", so a
 * fresh account gets the deployment's default without anything having to write a row.
 */
export function limitFor(override: unknown, fallback: unknown, fallbackDefault = 25): number {
  const own = Math.trunc(Number(override)) || 0;
  if (own > 0) return own;
  const env = Math.trunc(Number(fallback)) || 0;
  return env > 0 ? env : fallbackDefault;
}

/** Whether one more guide would go over. Written once so the check and the warning agree. */
export function isFull(used: number, limit: number): boolean {
  return used >= limit;
}
