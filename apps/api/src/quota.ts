/**
 * How much of the free tier an account has used, and where its ceiling is.
 *
 * This exists because the two answers used to be computed in two places and disagreed: the hub's
 * banner counted every piece of work an account had, while the publish path counted only the ones that
 * actually take up room. So the interface said "25 of 25, the next share will be refused" while
 * shares went on working, and the number people were asked to act on was not the number being
 * enforced.
 */

/**
 * What is counted against the free limit: every piece of work kept, in every status (STATUSES in
 * work.ts, written out because this module imports no sibling). Only Ready used to count, so
 * archiving made room and a draft took none; a free account could keep any amount as long as it
 * archived as it went (2026-11-05). Now only deleting makes room.
 */
export const COUNTED = ["draft", "ready", "done"] as const;

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
 * encoding for that is also zero — a limit of zero work — which is the exact value already
 * spoken for. Worse, every consumer tests `me.limit` for truthiness, so both zeroes read as
 * "unlimited" and the account that may sync nothing is told it may sync everything.
 *
 * So the state is named and the number is only meaningful for one of them, the same shape as
 * `team.plan`: one field, three values, none of which can be confused for another.
 *
 *   unlimited  Solo, or work going to a paying team. `limit` is not consulted.
 *   free       the grandfathered ceiling. `limit` is the number of synced work allowed.
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
 * A paying team covers the work in it, and only that: a free member of a paid team sends the team
 * as much as it likes, and their own work outside it counts against the free limit until they buy
 * Solo. It used to be the seat that was lifted, everywhere, so nobody on a team ever needed Solo
 * (2026-11-05). `covered` says the work at hand is going to a team that is paying now; quota() in
 * index.ts asks it on every read, and leaves work in paying teams out of what it counts, rather than
 * copying anything onto the account. A lapsed team covers nothing.
 *
 * Below that sits grandfathering, which is the one thing here that is a fact about the account
 * rather than about a plan: an account that existed before the free tier was withdrawn keeps the
 * ceiling it had. See migrations/0016_grandfather.sql.
 *
 * `freeSignup` is the cutover switch and it still defaults to open, so that closing it stays a
 * deliberate act rather than a consequence of deploying. Solo now has a purchase path, which was
 * the thing it was waiting on.
 */
export function ceilingFor(
  covered: unknown,
  override: unknown,
  fallback: unknown,
  grandfathered: unknown = 0,
  freeSignup: unknown = "1",
  ownPlan: unknown = "free",
): Ceiling {
  // Solo covers everything this person sends; a paying team covers what goes to it.
  if (Number(covered) > 0 || String(ownPlan ?? "free") === "solo")
    return { plan: "unlimited", limit: 0 };
  // A lapsed plan is not a punishment: it falls through to whatever this account would have had
  // without one, which for somebody who predates the cutover is their grandfathered ceiling.
  const open = String(freeSignup ?? "1") !== "0";
  if (Number(grandfathered) > 0 || open)
    return { plan: "free", limit: limitFor(override, fallback) };
  return { plan: "none", limit: 0 };
}

/** What ceilingFor() needs about one account, read in one query. */
export interface RoomRow {
  /** COUNTED work of theirs that no paying team covers. */
  used: number;
  own: number;
  old: number;
  /** 1 when `team` is paying now, so the work at hand is covered. */
  covered: number;
  own_plan: string;
  own_until: string;
}

/**
 * The facts an account's room is worked out from, for work going to `team` ("" for none, or for
 * the account as a whole). Work in a team that is paying is not counted, and work going to one is
 * `covered`: a paying team covers what is in it and nothing else (ceilingFor). A team whose gift
 * has run out is not paying, the mirror of planNow() as SQL.
 */
