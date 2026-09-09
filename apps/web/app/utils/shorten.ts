/**
 * Shorten a value to something a person can still read.
 *
 * CSS truncation cuts at a pixel, which is how the hub's meta line came to say
 * `techchak-backend (https://g…` — the reader learns there is a URL and not which one. What
 * survives here is whole instead: a repo name, a host, a path segment, never half of one. The cut
 * lands on a boundary the value already has, and the ellipsis sits after a separator so it reads
 * as "there is more" rather than as a word chopped in two.
 *
 * If even the first unit is longer than the budget it comes back whole and is left to wrap. A line
 * that runs long looks worse than a clipped one and still says something, which is the trade the
 * clipped one loses.
 */
export interface Short {
  /** What to show: `full`, or a boundary-aligned prefix of it ending in an ellipsis. */
  text: string;
  /** The whole value, tidied — no scheme, no `www.`, no runs of whitespace. */
  full: string;
  /** Whether anything was left out, and so whether there is a "more" worth offering. */
  clipped: boolean;
}

/**
 * A URL's scheme and `www.` are the two parts nobody reads and both are pure width, so they go
 * before anything is measured. Often that alone is enough and nothing has to be dropped.
 */
const NOISE = /\bhttps?:\/\/(?:www\.)?/g;

/** A trailing slash, wherever the URL ends: before a bracket, before a space, or at the end. */
const TRAILING_SLASH = /\/(?=[)\]\s]|$)/g;

/** Punctuation left dangling once what followed it was dropped. */
const DANGLING = /[\s,;:·(\[{|/-]+$/;

export function shorten(value: string | null | undefined, max = 34): Short {
  const full = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(NOISE, "")
    .replace(TRAILING_SLASH, "");
  if (full.length <= max) return { text: full, full, clipped: false };

  // Words first, because dropping "(github.com/org/repo)" and keeping "techchak-backend" keeps the
  // name that identifies the thing. Path segments only once there are no words left to give.
  const text = clip(full, " ", max) ?? clip(full, "/", max) ?? full;
  return { text, full, clipped: text !== full };
}

/** Drop whole units from the end until what is left fits. Null when even the first one does not. */
function clip(value: string, join: string, max: number): string | null {
  const units = value.split(join);
  for (let n = units.length - 1; n > 0; n--) {
    const kept = units.slice(0, n).join(join).replace(DANGLING, "");
    if (kept && kept.length + 2 <= max) return `${kept}${join}…`;
  }
  return null;
}
