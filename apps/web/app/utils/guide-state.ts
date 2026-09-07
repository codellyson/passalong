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
  action: "pull" | "verdict" | "reason" | "link" | "open";
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
    action: "reason",
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
  put(board.waiting, STATES.waiting);
  put(board.failing, STATES.failing);
  put(board.in_flight, STATES.flight);
  // Two buckets, one state. `promote` is `landed` with three or more pulls, and the pull count is
  // already printed on the row.
  put(board.landed, STATES.landed);
  put(board.promote, STATES.landed);
  return out;
}

export function stateOf(
  g: Guide,
  fromBoard: Map<string, GuideState>,
  me: string | null,
): GuideState | null {
  const said = fromBoard.get(g.id);
  if (said) return said;

  // Handed to you and off the board, which happens the moment you pull it. Whether it still needs
  // you is whether you have answered.
  if (!g.mine) {
    const mine = g.verdict && me && g.verdict.by === me ? g.verdict : null;
    if (!mine) return STATES.unjudged;
    return mine.ok ? STATES.landed : STATES.failing;
  }

  // Yours, and in none of the buckets: shared with nobody, or closed out. Nothing is in transit.
  return null;
}
