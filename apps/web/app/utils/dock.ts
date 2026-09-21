/**
 * Which follow-ups are docked beside a guide, as the `?with=` address that says so.
 *
 * A guide's share page runs no script, so the dock is not a panel that opens: every open, close
 * and "open all" is a link to the same page with a different `?with=`, and the server draws the
 * columns. That keeps back and forward working, and makes an arrangement something you can send.
 *
 * Pure and import-free, so it runs under `node --test` without Nuxt.
 */

/** Columns beyond this stop fitting beside a guide on a laptop. */
export const DOCK_MAX = 4;

/** Open one more. Already open is a no-op; past the limit, the one opened first makes room. */
export function withOpened(open: string[], id: string, max = DOCK_MAX): string[] {
  if (open.includes(id)) return open;
  const next = [...open, id];
  return next.length > max ? next.slice(next.length - max) : next;
}

export const withClosed = (open: string[], id: string): string[] => open.filter((x) => x !== id);

/**
 * The page's own address with this set docked. `view=verify` is kept, because docking context is
 * not a reason to lose the reading order someone chose. `jump` scrolls the new column into view
 * with a fragment — the one piece of "open beside" a page without script can still do.
 */
export function dockHref(
  base: string,
  open: string[],
  opts: { verify?: boolean; jump?: string } = {},
): string {
  const q = new URLSearchParams();
  if (opts.verify) q.set("view", "verify");
  if (open.length) q.set("with", open.join(","));
  const query = q.toString();
  return `${base}${query ? `?${query.replace(/%2C/g, ",")}` : ""}${opts.jump ? `#f-${opts.jump}` : ""}`;
}

/** `?with=` as it arrived: ids only, no repeats, in the order they were opened. */
export function parseWith(raw: unknown, valid: RegExp): string[] {
  const text = Array.isArray(raw) ? raw.join(",") : typeof raw === "string" ? raw : "";
  return [
    ...new Set(
      text
        .split(",")
        .map((s) => s.trim())
        .filter((s) => valid.test(s)),
    ),
  ];
}
