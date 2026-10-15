# Review: a glance, not a reading assignment

**Status:** Proposed 2026-10-15. Nothing here is built yet, except the archive fix in §5, which is.

## 1. Why

Every hand-in is meant to be reviewed: a person approves it or sends it back, and nobody approves
their own work. That gate is how Passalong says work is finished rather than claimed finished. In
practice it is mostly skipped, and what agents hand in is shaped for the gate rather than for the
person behind it.

The numbers are from production, read on 2026-10-15, covering 2026-10-02 (when `task_event` began)
to then. Small and mostly one team's use, so read them as a direction, not a measurement.

**What happens after a hand-in (95 hand-ins)**

| Outcome | Hand-ins | Share |
| --- | --- | --- |
| Archived while the hand-in waited, never answered | 61 | 64% |
| Approved or closed by a reviewer | 27 | 28% |
| Still waiting | 7 | 7% |
| Sent back ("Ask for changes") | 0 | 0% |

- Nobody has ever sent work back. Review is approve-or-skip, never a gate anything fails.
- 11 of the 27 answered were answered by the account that handed them in: private guides, where a
  person's own agent hands in to them.
- Most answers came 1 to 24 hours later. People come back; they archive instead of reviewing.

**What a reviewer is given (97 hand-ins in review)**

- About 5,400 characters on average, the longest 13,400. 60% are over 2,000.
- About 42% carry a screenshot. Two checks on average: most of the length is prose and logs.

**Did a screenshot or a short hand-in get reviewed more?** (83 handoff and bug hand-ins, whose
evidence is kept after review)

| | Reviewed | Archived unreviewed |
| --- | --- | --- |
| Screenshot, short | 2 of 15 | 10 |
| Screenshot, long | 4 of 21 | 13 |
| No screenshot, short | 4 of 24 | 20 |
| No screenshot, long | 10 of 23 | 10 |

A screenshot did not make a hand-in more likely to be reviewed. Nothing did: the step is skipped
whatever arrives. So the problem is not only that hand-ins are long. It is that reviewing one costs
more than archiving it, and nothing says the difference matters.

## 2. What evidence is for, split in two

A hand-in carries two different things under one name, `evidence`:

1. **Proof for the machine.** Tests, type checks, a build. `checks.js` already runs a check's
   command and records its exit code, so the verdict is the process's, not the agent's. What a
   person needs from this is one fact — every check passed, or which one did not — not its output.
2. **Proof for a person.** The thing that answers "is this what I asked for?": a screenshot of the
   screen, a before and after, or for backend work the one command and the line of output that
   decides it. A test cannot say a button is in the wrong place or that the copy reads badly.

Today both arrive as one pile of text, and longer looks more thorough, so agents send more. The
reviewer is handed the machine's job and skips it.

## 3. Proposal

### 3.1 Checks become a line, logs fold away

The review shows checks as one line per Acceptance item, with a mark: `✓ 4 of 4 checks passed`, or
the one that failed, named. The output of each check is behind a disclosure, opened only when
something failed or looks wrong. Nothing about how checks are run or recorded changes; this is how
they are shown.

### 3.2 One thing a person can look at, by kind

Each hand-in brings one piece of proof meant for a person, and what counts depends on the work:

- **Anything with a screen:** a screenshot, or a short recording.
- **A bug:** before and after.
- **Backend, data, infrastructure:** the one command and the line of its output that shows it
  works, not the whole run.

The hand-in is refused without it, the way it is refused without evidence today, and the refusal
says which of the three this guide needs. This is the one new rule.

### 3.3 The review is one screen

What leads, in this order: one sentence on what changed (the hand-in's `note`), the proof from
§3.2, the checks line from §3.1, the risk line, a link to the diff. Then **Approve** and **Ask for
changes**. The write-up and the logs are below, folded.

Approve is held today until the evidence has been opened, which on a 5,000-character hand-in means
reading it. It becomes "until the proof has been seen": the screenshot opened, or the command line
shown. Seconds, not minutes.

### 3.4 The write-up is capped

The write-up says what had to be adapted and why, in a few lines. A cap (500 characters is a
starting point) keeps it that. Anything longer belongs in the diff, in a follow-up, or nowhere.

### 3.5 Archiving a hand-in asks first

64% of hand-ins were archived without an answer. Archiving a guide with a hand-in waiting should
not be the quiet way past the review. The board and the guide page ask "Approve it, or send it
back?" when someone archives work that is waiting on review; bulk archive says how many hand-ins it
would skip and offers to approve them instead.

### 3.6 Record that the proof was seen

Nothing records whether a reviewer looked before approving; the "opened" state lives in the browser.
One event, written when the proof is opened on the review screen, answers the question this
proposal cannot: whether approvals follow a look or replace one. It records that something was
opened, never what was in it.

## 4. Questions for a decision

1. **Is §3.2 a refusal or a nudge?** Refusing a hand-in without person-facing proof is the strong
   version and the one that changes behaviour. The soft version shows the reviewer that it is
   missing. Recommendation: refuse, for the reason the evidence rule refuses today.
2. **Does approving your own agent's work on a private guide count as a review?** It is 11 of 27
   answers. For one person working alone it is the right step; it should not be counted as a second
   pair of eyes anywhere the product says so.
3. **Should a hand-in nobody answers expire?** A Ready guide nobody takes goes back to Draft after
   14 days. A hand-in nobody reviews has no clock. One option: after 14 days, ask its author once,
   then leave it.

## 5. Done already: archiving clears its claims

Archiving through the status route left a guide's claims behind, so a hand-in waited forever on a
guide already in Done, in Needs you and the In review lists, with nobody able to answer it. 61 were
stuck like that. Archiving now clears every claim on the guide and tells whoever held it or handed
it in that it is done with; migration 0055 clears the ones already stuck.

## 6. Order of work

1. §3.6, the seen event, first and alone: a week of it says how much of §3.3 is needed.
2. §3.1 and §3.3: the review screen. Display only, no rule changes, nothing for agents to learn.
3. §3.5: asking before archiving a hand-in.
4. §3.2 and §3.4: the rules for agents. These change what the MCP servers and `llms.txt` tell
   agents, so they ship with a CLI release and a `MIN_CLIENT` raise, like every rule change.
