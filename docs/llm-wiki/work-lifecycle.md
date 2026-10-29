# Work lifecycle

All work is worked with the same calls and one code path (docs/WORK.md), each with an `agent` id the
caller reuses:

- **take** — "I am doing this". Locks it so nobody else does the same work twice. Without an id it
  hands out the next ready work for the caller's repo — always a new one. An agent may hold several
  at once (2026-10-15): the person watching the board is the limit, not the queue.
- **progress** — one line at each milestone. Renews the lease.
- **hand_in** — done. A note, a `writeup` of at most 500 characters, and evidence or checks (see
  [evidence-and-proof.md](evidence-and-proof.md)). There is no write-up guide: `claim.report_id`,
  `guide.report_of` and the hand-in's `report`/`markdown` went with migration 0061.
- **pass** — not mine, or stuck, with the reason. Hands it back.
- **ask** — the person's answer is needed: the agent keeps it, stops, and takes it again once they
  reply.

In the hub, people can take any work from its page (**I'll do this**), post a progress note and hand
it in with prose and evidence. This person-held claim uses a week-long lease.

Every answer ends with `next`: what to call now (`steps()` in claims.ts). Agents are told to follow
it and stop when it says stop. The ten tools these replaced (`start_guide`, `next_task`,
`finish_task`…) were described so alike that models misread them.

## Claims

A take writes a **claim** (`apps/api/src/claims.ts`). Its primary key, `guide_id`, is the lock:
**one holder at a time** for every piece of work. Handoffs used to be held once per repo
(`claim.place`, migration 0024); migration 0061 rebuilt `claim` and `claim_fence` on `guide_id`,
keeping the most recently updated claim where several existed.
The agent is the worktree (`.passalong/agent.json`), so several sessions in one checkout are one
agent: the session-start hook lists everything the worktree holds and says to resume only your own,
and the Stop hook names them all once.

- **Lease.** 30 minutes from the last call. A lapsed lease is **stalled** — derived on read, still
  locked — and the cron tells the author once. Two hours later the cron puts it back in the queue
  for anyone to take (`requeueStalled`), unless its agent asked a question nobody has answered; the
  second time for one piece of work, the author is mailed that it is stuck. Before 2026-10-28 a
  stalled hold stayed locked until a person released it, which is how work was left behind
  (docs/LOOP.md).
- **Fence.** Each claim carries a generation (`claim_fence`, migration 0029). A write from a claim
  since released and re-taken is refused, so a stale session cannot overwrite the new one.
- **Blocked.** A progress note starting `BLOCKED:` means the agent is waiting on the author. The
  first such note notifies the author. `blocked_by:` work is not handed out until each blocker is
  Done.

## States

Draft, Ready, In progress, Done — the same for all work.

- **New work is Ready unless it says `status: draft`**: drafts were where addressed work sat
  forgotten. Draft is for what a person should read first — a plan of several pieces, anything an
  agent is unsure of — and a person makes it Ready; whoever it is addressed to is told at Ready,
  never while it is a draft. Updating a draft's markdown cannot make it Ready. Unheld Ready work can
  move back to Draft; held work must first be taken back.
- **Finishing is final** (2026-10-15, [docs/REVIEW.md](../REVIEW.md)): there is no review stage.
  `hand_in` needs proof a person can look at and puts the work in Done (`outcome = finished`), with
  what was shown kept as a standing verdict, "Finished with" on its page. **Reopen** puts finished
  work back in To do with a reason, for anyone in the team; **Ask someone to check** is new work for
  a teammate with this as its `parent`, not a stage. LOOP.md step 2 replaces the proof gate with the
  agent's judgement.
- **Archived work comes back to Draft**, never straight to Ready (`unarchiveProblem()` in
  `guide.ts`). Only its author or an admin archives. Archiving lets go of everyone on it: its claims
  are cleared and whoever held it is told.
- **Done says how it got there** (`outcome`, migration 0054): **finished** with proof, **approved**
  from before finishing was final, **archived** when shelved. Ready work nobody took stays Ready;
  after three days its author and the team's owners are told every day until someone acts
  (`untaken`).
- **A finished child wakes its parent** (2026-10-28): when work made from other work reaches Done,
  the parent gets a note on its thread — handed to whoever holds it or takes it next — and its author
  and holders are told (`child_done`). It wakes the parent and never closes it.
- **Not for me** is `pass` on work you don't hold: whoever sent it is told, with the reason; an
  `ack` row keeps it off your list and the thread gets a `passed` line.
- **Release** takes work back from whoever holds it.

## The thread

`task_event` (migration 0037) is the history: an append-only line per take, progress note, hand-in,
pass, release, reopen, question, reply and note, written after the transition it describes. The
claim is only the present. Migration 0062 moved the old verdicts and acks in and renamed the retired
kinds (`sent_back` → `reopened`, `approved` and `closed` → `handed_in`), so `thread()` reads one
table. See [answers.md](answers.md).

## Sources
- `apps/api/src/claims.ts` (`take`, `renew`, `handIn`, `complete`, `reopen`, `release`, `pass`, `thread`, `steps()`)
- `apps/api/src/index.ts`: `/v1/take`, `/v1/guides/:id/progress`, `/hand_in`, `/pass`, `/ask`, `/release`, `/reopen`
- Migrations 0037 (task_event), 0061 (one thing), 0062 (one thread)
- [docs/WORK.md](../WORK.md), [AGENTS.md](../../AGENTS.md): "src/claims.ts", "Finishing is final"
