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
 * What an account may sync, as a name rather than a number.
 *
 * This was one integer with `0` meaning "no ceiling". That worked while there were two answers; it
 * cannot survive a third. Removing the free tier adds "may not sync at all", and the obvious
 * encoding for that is also zero — a limit of zero guides — which is the exact value already
 * spoken for. Worse, every consumer tests `me.limit` for truthiness, so both zeroes read as
 * "unlimited" and the account that may sync nothing is told it may sync everything.
 *
 * So the state is named and the number is only meaningful for one of them, the same shape as
 * `team.plan`: one field, three values, none of which can be confused for another.
 *
 *   unlimited  a seat on a paid team. `limit` is not consulted.
 *   free       the grandfathered ceiling. `limit` is the number of synced guides allowed.
 *   none       no plan and no grandfathering: nothing may be synced until there is one.
 */
export const SYNC_PLANS = ["unlimited", "free", "none"] as const;
export type SyncPlan = (typeof SYNC_PLANS)[number];

export interface Ceiling {
  plan: SyncPlan;
  /** Only meaningful when `plan` is "free". Zero otherwise, and never read in those cases. */
  limit: number;
}

/**
 * An account's real ceiling, in order of what beats what.
 *
 * A seat lifts whoever sits in it, paid for or not: §11 sells the team, so a free member of a paid
 * team publishes without a ceiling. That is derived here on every read from the team's current plan
 * and never written onto the account — copying it would mean rewriting a row for every member each
 * time a plan changes, a membership changes or a payment fails, and the copy that is missed is an
 * account still unlimited after the team stopped paying. A lapsed team lifts nobody.
 *
 * Below that sits grandfathering, which is the one thing here that is a fact about the account
 * rather than about a plan: an account that existed before the free tier was withdrawn keeps the
 * ceiling it had. See migrations/0016_grandfather.sql.
 *
 * `freeSignup` is the cutover switch and it defaults to open. New accounts keep the free ceiling
 * until there is something for an individual to buy — the Solo plan on the landing page has no
 * purchase path yet, and closing this first would leave a new account able to create itself and
 * nothing else. Set `FREE_SIGNUP=0` the day Solo ships.
 */
export function ceilingFor(
  paidTeams: unknown,
  override: unknown,
  fallback: unknown,
  grandfathered: unknown = 0,
  freeSignup: unknown = "1",
): Ceiling {
  if (Number(paidTeams) > 0) return { plan: "unlimited", limit: 0 };
  const open = String(freeSignup ?? "1") !== "0";
  if (Number(grandfathered) > 0 || open)
    return { plan: "free", limit: limitFor(override, fallback) };
  return { plan: "none", limit: 0 };
}

/** Whether one more guide would go over. Written once so the check and the warning agree. */
export function isFull(used: number, ceiling: Ceiling): boolean {
  if (ceiling.plan === "unlimited") return false;
  if (ceiling.plan === "none") return true;
  return used >= ceiling.limit;
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
