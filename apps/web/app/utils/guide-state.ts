/**
 * What state one guide is in, for the list.
 *
 * Four, and they answer the only three questions anyone opens this product with: is something
 * waiting on me, did the thing I handed over get taken, and did it work.
 *
 *   waiting on you   something is needed from you — pull it, or say whether it worked
 *   in flight        you handed it over and nobody has taken it
 *   landed           someone else has it
 *   not working      someone tried it and said so
 *
 * There were eleven. The five extra came from the lifecycle field (`consumed`, `promoted`) and
 * from states invented here to describe guides the board's buckets did not cover. `stale` is not
 * a state — it is an age, and it reads as one on the row. `worth keeping` was a pull counter
 * wearing a badge, and it means "going well", which is not something anyone acts on. `done`
 * duplicated the verdict: if you said it worked, you are done.
 *
 * A guide with no live transfer — shared with nobody, or already closed out — gets no badge at
 * all. The absence of a transfer is honestly the absence of a state, and the row's own line
 * already says "addressed to nobody".
 *
 * The board's buckets are still the server's and are still matched by id; this only stops the hub
 * from drawing distinctions it does not need. Cutting the buckets themselves is an API change.
 */
import type { Board, Guide } from "~/types/hub";

export interface GuideState {
  key: string;
  label: string;
  /** Full class strings: Tailwind scans source text, so `bg-${tone}-soft` would never be found. */
  badge: string;
  stripe: string;
  /** The one action the row leads with. Everything else is behind the row's overflow. */
  action: "pull" | "ack" | "verdict" | "open-urgent" | "link" | "open";
  /** Someone is blocked, or something is rotting. Drives the "needs attention" filter. */
  attention: boolean;
}

const S = {
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
};

const STATES = {
  /** Handed to you and not pulled: the command is the action. */
  waiting: {
    key: "waiting",
    label: "waiting on you",
    badge: S.accent,
    stripe: "border-l-accent",
    action: "pull",
    attention: true,
  },
  /**
   * Handed to you and not answered at all. The same lane as `waiting` with a different first
   * move: before pulling anything, the sender is owed one word about whether you are taking it.
   */
  unanswered: {
    key: "unanswered",
    label: "waiting on you",
    badge: S.accent,
    stripe: "border-l-accent",
    action: "ack",
    attention: true,
  },
  /** Handed to you, pulled, and you have not said whether it worked. Also waiting on you — the
      sender is owed a sentence — so it carries the same badge and a different action. */
  unjudged: {
    key: "unjudged",
    label: "waiting on you",
    badge: S.accent,
    stripe: "border-l-accent",
    action: "verdict",
    attention: true,
  },
  failing: {
    key: "failing",
    label: "not working",
    badge: S.danger,
    stripe: "border-l-danger",
    action: "open-urgent",
    attention: true,
  },
  flight: {
    key: "flight",
    label: "in flight",
    badge: S.warn,
    stripe: "border-l-warn",
    action: "link",
    attention: false,
  },
  landed: {
    key: "landed",
    label: "landed",
    badge: S.ok,
    stripe: "border-l-ok",
    action: "open",
    attention: false,
  },
  /**
   * Handed over and handed back. Not a failure of the work — nobody has tried it — but it has
   * stopped moving and only its author can start it again, so it earns attention on their board
   * the way a failing verdict does.
   */
  passed: {
    key: "passed",
    label: "nobody has taken it",
    badge: S.warn,
    stripe: "border-l-warn",
    action: "open-urgent",
    attention: true,
  },
  /** Somebody said they are on it. Still in flight, but no longer a question. */
  taken: {
    key: "taken",
    label: "someone is on it",
    badge: S.accent,
    stripe: "border-l-accent",
    action: "link",
    attention: false,
  },
} satisfies Record<string, GuideState>;

/** No badge: nothing is in transit, so there is no state to report. */
export const NO_STATE: GuideState | null = null;

/** id → state, for every guide the board is currently showing. */
export function boardStates(board: Board | null): Map<string, GuideState> {
  const out = new Map<string, GuideState>();
  if (!board) return out;
  const put = (guides: Guide[] | undefined, state: GuideState) => {
    for (const g of guides ?? []) out.set(g.id, state);
  };
  // No precedence to apply: each bucket's SQL carries the negation of the ones above it, so a
  // guide arrives in exactly one of them.
  //
  // Two of the buckets split by who has answered, which the SQL does not do and should not: the
  // bucket is where a guide is, and an ack is the first word about it. In your inbox that decides
  // the row's first move; on your own board it decides whether "in flight" is still a question.
  for (const g of board.waiting ?? []) {
    out.set(g.id, g.my_ack ? STATES.waiting : STATES.unanswered);
  }
  put(board.failing, STATES.failing);
  for (const g of board.in_flight ?? []) {
    out.set(
      g.id,
      g.declined?.length ? STATES.passed : g.taken_by?.length ? STATES.taken : STATES.flight,
    );
  }
  put(board.landed, STATES.landed);
  return out;
}

/** A teammate took it, or said how it went. `me` is your @handle, which `taken_by` lists. */
export function handledByOthers(g: Guide, me: string | null): boolean {
  const others = (g.taken_by ?? []).filter((h) => h !== me);
  return others.length > 0 || Boolean(g.verdict && g.verdict.by !== me);
}

export function stateOf(
  g: Guide,
  fromBoard: Map<string, GuideState>,
  me: string | null,
): GuideState | null {
  const said = fromBoard.get(g.id);
  if (said) return said;

  // Handed to you and off the board, which happens the moment you pull it — or the moment you
  // pass on it, which takes it off your board for good. Nothing is in transit for you after that.
  if (!g.mine && g.my_ack && !g.my_ack.taken) return null;

  // Sent to a team or a group, and a teammate has already taken it or said how it went. It asked
  // one of you, not each of you: it is not waiting on you, and showing it as though it were is how
  // a second person starts work somebody has already done. Unless it was asked of you by name, or
  // you took it yourself — then it is still yours to answer.
  if (!g.mine && !g.for_me && !g.my_ack?.taken && handledByOthers(g, me)) return null;

  // Handed to you and off the board. Whether it still needs you is whether you have answered.
  if (!g.mine) {
    const mine = g.verdict && me && g.verdict.by === me ? g.verdict : null;
    if (!mine) return STATES.unjudged;
    return mine.ok ? STATES.landed : STATES.failing;
  }

  // Yours, and in none of the buckets: shared with nobody, or closed out. Nothing is in transit.
  return null;
}
