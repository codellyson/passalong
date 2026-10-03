---
title: The HANDOFF.md pattern, and when it stops working
date: 2026-10-03
description: How to keep an AI coding agent from starting cold every session with a HANDOFF.md file, a template to copy, and the four ways it breaks as the work grows.
draft: false
---

Every new session with a coding agent starts from zero. Claude Code, Codex and the rest read the
repo and whatever instructions file you keep, but nothing tells them what you were in the middle of
yesterday: which approach failed, what is half done, what you decided and why.

The HANDOFF.md pattern is the simplest fix. At the end of a session, the agent writes down the state
of the work in a file. At the start of the next one, it reads that file first. It costs a minute and
saves the first twenty minutes of every session after it.

This post covers what to put in the file, how to make it part of your routine, and the four places
it stops working. For handoffs in general, between people and tools as well as sessions, see
[Handing work to AI coding agents](/learn/ai-agent-handoff).

## What goes in it

A handoff file is not documentation. Your instructions file (`CLAUDE.md`, `AGENTS.md`) says how the
project works and how to work in it, and changes rarely. The handoff says where *this piece of work*
stands right now, and is rewritten every session.

Keep it short and specific. Five sections cover it:

```markdown
# Handoff

## Goal
What is true when this is done. One or two sentences.

## Done
What changed this session: file paths, commit hashes.

## In progress
What is half finished, and exactly where it stopped.

## Decisions and dead ends
What was chosen over what, and why.
What was tried and failed, and why.

## Next
The one next step, specific enough to start on.
```

The section people skip is the one that matters most: **dead ends**. A new session will happily try
the approach you abandoned two hours ago, because nothing tells it you already did. One line saving
it from that is worth the whole file.

The **Next** section should be one step, not a plan. "Write the migration for `total_cents`, then
run `npm test -- orders`" gets the next session moving. "Continue the backfill work" does not.

## Have the agent write it

You do not have to write the file yourself. The agent that did the work knows the details better
than you do at the end of a long session. Ask it before you close:

> Update HANDOFF.md for the next session: goal, what you did with file paths and commits, what is
> in progress and where it stopped, what we decided and what did not work, and the one next step.
> Replace the previous contents. Be specific; the next session will have no other context.

Read what it writes. The agent tends to describe what it meant to do rather than what it did, and
it will leave out the dead ends unless you ask. Correct it while you still remember.

If you use Claude Code, put this prompt in a custom slash command so it is one keystroke at the end
of a session. Any agent works with the plain prompt.

## Make the next session read it

The handoff only helps if the next session reads it before doing anything else. Instructions files
are loaded automatically; a handoff file is not.

Either mention it in your first message ("Read HANDOFF.md, then continue"), or add one line to your
instructions file so every session does it unprompted:

```markdown
If HANDOFF.md exists, read it before starting work.
Update it before the session ends.
```

Then ask the agent to say back what it thinks the next step is before it starts. If its answer is
wrong, the handoff was unclear, and now is the cheap time to find out.

## Commit it or ignore it?

For one person working alone, add `HANDOFF.md` to `.gitignore`. It is your working state, it
changes every session, and it would add noise to every commit and every review.

If you want a teammate to see it, committing it seems like the answer. That is usually the first
sign the pattern is reaching its limits.

## Where it stops working

HANDOFF.md works well for one person, one agent, one piece of work at a time. Each of these breaks
one of those assumptions.

### Two sessions at once

Run two agents in parallel, in two terminals or two worktrees, and both will write the same file
at the end. Whichever finishes last wins, and the other session's state is gone without a trace.

A workaround is one file per piece of work instead of one per repo: `handoffs/backfill-totals.md`,
`handoffs/login-redirect.md`. That stops the overwriting, but now you have to remember which file
belongs to which session. [Running several AI coding agents at
once](/learn/run-multiple-ai-coding-agents) covers parallel sessions properly.

### History disappears

The pattern replaces the file every session, which is what keeps it short. It also means that
last week's decisions are gone once this week's handoff replaces them. When someone asks why the
backfill uses batches of 1,000, the answer was in a file that no longer exists.

Appending instead of replacing keeps the history, but the file grows until the next session
spends its context reading a month of notes to find today's.

### Nothing says who has it

A handoff file says what the state is. It does not say whether anyone is working on it right now,
whether it is finished, or whether it was abandoned. Two agents, or an agent and a teammate, can
both pick up the same work because nothing marks it as taken.

You can add a line for that ("Status: in progress, Ada's laptop"), but nothing enforces it, and
nothing tells you when it goes stale.

### It lives in one repo

The handoff sits next to the code it describes. That is fine until the next step is in a different
repo, on a different machine, or for a different person's agent. Then it gets copied by hand, and
the copy is out of date the moment either side changes.

## When to move past it

If you run one agent at a time on your own work, keep using HANDOFF.md. It is the right size for
that, and no tool beats a file you control.

If you recognise two or more of the failures above, the problem has changed. You are no longer
handing work to your future self; you are handing it between agents, and sometimes people. That
needs each handoff to be its own document, with a kind, an owner and a status, that stays around
after the work is done.

That is what [Passalong](/) does. Each handoff is a guide: markdown with frontmatter, the same
sections as above, stored outside the repo so any agent can reach it. An agent takes a guide before
working on it, so nobody else picks up the same work. It reports progress as it goes, and hands it
in with evidence that you review. Guides stay in your history after they are done, and you can
export them as plain markdown at any time.

With Passalong connected to your tools, an agent can run the whole loop itself: file the bugs it
finds, write a task, take work that is waiting, report progress, hand it in with evidence, and pass
the next piece to another agent or a teammate. Nothing gets copied between tools by hand. What stays
with you is the decision: you approve the work or send it back.

It works locally with no account, from Claude Code and Codex, and from ChatGPT and Claude as a
connector.

```sh
npm i -g passalong
passalong setup
```

[Connect your tools](/connect), or read the [guide format](/docs/guide-format) to see how the
sections compare to a HANDOFF.md.
