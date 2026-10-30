/** How long until a moment, as a person says it: "3 days", "5 hours", "under an hour". */
export function timeLeft(iso: string, at = Date.now()): string {
  const ms = new Date(iso).getTime() - at;
  if (!Number.isFinite(ms) || ms < 3_600_000) return "under an hour";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${Math.floor(hours / 24)} days`;
}

/**
 * The line a guide shows when its proof screenshots are about to be deleted, or null. A sent guide
 * nobody took is no longer tidied away — it stays Ready and a person is told — so this is the one
 * clock left. `soon` is the last two days, for a louder colour.
 */
export function expiryLine(
  g: { proof_expires?: string },
  at = Date.now(),
): { text: string; why: string; soon: boolean } | null {
  if (!g.proof_expires) return null;
  return {
    text: `Screenshots deleted in ${timeLeft(g.proof_expires, at)}`,
    why: "The screenshots that proved this work are deleted 5 days after it was closed, and can't be brought back. The work itself stays.",
    soon: new Date(g.proof_expires).getTime() - at < 2 * 86_400_000,
  };
}
