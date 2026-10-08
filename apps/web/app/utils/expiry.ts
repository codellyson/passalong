/** How long until a moment, as a person says it: "3 days", "5 hours", "under an hour". */
export function timeLeft(iso: string, at = Date.now()): string {
  const ms = new Date(iso).getTime() - at;
  if (!Number.isFinite(ms) || ms < 3_600_000) return "under an hour";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${Math.floor(hours / 24)} days`;
}

/**
 * The line a guide shows when it is about to be tidied away by itself, or null.
 *
 * Two clocks exist. Proof screenshots on a closed guide are deleted for good, and a sent guide
 * nobody touched is shelved, which is reversible: the first is the one worth a warning, so it wins
 * when a guide is on both. `soon` is the last two days, for a louder colour.
 */
export function expiryLine(
  g: { proof_expires?: string; shelves_at?: string },
  at = Date.now(),
): { text: string; soon: boolean } | null {
  const pick = g.proof_expires
    ? { iso: g.proof_expires, text: (t: string) => `Screenshots deleted in ${t}` }
    : g.shelves_at
      ? { iso: g.shelves_at, text: (t: string) => `Shelved in ${t} if nobody opens it` }
      : null;
  if (!pick) return null;
  return {
    text: pick.text(timeLeft(pick.iso, at)),
    soon: new Date(pick.iso).getTime() - at < 2 * 86_400_000,
  };
}
