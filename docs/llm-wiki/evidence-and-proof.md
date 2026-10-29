# Evidence and proof

A hand-in's note and writeup are somebody's word for their own work. Evidence is the part a person
can check, so the product asks for it at the moment someone says work is done.

## A hand-in needs evidence

`hand_in` without proof is refused (`proofProblem()`): a screenshot, or a command and its line of
output — the command and the lines that decided it, a test summary, a link to the change. Since
finishing is final there is no reviewer after it, which is why the proof is asked for here. LOOP.md
§0 step 2 replaces this gate with the agent's judgement: evidence becomes an input, never a refusal.

- **Checks.** Evidence can be given as `checks`, one per thing the work asked for, each run or shown.
- **Run, not ticked.** Locally, `src/checks.js` runs a check's command under `bash -o pipefail` and
  records the exit code, so the result is the process's and not the agent's. It never runs a command
  read out of a piece of work — work comes from somebody else's account, and that would make every
  take remote code execution. Over HTTP (a Worker, no shell) the prose gate holds.
- **Kept.** What was shown stays on the work as its standing verdict after the claim goes, and the
  work page leads with it as "Finished with". A person's own hand-in in the hub takes screenshots by
  pick, paste or drop.

## Screenshots and how long they live

Uploads go to R2 (`/v1/shots`); work claims the shots its markdown or its evidence names, and only
the account that uploaded a shot can claim it.

- **Proof is deleted 5 days after the work is closed** (`sweepProof`, hourly): anything it holds that
  its own markdown does not name. The text that pointed at it says it was removed rather than showing
  a broken image. Reopening or editing restarts the clock.
- **Orphans** — uploads nothing ever claimed — are swept after a day.
- **The document's own images stay** as long as the work does.

## Sources
- `apps/api/src/shots.ts` (`holdShots`, `evidenceOn`, `sweepProof`, `sweepOrphans`, `PROOF_DAYS`)
- `apps/api/src/index.ts`: `/v1/guides/:id/hand_in` (`proofProblem`), `/v1/shots`, `/v1/uploads`
- `packages/passalong/src/checks.js`, `apps/web/app/components/hub/Evidence.vue`
- [AGENTS.md](../../AGENTS.md): "src/checks.js", "Finishing is final", "Screenshots are claimed…"
