# Evidence and proof

The write-up and the verdict are both somebody's word for their own work. Evidence is the part the
person reviewing it can check, so the product asks for it at the two moments someone claims
something works.

## A hand-in needs evidence

`hand_in` without evidence is refused. Evidence is what was run and what came back — the command and
the lines that decided it, a test summary, a link to the change, a screenshot URL.

- **Checks.** Evidence can be sorted against the lines it answers (`checks`): Acceptance on a task,
  Verification on a handoff or bug. The review pane then shows each Acceptance line with the
  evidence filed under it, so a skipped line shows as a gap.
- **Run, not ticked.** Locally, `src/checks.js` runs a check's command and records the exit code, so a
  verdict is the process's and not the agent's. It never runs a command read out of a guide — a
  guide comes from somebody else's account, and that would make every pull remote code execution.
- **Close waits.** Approve and Close stay off until the evidence has been opened: the PR template's
  "I verified it", done as the thing it asks for.

## "It works" needs a screenshot

Since 2026-09-26, `PUT /v1/guides/:id/verdict` with `ok: true` is refused unless its note or detail
names at least one `/v1/shots/<id>` **uploaded by the same account**. People said guides worked that
did not; a note was only their word. Agent hand-ins keep their own rule — command output counts,
since a screenshot of a migration proves nothing a test run does not.

- CLI: `passalong works <id> <screenshot.png…> [what you checked]`. CLI 0.12.0 and older take no image;
  the refusal tells them to `passalong attach` and put the printed link in the note.
- Hub: *It worked* opens *Show it working* — pick, paste or drop screenshots.

## Screenshots and how long they live

Uploads go to R2 (`/v1/shots`); a guide claims the shots its markdown or its evidence names.

- **Proof is deleted 5 days after the guide is closed** (`sweepProof`, hourly): anything the guide
  holds that its own markdown does not name. The text that pointed at it says it was removed rather
  than showing a broken image. Reopening or editing the guide restarts the clock.
- **Orphans** — uploads no guide ever claimed — are swept after a day.
- **The document's own images stay** as long as the guide does.

## Sources
- `apps/api/src/shots.ts` (`holdShots`, `evidenceOn`, `sweepProof`, `sweepOrphans`, `PROOF_DAYS`)
- `apps/api/src/index.ts`: verdict route (`NEEDS_PROOF`), `/v1/shots`, `/v1/uploads`
- `packages/passalong/src/checks.js`, `apps/web/app/components/hub/Verdict.vue`
- [AGENTS.md](../../AGENTS.md): "src/checks.js", "A hand-in answers the PR template", "Screenshots are claimed…", "It works is shown, not said"
