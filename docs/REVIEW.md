# Finishing with proof, and no review stage

**Status:** Proposed and built 2026-10-15. §9's open questions were settled the simple way:
screenshots only (no recordings yet), a command and its line count as backend proof, and a reopen
tells whoever finished it, not the team channel. Supersedes the first draft of this file (review as a glance), which kept the stage and
tried to make it cheaper.

## 1. Why

Every hand-in waits in **In review** until a person approves it or sends it back, and nobody may
approve their own work. The idea was that work is finished when somebody else says so, not when an
agent claims it. In practice the stage is skipped, and what agents hand in is shaped for the gate
rather than for a person.

Production, 2026-10-02 (when `task_event` began) to 2026-10-15. Small and mostly one team's use:

| After a hand-in (95) | Hand-ins | Share |
| --- | --- | --- |
| Archived while it waited, never answered | 61 | 64% |
| Approved or closed by a reviewer | 27 | 28% |
| Still waiting | 7 | 7% |
| Sent back | 0 | 0% |

- Nothing has ever been sent back. The stage is approve-or-skip; it has never stopped anything.
- 11 of the 27 answers were people approving their own agent's work, which is the right thing to do
  and which the rule exists to forbid.
- A hand-in averages about 5,400 characters (the longest 13,400) and carries a screenshot in about
  42%. A screenshot did not make one more likely to be reviewed: nothing did.

Two things are wrong at once:

1. **The stage costs more than it catches.** It parks every finished piece of work, puts it in
   somebody's Needs you, and is worked around by archiving. It is only worth anything when you
   actually need another person — and then the honest way is to ask them, which Passalong already
   does: send them a guide.
2. **Proof is mixed in with noise.** "Evidence" holds both what the machine needs (a test passed)
   and what a person needs (is this what I asked for?). The second is what makes work checkable,
   and there is no easy way to show it to someone else.

## 2. The model

Four states instead of five, for every kind of guide:

**Draft → Ready → In progress → Done**

- **Finishing goes straight to Done**, and finishing requires proof (§3). There is no waiting
  state, no Approve, no Ask for changes, and no rule about whose work it is.
- **Reopen** is the safety valve (§4): anyone in the team can send Done work back to To do with a
  reason, which is what Ask for changes was meant to be, available after the fact instead of
  standing in the way of every piece of work.
- **Asking someone to check** is a request, not a stage (§5): a follow-up addressed to a person,
  carrying the proof, worked like any other guide.

## 3. Finishing requires proof

`hand_in` keeps its name and its place in the four verbs (take, progress, hand_in, pass), and now
means finished. It is refused without one piece of proof a person can look at, and what counts
depends on the work:

| The work | Proof |
| --- | --- |
| Anything with a screen | A screenshot, or a short recording |
| A bug | Before and after |
| Backend, data, infrastructure | The one command and the line of its output that shows it works |

The refusal names which of the three this guide needs, the way the evidence rule names what is
missing today. A person finishing in the hub has the same rule and the same upload.

Around the proof:

- **Checks become one line.** `checks.js` still runs each check's command and records its exit
  code. A person sees `✓ 4 of 4 checks passed`, or the one that failed by name. The output of each
  is folded away, there for when something looks wrong.
- **The write-up is capped** at about 500 characters: what had to be adapted and why. Anything
  longer belongs in the diff, a follow-up, or nowhere.
- **No separate write-up guide.** A task's hand-in no longer has to publish a transfer and name it
  as `report`; the capped write-up goes on the hand-in. That retires the guides migration 0053 hid
  from the board.

The proof stays on the guide. Anyone who opens a Done guide later sees what was shown when it was
finished, first, above the document.

## 4. Reopen

From a Done guide — its page, its card's menu, or dragging it out of Done — **Reopen** asks for a
reason and puts it back in To do. The reason goes at the top of the guide for whoever takes it next,
the same place a send-back's reason went, and whoever finished it is told.

