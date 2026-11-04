/**
 * What an answer does to the cached lists, before the server has confirmed it.
 *
 * Pressing I'll do this used to wait for the round trip and then reload six endpoints, so the row sat
 * unchanged for a second or two and read as a button that did nothing. These write the answer into
 * the cache at once; the hub rolls them back if the server refuses, and refetches either way.
 *
 * Pure and type-only imports, so it runs under `node --test` without Nuxt.
 */
import type { Board, Work, WorkContext } from "~/types/hub";

const BUCKETS = ["waiting", "in_flight", "landed"] as const;

export const withStatus = (g: Work, status: string): Work => ({ ...g, status });

/** Off the board entirely: passed on, answered, archived or deleted. */
export function dropFromBoard(board: Board, id: string): Board {
  const out = { ...board };
  for (const bucket of BUCKETS) out[bucket] = (board[bucket] ?? []).filter((g) => g.id !== id);
  return out;
}

export function patchList(work: Work[], id: string, fn: (g: Work) => Work): Work[] {
  return work.map((g) => (g.id === id ? fn(g) : g));
}

// ---- The work acts, as the server will answer them -----------------------------------------------
// Each writes the card's new place and the work page's new state at once (2026-11-04: every act on
// work answers before the server does). What only the server can know — which group a card falls
// under, who it was sent back to — is left as it was until the refetch that follows every act.

/** The board column a status puts a card in, when nobody holds it. */
const STAGE = { draft: "draft", ready: "todo", done: "done" } as const;

/** Moved to Draft, Ready or Done by a person: the column it lands in comes with it. */
export function moved(g: Work, status: "draft" | "ready" | "done", outcome = ""): Work {
  return {
    ...g,
    status,
    stage: STAGE[status],
    outcome: (status === "done" ? outcome : "") as Work["outcome"],
  };
}

/** Let go of: passed back, or its agent stopped. Back in To do, held by nobody. */
export const freed = (g: Work): Work => ({ ...g, stage: "todo", held_by: [] });

/** The person looking, as a hold and a proof name them. */
export interface Viewer {
  account: string;
  handle: string;
  name: string;
}
/** The agent name the hub takes things under for a person (`personAgent()` on the server). */
export const personAgent = (account: string) =>
  `person-${account.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;

/** I'll do this: in progress, held by you. */
export function taken(g: Work, me: Viewer, at: string): Work {
  return {
    ...g,
    stage: "working",
    held_by: [{ name: me.name || me.handle, agent: "", you: true, health: "person", since: at }],
  };
}

/** Given to someone: who it is for, as the server will name it. Its group on the board follows the refetch. */
export function givenTo(g: Work, to: string): Work {
  if (to.startsWith("#")) return { ...g, to: null, to_group: to.slice(1), lanes: [to] };
  if (to.startsWith("@")) return { ...g, to: to.slice(1), to_group: "" };
  return { ...g, to: null, to_group: "", lanes: [] };
}

/** Nothing new since you last looked, on anything that carries the mark. */
export const seen = <T extends { changed?: string }>(x: T): T =>
  x.changed ? { ...x, changed: "" } : x;

// The work page's context: the work, who holds it, and what it was finished with.

export function ctxMoved(
  ctx: WorkContext,
  status: "draft" | "ready" | "done",
  outcome = "",
): WorkContext {
  return { ...ctx, work: moved(ctx.work, status, outcome) };
}

/** Marked done by you, with what you said, which is what it was finished with. */
export function ctxFinished(ctx: WorkContext, me: Viewer, note: string, at: string): WorkContext {
  return {
    ...ctx,
    work: { ...moved(ctx.work, "done", "finished"), held_by: [] },
    claims: [],
    proofs: [
      {
        ok: true,
        by: { handle: me.handle, name: me.name },
        mine: true,
        note,
        detail: "",
        writeup: "",
        at,
      },
      ...ctx.proofs.filter((v) => !v.mine),
    ],
  };
}

export function ctxTaken(ctx: WorkContext, me: Viewer, at: string): WorkContext {
  return {
    ...ctx,
    work: taken(ctx.work, me, at),
    claims: [
      {
        state: "claimed",
        by: { handle: me.handle, name: me.name },
        mine: true,
        agent: personAgent(me.account),
        host: "",
        repo: "",
        note: "",
        evidence: "",
        claimed_at: at,
        lease_until: "",
        updated: at,
      },
    ],
  };
}

export const ctxFreed = (ctx: WorkContext): WorkContext => ({
  ...ctx,
  work: freed(ctx.work),
  claims: [],
});

/** Your own progress note, on your hold. */
export function ctxNoted(ctx: WorkContext, note: string, at: string): WorkContext {
  return {
    ...ctx,
    claims: ctx.claims.map((c) => (c.mine ? { ...c, note, updated: at } : c)),
  };
}
