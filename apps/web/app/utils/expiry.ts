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
 * nobody touched is archived, which is reversible: the first is the one worth a warning, so it wins
 * when a guide is on both. `soon` is the last two days, for a louder colour.
 */
export function expiryLine(
  g: { proof_expires?: string; archives_at?: string },
  at = Date.now(),
): { text: string; why: string; soon: boolean } | null {
  const pick = g.proof_expires
    ? {
        iso: g.proof_expires,
        text: (t: string) => `Screenshots deleted in ${t}`,
        why: "The screenshots that proved this work are deleted 5 days after it was closed, and can't be brought back. The guide itself stays. Turn off Clean-up in Settings to keep them.",
      }
    : g.archives_at
      ? {
          iso: g.archives_at,
          text: (t: string) => `Archived in ${t}`,
          why: "Nobody has opened this guide. If nothing happens to it for 14 days it is archived automatically: it moves to Done, and you can unarchive it from its ⋯ menu. Turn off Clean-up in Settings to stop that.",
        }
      : null;
  if (!pick) return null;
  return {
    text: pick.text(timeLeft(pick.iso, at)),
    why: pick.why,
    soon: new Date(pick.iso).getTime() - at < 2 * 86_400_000,
  };
}