- Anyone in the team can reopen, as anyone can move work on the board.
- Reopening an archived guide still goes to Draft, not To do (`unarchiveProblem`): archived is not
  finished, and a person decides again whether it is wanted.
- Reopens are the quality signal that replaces send-backs. How often finished work comes back, and
  from whom, is the number worth watching; it goes into `pnpm metrics`.

## 5. Asking someone to check

When you want another person's eyes — "open this in the browser and tell me it looks right" — you
ask them, from the guide's page: **Ask someone to check** picks a teammate and writes one line of
what to look at. That makes a follow-up guide:

- addressed to them, with the original as its `parent`, so it carries the proof and the guide with it;
- a task, Ready at once, because a person wrote it in the hub (the Ready action is theirs);
- answered the way any guide is: they take it, look, and finish it with proof of their own — or pass
  it with what is wrong, which comes back to you.

It is the one review that exists, and it exists only when somebody asked for it, from somebody they
chose. The same works from an agent: `publish_guide` a follow-up addressed to a person.

## 6. What goes away

| Gone | Where it went |
| --- | --- |
| The In review column | Finished work goes straight to Done |
| Approve, Ask for changes, closing a hand-in | Finishing is the end; Reopen undoes it |
| "Nobody approves their own work" (`ownWork`) | Nothing to approve |
| Approve held until the evidence is opened | Nothing to hold |
| The required write-up guide (`report`) | A capped write-up on the hand-in |
| Needs you's hand-ins list, "Your review" | Requests to check are guides addressed to you, in your inbox |
| `outcome = approved` | `finished` from now on; earlier rows keep `approved` |

Routes that installed clients still call keep answering: `POST /v1/tasks/:id/approve` and
`/v1/guides/:id/close` on work that is already Done succeed and change nothing, so an older CLI's
`approve` does not fail. `MIN_CLIENT` is raised with the release that teaches agents the new rule.

## 7. What happens to work in flight

- Hand-ins waiting in review on the day this ships become Done, `outcome = finished`, with their
  proof as it is. Nothing was going to review them: 64% never were.
- `blocked_by`: a blocker counted as finished when a person approved it. It now counts when it is
  Done. That lets one agent's finished work release the next task without a person in between,
  which is the point of a plan of tasks — and Reopen on the blocker does not re-block what already
  started. If a plan needs a person between two steps, the step in between is a request to check (§5).

## 8. Done already: archiving clears its claims

Archiving through the status route left a guide's claims behind, so a hand-in waited forever on a
guide already in Done, in Needs you and the In review lists, with nobody able to answer it. 61 were
stuck like that. Archiving now clears every claim on the guide and tells whoever held it or handed
it in that it is done with; migration 0055 clears the ones already stuck.

## 9. Questions still open

1. **Recordings.** Screenshots are stored today; a short recording is not. Is a recording in scope
   for the first version, or do screens start with screenshots only?
2. **What a backend proof looks like in the hub.** One command and one line of output is easy to
   fake. It is still better than 5,000 characters nobody reads, and the check's recorded exit code
   sits beside it — but it is the weakest of the three.
3. **Who sees that work was reopened.** Whoever finished it is told. Should the team's channel hear
   it too, the way a decline does?

## 10. Order of work

1. **Server: finishing is Done.** `hand_in` ends the claim and sets the guide Done with
   `outcome = finished`; Reopen (`POST /v1/guides/:id/reopen`, with a reason); `blocked_by` reads
   Done; the in-flight migration (§7). The proof refusal (§3) lands here too.
2. **Hub.** Four columns. The guide page leads with the proof; checks as one line; Reopen; Ask
   someone to check. Needs you loses its hand-ins list.
3. **Agents.** The MCP servers, `llms.txt` and the capture skill say finishing needs proof and is
   final; the write-up is capped and `report` is gone. A CLI release, then `MIN_CLIENT`.
4. **Metrics.** Reopen rate in `pnpm metrics`, beside the caveats it prints today.
