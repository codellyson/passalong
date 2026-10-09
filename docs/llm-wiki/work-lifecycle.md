# Work lifecycle

Every kind of guide is worked with the same four calls, each with an `agent` id the caller reuses:

- **take** — "I am doing this". Locks it so nobody else does the same work twice. Without an id it
  hands out the next ready task for the caller's repo.
- **progress** — one line at each milestone. Renews the lease.
- **hand_in** — done here. Needs evidence (see [evidence-and-proof.md](evidence-and-proof.md)).
- **pass** — not mine, or stuck, with the reason. Hands it back.

Every answer ends with `next`: what to call now. Agents are told to follow it and stop when it says
stop. The ten tools these replaced (`start_guide`, `next_task`, `finish_task`…) were described so
alike that models misread them.

## Claims

A take writes a **claim** (`apps/api/src/claims.ts`). Its primary key is the lock: a task is taken
once; a handoff or bug is taken once **per repo**, since the same transfer can be repeated in each
teammate's checkout.
If an older task still has a repo-scoped claim, that claim remains its lock and its review record;
the author can approve that hand-in without creating another claim.

- **Lease.** 30 minutes from the last call. A lapsed lease is **stalled** — derived on read, still
  locked — and the cron tells the author once.
- **Fence.** Each claim carries a generation (`claim_fence`, migration 0029). A write from a claim
  since released and re-taken is refused, so a stale session cannot overwrite the new one.
- **Blocked.** A progress note starting `BLOCKED:` means the agent is waiting on the author. The hub
  lists it under *Stuck on you*, and the first such note notifies the author.

## The gate

Work is not done because whoever did it says so.

- A new task enters **Draft**, including one published over hosted MCP. The author or team owner
  explicitly makes it Ready after review. Updating a draft's markdown cannot make it Ready; a
  task awaiting a team decision stays Draft. An unclaimed Ready task can be moved back to Draft
  from its hub page, while a held task must first be taken back or reviewed.

- A **task** handed in goes to *review*: the author approves it (it becomes `consumed`) or rejects it
  with a reason the next agent reads first — per Acceptance line, in the hub's review pane.
- A **handoff or bug** handed in waits for the author to close it or send that repo's hand-in back.
- **Handed in means the actor's turn is over.** A new guide whose `parent:` the publisher has handed
  in is refused (409): what the actor found goes on the hand-in, not in a second guide.
- **Release** is the author's take-back for any kind, from whoever holds it.

## History is not kept

A claim is deleted on approve, release and pass, so the hub's Progress timeline cannot show a hold
that ended. Keeping it would need its own table. See [open-questions.md](open-questions.md).

## Sources
- `apps/api/src/claims.ts` (`take`, `renew`, `finish`, `handIn`, `release`, `steps()`)
- `apps/api/src/index.ts`: `/v1/take`, `/v1/guides/:id/progress`, `/hand_in`, `/pass`, `/release`
- [AGENTS.md](../../AGENTS.md): "src/mcp.js", "Handed in means the actor's turn is over", "src/claims.ts"
- [docs/V2.md](../V2.md) §5
