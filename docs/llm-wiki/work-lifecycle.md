# Work lifecycle

Every kind of guide is worked with the same four calls, each with an `agent` id the caller reuses:

- **take** — "I am doing this". Locks it so nobody else does the same work twice. Without an id it
  hands out the next ready task for the caller's repo — always a new one. An agent may hold several
  at once (2026-10-15): the person watching the board is the limit, not the queue.
- **progress** — one line at each milestone. Renews the lease.
- **hand_in** — done here. Needs evidence (see [evidence-and-proof.md](evidence-and-proof.md)).
- **pass** — not mine, or stuck, with the reason. Hands it back.

In the hub, people can take any guide from its page (**I'll do this**), post a progress note and
hand it in with prose and evidence. This person-held claim uses a week-long lease and does not require an agent's
separate report guide.

Every answer ends with `next`: what to call now. Agents are told to follow it and stop when it says
stop. The ten tools these replaced (`start_guide`, `next_task`, `finish_task`…) were described so
alike that models misread them.

## Claims

A take writes a **claim** (`apps/api/src/claims.ts`). Its primary key is the lock: a task is taken
once; a handoff or bug is taken once **per repo**, since the same transfer can be repeated in each
teammate's checkout.
If an older task still has a repo-scoped claim, that claim remains its lock and its review record;
the author can approve that hand-in without creating another claim.
The agent is the worktree (`.passalong/agent.json`), so several sessions in one checkout are one
agent: the session-start hook lists everything the worktree holds and says to resume only your own,
and the Stop hook names them all once. A quiet hold is never let go behind a person's back; it shows
stalled on the board for them to resume or stop.

- **Lease.** 30 minutes from the last call. A lapsed lease is **stalled** — derived on read, still
  locked — and the cron tells the author once. Two hours later the cron puts it back in the queue
  for anyone to take (`requeueStalled`), unless its agent asked a question nobody has answered; the
  second time for one guide, the author is mailed that it is stuck. Before 2026-10-28 a stalled
  hold stayed locked until a person released it, which is how work was left behind (docs/LOOP.md).
- **Fence.** Each claim carries a generation (`claim_fence`, migration 0029). A write from a claim
  since released and re-taken is refused, so a stale session cannot overwrite the new one.
- **Blocked.** A progress note starting `BLOCKED:` means the agent is waiting on the author. The hub
  lists it under *Stuck on you*, and the first such note notifies the author.

## The gate

Work is not done because whoever did it says so.

- **A new guide is Ready unless it says `status: draft`**, whatever its kind: drafts were where
  addressed work sat forgotten. Draft is for what a person should read first — a plan of tasks,
  email and webhooks, anything an agent is unsure of — and a person makes it Ready; whoever it is
  addressed to is told at Ready, never while it is a draft. Updating a draft's markdown cannot make
  it Ready; a proposal awaiting a team decision stays Draft. Unclaimed Ready work can move back to Draft, while
  held work must first be taken back or reviewed. Ready asks which repo only for a task.

- **Finishing is final** (2026-10-15, [docs/REVIEW.md](../REVIEW.md)): there is no review stage.
  `hand_in` needs proof a person can look at — a screenshot, or a command and its line of output —
  and puts the guide in Done (`outcome = finished`) once nobody else holds it, with what was shown
  kept as "Finished with" on its page. The write-up is 500 characters at most. **Reopen** puts
  finished work back in To do with a reason, for anyone in the team; **Ask someone to check** is a
  follow-up task to a teammate, not a stage.
- **An archived guide comes back to Draft**, never straight to Ready (`unarchiveProblem()` in
  `guide.ts`; the status route answers 409). `consumed` covers approved as well as shelved, so
  unarchiving one as Ready handed finished work to whoever took it next. Only its author or an
  admin archives a guide, of any kind. Archiving lets go of everyone on it: its claims are cleared, including a hand-in nobody
  answered, and whoever held it is told it is done with (migration 0055 cleared the 61 left stuck).
- **Done says how it got there** (`outcome`, migration 0054): **Finished** with proof, **Approved**
  from before finishing was final, **Archived** when its author or an admin shelved it. Done cards say
  which. A Ready guide nobody took stays Ready; after three days its author and the team's owners are
  mailed once (`untaken`). It used to go back to Draft after 14 days, where it reached nobody.
- **Not for me** is `pass` on work you don't hold, any kind: whoever sent it is told, with the
  reason, and the hub offers it beside I'll do this.
- **A task's write-up is not work.** The transfer an agent publishes for its hand-in is stored as
  Done and named for its task (`report_of`, migration 0053) once the hand-in names it, and the
  board leaves it out.
- A **handoff or bug** handed in with `ok: false` — its Verification did not hold here — is not
  finished: the claim goes, the guide stays, and its author hears why.
- **Release** is the author's take-back for any kind, from whoever holds it.

## History is not kept

A claim is deleted on approve, release and pass, so the hub's Progress timeline cannot show a hold
that ended. Keeping it would need its own table. See [open-questions.md](open-questions.md).

## Sources
- `apps/api/src/claims.ts` (`take`, `renew`, `finish`, `handIn`, `release`, `steps()`)
- `apps/api/src/index.ts`: `/v1/take`, `/v1/guides/:id/progress`, `/hand_in`, `/pass`, `/release`
- [AGENTS.md](../../AGENTS.md): "src/mcp.js", "Handed in means the actor's turn is over", "src/claims.ts"
- [docs/V2.md](../V2.md) §5