export async function roomOf(
  db: D1Database,
  account: string,
  team: string,
  at: string,
): Promise<RoomRow | null> {
  const marks = COUNTED.map(() => "?").join(", ");
  const paying = "t.plan = 'team' AND (t.plan_until = '' OR t.plan_until > ?)";
  return db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM work w WHERE w.account_id = ? AND w.status IN (${marks})
                 AND NOT EXISTS (SELECT 1 FROM team t WHERE t.id = w.team_id AND ${paying})) AS used,
              (SELECT sync_limit FROM account WHERE id = ?) AS own,
              (SELECT grandfathered FROM account WHERE id = ?) AS old,
              (SELECT plan FROM account WHERE id = ?) AS own_plan,
              (SELECT plan_until FROM account WHERE id = ?) AS own_until,
              (SELECT COUNT(*) FROM team t WHERE t.id = ? AND ${paying}) AS covered`,
    )
    .bind(account, ...COUNTED, at, account, account, account, account, team, at)
    .first<RoomRow>();
}

/** Whether one more work would go over. Written once so the check and the warning agree. */
export function isFull(used: number, ceiling: Ceiling): boolean {
  if (ceiling.plan === "unlimited") return false;
  if (ceiling.plan === "none") return true;
  return used >= ceiling.limit;
}

/** The three plans a team can be on. One column, because `free` + `lapsed` is not a real state. */
export const PLANS = ["free", "team", "lapsed"] as const;
export type Plan = (typeof PLANS)[number];

/** The same three for one person. `solo` rather than `team` so the column says which was bought. */
export const ACCOUNT_PLANS = ["free", "solo", "lapsed"] as const;
export type AccountPlan = (typeof ACCOUNT_PLANS)[number];

/**
 * A plan as it stands right now, given that it may have been a gift with an end date.
 *
 * A comped plan is the same plan by the same name — what else would it be — so the only thing that
 * marks it is `plan_until` beside it (migrations/0026_gifts.sql). Past that moment the plan reads
 * `lapsed`, which is already the word for "it was paid and is not now" and already falls back to
 * whatever the account would have had without a plan at all.
 *
 * Derived on every read rather than written by something on a clock, for the same reason a task's
 * state is: a value only a nightly job updates is wrong for up to a day, and on the day the job
 * does not run it is wrong until somebody notices.
 *
 * An empty `until` is what a bought subscription has — the provider owns when that stops, and says
 * so with a webhook — so it means no end, not an end that has passed. Mirrored in SQL by
 * `PAYING_TEAM` in index.ts, for the queries that count paid teams.
 */
export function planNow(plan: string, until: unknown, at: string): string {
  const ends = String(until ?? "");
  // Only a plan somebody has can run out. `free` and `lapsed` are the after-states, and running one
  // of those through here would invent a plan change out of a stale date.
  if (plan !== "solo" && plan !== "team") return plan;
  return ends && ends <= at ? "lapsed" : plan;
}

/**
 * Whether new work may be addressed to a team.
 *
 * `lapsed` is read-only, and read-only is narrower than it sounds: what stops is work flowing *in*
 * — a new work addressed to the team, a new member joining. What must not stop is work already in
 * flight closing, because taking, handing in and passing belong to whoever does the work and the reader is not the person
 * who missed the payment.
 */
export const acceptsNewWork = (plan: string): boolean => plan !== "lapsed";

/** Whether a team has room for one more member. Seats are only a limit on a paid plan. */
export function seatsFull(plan: string, seats: unknown, members: unknown): boolean {
  if (plan !== "team") return false;
  const paidFor = Math.trunc(Number(seats)) || 0;
  return paidFor > 0 && Number(members) >= paidFor;
}

// ---- Telling people it is time to pay ------------------------------------------------------
//
// The wall at the free limit was the only message, and it was said to whoever hit it — most often
// an agent, mid-task, while the person who could pay never opened the hub where the 80% banner
// lives. So reaching the warning line and reaching the limit are each said once, at the moment they
// happen, by feed, push and mail; and a plan that will not renew is said a week before it ends and
// the day before.

/** The share of the free limit at which somebody hears they are close: 20 of 25. */
export const NEAR_SHARE = 0.8;

/** The count at which an account on `limit` is close to it — the line the hub's banner draws. */
export const nearAt = (limit: number) => Math.ceil(limit * NEAR_SHARE);

/**
 * The notice the count reaching `used` deserves, or "" for none. Asked only right after an act that
 * added one to the count, so equality is "this act is the one that reached it": a count that hovers
 * at 20 is told once, and told again only after it has gone below and come back.
 */
export function limitReached(used: number, ceiling: Ceiling): "near_limit" | "at_limit" | "" {
  if (ceiling.plan !== "free" || ceiling.limit <= 0) return "";
  if (used === ceiling.limit) return "at_limit";
  if (used === nearAt(ceiling.limit)) return "near_limit";
  return "";
}

/** How many days before a plan ends its owners hear it will: a week, and the day before. */
export const ENDING_NOTICES = [7, 1] as const;
const DAY = 24 * 60 * 60 * 1000;

/** A plan that will end rather than renew, in the hourly run that is a whole number of days before. */
export interface Ending {
  /** Whose plan: one person's Solo, or a team's. */
  of: "account" | "team";
  id: string;
  name: string;
  ends: string;
  days: (typeof ENDING_NOTICES)[number];
  /** Given rather than bought (`plan_until`); otherwise bought and cancelled (`plan_ends`). */
  given: boolean;
}

/**
 * Plans that end in ENDING_NOTICES days, as of the run at `at` that is `window` wide. A plan that
 * renews has neither date and is never here — telling somebody whose subscription carries on that
 * it is ending would be the alarm that teaches them to ignore the next one. `plan_until` is a gift's
 * end, `plan_ends` a cancelled subscription's (migrations 0026, 0055); whichever comes first.
 */
export async function plansEnding(db: D1Database, at: string, window: number): Promise<Ending[]> {
  const now = Date.parse(at);
  type Row = { id: string; name: string; plan_until: string; plan_ends: string };
  const [{ results: people }, { results: teams }] = await Promise.all([
    db
      .prepare(
        `SELECT id, COALESCE(NULLIF(name, ''), NULLIF(handle, ''), id) AS name, plan_until, plan_ends
           FROM account WHERE plan = 'solo' AND (plan_until <> '' OR plan_ends <> '')`,
      )
      .all<Row>(),
    db
      .prepare(
        `SELECT id, COALESCE(NULLIF(name, ''), slug) AS name, plan_until, plan_ends
           FROM team WHERE plan = 'team' AND (plan_until <> '' OR plan_ends <> '')`,
      )
      .all<Row>(),
  ]);
  const out: Ending[] = [];
  const each = (of: Ending["of"], r: Row) => {
    const ends = [r.plan_until, r.plan_ends].filter(Boolean).sort()[0] as string;
    const left = Date.parse(ends) - now;
    for (const days of ENDING_NOTICES)
      if (left <= days * DAY && left > days * DAY - window)
        out.push({ of, id: r.id, name: r.name, ends, days, given: ends === r.plan_until });
  };
  for (const r of people) each("account", r);
  for (const r of teams) each("team", r);
  return out;
}
