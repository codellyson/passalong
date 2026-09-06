/**
 * What state one guide is in, for the list.
 *
 * The board's five buckets are defined in SQL and the hub renders them — it does not work them
 * out. That rule is kept here: a guide that appears on the board takes the board's word for which
 * bucket it is in, matched by id. Nothing re-derives "has anyone else pulled this", which is the
 * question the client cannot answer (`pulls` counts your own pulls too) and the one the buckets
 * exist to answer.
 *
 * The list is wider than the board, though, so three states have no bucket and are read off the
 * guide itself:
 *
 *   - a guide handed to you that you have already pulled — the board drops it the moment you do,
 *     and it is the only place a verdict can still be given
 *   - your own guides that have left `published`: done, or kept
 *   - a guide you shared with nobody, which no bucket claims because none of them can
 */
import type { Board, Guide } from "~/types/hub";

export interface GuideState {
  key: string;
  label: string;
  /** Sort position in the list: blocked on you, then rotting, then in motion, then settled. */
  rank: number;
  /** Badge and stripe are full class strings, not composed at runtime: Tailwind scans source text
      for candidates, and a `bg-${tone}-soft` would never be found. */
  badge: string;
  stripe: string;
  /** The one action the row leads with. Everything else lives in the row's overflow. */
  action: "pull" | "reason" | "link" | "promote" | "open" | "verdict";
  /** Counts toward "needs attention": someone is blocked, or something is rotting. */
  attention: boolean;
}

const S = {
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  flat: "bg-surface text-muted",
};

const STATES: Record<string, GuideState> = {
  waiting: {
    key: "waiting",
    rank: 0,
    label: "waiting on you",
    badge: S.accent,
    stripe: "border-l-accent",
    action: "pull",
    attention: true,
  },
  failing: {
    key: "failing",
    rank: 2,
    label: "not working",
    badge: S.danger,
    stripe: "border-l-danger",
    action: "reason",
    attention: true,
  },
  flight: {
    key: "flight",
    rank: 5,
    label: "in flight",
    badge: S.warn,
    stripe: "border-l-warn",
    action: "link",
    attention: false,
  },
  stale: {
    key: "stale",
    rank: 4,
    label: "in flight · stale",
    badge: S.warn,
    stripe: "border-l-warn",
    action: "link",
    attention: true,
  },
  landed: {
    key: "landed",
    rank: 7,
    label: "landed",
    badge: S.flat,
    stripe: "border-l-line-strong",
    action: "link",
    attention: false,
  },
  promote: {
    key: "promote",
    rank: 8,
    label: "worth keeping",
    badge: S.ok,
    stripe: "border-l-ok",
    action: "promote",
    attention: false,
  },
  // Handed to you, pulled, and you have not said whether it worked. The sender is waiting on a
  // sentence from you, which is the whole point of the product — so it counts as attention.
  unjudged: {
    key: "unjudged",
    rank: 1,
    label: "no verdict yet",
    badge: S.warn,
    stripe: "border-l-warn",
    action: "verdict",
    attention: true,
  },
  works: {
    key: "works",
    rank: 6,
    label: "works",
    badge: S.ok,
    stripe: "border-l-ok",
    action: "open",
    attention: false,
  },
  broke: {
    key: "broke",
    rank: 3,
    label: "you said it doesn't work",
    badge: S.danger,
    stripe: "border-l-danger",
    action: "reason",
    attention: false,
  },
  done: {
    key: "done",
    rank: 9,
    label: "done",
    badge: S.flat,
    stripe: "border-l-line-strong",
    action: "open",
    attention: false,
  },
  unsent: {
    key: "unsent",
    rank: 10,
    label: "not sent",
    badge: S.flat,
    stripe: "border-l-line-strong",
    action: "link",
    attention: false,
  },
};

/** id → state, for every guide the board is currently showing. */
export function boardStates(board: Board | null): Map<string, GuideState> {
  const out = new Map<string, GuideState>();
  if (!board) return out;
  const put = (guides: Guide[] | undefined, state: GuideState) => {
    for (const g of guides ?? []) out.set(g.id, state);
  };
  // No precedence to apply: each bucket's SQL carries the negation of the ones above it, so a
  // guide arrives in exactly one of them. Deciding it again here would be this file disagreeing
  // with the CLI and the agent tool, which read the same endpoint and never did.
  put(board.waiting, STATES.waiting as GuideState);
  put(board.failing, STATES.failing as GuideState);
  for (const g of board.in_flight ?? []) {
    out.set(g.id, (g.stale ? STATES.stale : STATES.flight) as GuideState);
  }
  put(board.landed, STATES.landed as GuideState);
  put(board.promote, STATES.promote as GuideState);
  return out;
}

export function stateOf(
  g: Guide,
  fromBoard: Map<string, GuideState>,
  me: string | null,
): GuideState {
  const said = fromBoard.get(g.id);
  if (said) return said;

  if (!g.mine) {
    // `verdict` is the latest word from anyone; only your own is a statement about what you did.
    const mine = g.verdict && me && g.verdict.by === me ? g.verdict : null;
    if (mine) return (mine.ok ? STATES.works : STATES.broke) as GuideState;
    return STATES.unjudged as GuideState;
  }

  if (g.status === "promoted") return STATES.promote as GuideState;
  if (g.status === "consumed") return STATES.done as GuideState;
  // Published, yours, and in none of the four sender buckets: it was shared with nobody, so there
  // is no transfer to be in flight.
  return STATES.unsent as GuideState;
}
