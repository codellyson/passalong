// Which runner serves which work: the hub's copy of `serves` in apps/api/src/claims.ts, so a card
// can say when nothing will take work marked safe to run alone.

export interface RunnerRow {
  host: string;
  repo: string;
  repos: string[];
  mine: boolean;
  who: string;
  running: { id: string; title: string; step: { text: string; at: string } | null }[];
  runs_today: number;
  per_day: number;
  at_once: number;
  live: boolean;
  stopped: string;
  seen: string;
}

/** Whether a runner in `repo` takes work that runs in `want`; either may be a bare name. */
export function serves(repo: string, want: string): boolean {
  const r = String(repo || "").toLowerCase();
  if (!r || !want) return false;
  return r === want || r.endsWith(`/${want}`) || want.endsWith(`/${r}`);
}

/** The live runner that would take work running in `want`, if any. */
export function runnerFor(runners: RunnerRow[], want: string): RunnerRow | null {
  return (
    runners.find(
      (r) => r.live && (r.repos?.length ? r.repos : [r.repo]).some((x) => serves(x, want)),
    ) ?? null
  );
}
