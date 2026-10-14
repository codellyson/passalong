/**
 * What an answer does to the cached lists, before the server has confirmed it.
 *
 * Pressing I'll do this used to wait for the round trip and then reload six endpoints, so the row sat
 * unchanged for a second or two and read as a button that did nothing. These write the answer into
 * the cache at once; the hub rolls them back if the server refuses, and refetches either way.
 *
 * Pure and type-only imports, so it runs under `node --test` without Nuxt.
 */
import type { Board, Guide } from "~/types/hub";

const BUCKETS = ["waiting", "failing", "in_flight", "landed"] as const;

export const withStatus = (g: Guide, status: string): Guide => ({ ...g, status });

/** Off the board entirely: passed on, answered, archived or deleted. */
export function dropFromBoard(board: Board, id: string): Board {
  const out = { ...board };
  for (const bucket of BUCKETS) out[bucket] = (board[bucket] ?? []).filter((g) => g.id !== id);
  return out;
}

export function patchList(guides: Guide[], id: string, fn: (g: Guide) => Guide): Guide[] {
  return guides.map((g) => (g.id === id ? fn(g) : g));
}
