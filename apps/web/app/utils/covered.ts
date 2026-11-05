/**
 * The teams whose Team plan covers what is sent to them, and the sentence that says so.
 *
 * A paying team covers the work in it and nothing else (apps/api/src/quota.ts): your own work
 * outside it counts against the free limit until you have Solo. So wherever the hub shows that
 * count to somebody on a paid team, it says the team's work isn't in it, or the number reads as a
 * wall in front of the team too. A team's `plan` from /v1/me is already as it stands now: a gift
 * that ran out reads `lapsed`, not `team`.
 */
export function payingTeams(me?: { teams?: { name: string; plan: string }[] } | null): string[] {
  return (me?.teams ?? []).filter((t) => t.plan === "team").map((t) => t.name);
}

/** "Anything you send to Khaime doesn't count, because the team's plan covers it." "" for none. */
export function coveredLine(names: string[]): string {
  if (!names.length) return "";
  const listed =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
  return names.length === 1
    ? `Anything you send to ${listed} doesn't count, because the team's plan covers it.`
    : `Anything you send to ${listed} doesn't count, because those teams' plans cover it.`;
}
