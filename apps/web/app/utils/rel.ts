/** A timestamp as something a person reads: "just now", "4h ago", "12d ago", then the date. */
export function rel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  if (d < 1 / 24) return "just now";
  if (d < 1) return `${Math.floor(d * 24)}h ago`;
  if (d < 30) return `${Math.floor(d)}d ago`;
  return iso.slice(0, 10);
}

/** "1 pull" / "2 pulls", without a plural rule library for one case. */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * A day, written out: "31 December 2026".
 *
 * Read in UTC on purpose. The dates this renders are days somebody typed — the end of a gifted plan
 * (apps/api/src/gifts.ts) — stored as the last instant of that day, so formatting them in the
 * reader's own zone moved "31 December" to "1 January" for anyone east of Greenwich. A day is the
 * same day wherever it is read.
 */
export function day(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { dateStyle: "long", timeZone: "UTC" });
}
