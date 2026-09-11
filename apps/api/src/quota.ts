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

/**
 * No ceiling at all, which is what a seat on a paid team buys.
 *
 * Zero rather than Infinity because this number crosses a wire: `/v1/me` sends it, JSON has no
 * Infinity, and `JSON.stringify(Infinity)` is `null` — a limit that silently becomes "unknown" on
 * the client. Zero also happens to be what the hub already treats as no limit (`me.limit &&
 * me.guides >= me.limit` is false when it is zero), so the interface needed no teaching.
 *
 * It cannot collide with `limitFor`'s zero, which means "nobody set an override" and never leaves
 * that function — `limitFor` always returns a positive number.
 */
export const UNLIMITED = 0;

/**
 * An account's real ceiling, plan included.
 *
 * A seat lifts the person sitting in it, and the person sitting in it may never have paid for
 * anything: §11 sells the team, so a free member of a paid team publishes without a ceiling. That
 * is derived here, on every read, from the team's current plan — never written onto the account.
 * Copying it would mean rewriting a row for every member each time a plan changes, a membership
 * changes, or a payment fails, and the copy that is missed is an account that is still unlimited
 * after the team stopped paying.
 *
 * A lapsed team lifts nobody. Its members fall back to their own ceiling, which is the free one
 * unless they were given an override, and their existing guides stay exactly where they are.
 */
export function ceilingFor(paidTeams: unknown, override: unknown, fallback: unknown): number {
  return Number(paidTeams) > 0 ? UNLIMITED : limitFor(override, fallback);
}

/** Whether one more guide would go over. Written once so the check and the warning agree. */
export function isFull(used: number, limit: number): boolean {
  return limit !== UNLIMITED && used >= limit;
}

/** The three plans a team can be on. One column, because `free` + `lapsed` is not a real state. */
export const PLANS = ["free", "team", "lapsed"] as const;
export type Plan = (typeof PLANS)[number];

/**
 * Whether new work may be addressed to a team.
 *
 * `lapsed` is read-only, and read-only is narrower than it sounds: what stops is work flowing *in*
 * — a new guide addressed to the team, a new member joining. What must not stop is work already in
 * flight closing, because a verdict and an ack belong to the reader and the reader is not the person
 * who missed the payment.
 */
export const acceptsNewWork = (plan: string): boolean => plan !== "lapsed";

/** Whether a team has room for one more member. Seats are only a limit on a paid plan. */
export function seatsFull(plan: string, seats: unknown, members: unknown): boolean {
  if (plan !== "team") return false;
  const paidFor = Math.trunc(Number(seats)) || 0;
  return paidFor > 0 && Number(members) >= paidFor;
}
