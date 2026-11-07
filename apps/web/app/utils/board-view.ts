/**
 * The board's toggles, remembered in this browser (2026-11-07). "Only mine" and "By person" lived
 * only in the address, so opening Work from the sidebar put them back every time. The address still
 * wins when it names a view, so a shared link opens as it was shared; a plain /hub/work opens as the
 * person last left it. Only a toggle they flip is remembered, never a view a link opened.
 *
 * Imports nothing, so it runs under `node --test` without Nuxt.
 */
export const BOARD_VIEW_KEY = "passalong.board";

/** What the toggles were, in the address's own words: `mine: "1"`, `by: "status"`, or absent. */
export type BoardView = { mine?: "1"; by?: "status" };

/** A stored view, read defensively: anything unexpected is no view at all. */
export function readView(raw: string | null | undefined): BoardView {
  try {
    const v = JSON.parse(String(raw ?? "")) as Record<string, unknown>;
    return {
      ...(v?.mine === "1" ? { mine: "1" as const } : {}),
      ...(v?.by === "status" ? { by: "status" as const } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * What to put in the address on arriving: the remembered view, when the address says nothing about
 * either toggle and there is something to restore. Null otherwise.
 */
export function restoreView(query: Record<string, unknown>, saved: BoardView): BoardView | null {
  if ("mine" in query || "by" in query) return null;
  return saved.mine || saved.by ? saved : null;
}

/** The view after one toggle is flipped, from what the address says now. */
export function nextView(
  query: Record<string, unknown>,
  patch: BoardView | Record<string, undefined>,
) {
  const v = { mine: query.mine, by: query.by, ...patch } as Record<string, unknown>;
  return readView(JSON.stringify(v));
}
