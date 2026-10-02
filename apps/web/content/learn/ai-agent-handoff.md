---
title: Handing work to AI coding agents
date: 2026-10-03
description: How to hand a task, a bug or finished work to an AI coding agent so it starts with what it needs, and how to check what comes back. Works with any agent.
draft: false
---

An agent handoff is the moment work moves from one context to another: from you to an agent, from
one agent session to the next, from a plan in ChatGPT or Claude to Claude Code or Codex in your
repo, or from your agent to a teammate's. The
receiving side starts with only what was written down. Everything else stayed in a context window
that has already closed.

Most handoffs today are a sentence in a chat box, and most of what goes wrong with coding agents
starts there. This guide covers what a good handoff contains, how to write the part that matters
most, and how to check the work that comes back. None of it depends on a particular tool.

## Why handoffs go wrong

**The context window closes.** The agent that spent an hour on a problem knows which approach
failed, which file is load-bearing and which test is flaky. A new session knows none of it. Unless
it was written down, the next agent rediscovers it, or worse, repeats the approach that failed.

**"Done" means whatever the agent decided it means.** Ask for "fix the login bug" and you get back
a change and a confident summary. Whether it is fixed depends on a definition nobody wrote, so the
agent wrote its own.

**Two agents do the same work.** Run more than one agent, or share a backlog with a teammate, and
sooner or later two of them pick up the same item. Nothing said it was taken.

**Nobody can see where things are.** An agent that hit a wall at minute five and one that is nearly
finished look the same from outside: quiet.

**The summary is the agent's word for its own work.** It is written by the same model that did the
work, at the end, from memory. It reads well whether or not the work holds up.

Each of these has a fix, and the fixes are mostly about what gets written down before and after
the work.

## Say what kind of handoff it is

Different handoffs ask for different things, and an agent behaves better when it knows which one it
has. Three kinds cover nearly everything.

**A task** is work nobody has done yet. The agent's job is to work out how. It needs:

- **Goal**: what is true when this is done, in a sentence or two.
- **Context**: where the code is and what already exists, so it does not go looking.
- **Constraints**: what must not change, and what to use or avoid.
- **Acceptance**: the checks the work will be judged against. More on these below.
- **Out of scope**: what looks related and is not part of this, so it does not wander.

A task has no steps. If you already know the steps, you are closer to the next kind.

**A transfer** is finished work to repeat somewhere else: the same fix in another repo, the same
setup on another service, or the context a later session needs so it does not start cold. It needs:

- **Problem**: what was actually wrong.
- **Solution shape**: the approach, not the diff.
- **Decisions and rationale**: what was chosen over what, and why.
- **Steps**: what to do.
- **Verification**: how to know it worked.
- **Gotchas**: what failed along the way. This is the most valuable section, and the one most often
  left out.

Mark anything that depends on the original environment, such as a path, a version or a service
name, so the receiving agent adapts it instead of copying it.

**A bug** is a defect to fix where it is. It needs the problem, how to see it, what should have
happened instead, and whatever made it hard to see. Call the "how to see it" section *Reproduce*,
not *Steps*. An agent follows Steps. It should not follow the recipe that produces the bug.

## Write acceptance an agent can check

If you only improve one part of how you hand work to agents, make it this. Acceptance is the
definition of done, written before the work starts. A good acceptance line is something a person or
a script can check, with an answer that cannot be argued with.

Lines that don't work:

- "Login works correctly."
- "Code is clean and well tested."
- "Performance is improved."

Lines that do:

- "`npm test -- auth` passes, including the new test for an expired session."
- "Signing in with an expired session redirects to `/login?expired=1` instead of showing a 500."
- "The backfill runs in batches of at most 1,000 rows, and `orders` is never locked for more than a
  second."
- "No change to the public API: `git diff main -- src/api/` is empty."

Each one names the observable thing and, where it can, the command that shows it. That gives the
agent a target it can check itself against before it says it is done. It also gives you something
to review that takes minutes instead of a re-read of the whole change.

Here is a full task in that shape:

```markdown
---
kind: task
title: Backfill order totals without locking the table
---

## Goal
Every row in `orders` has `total_cents` set, computed from its line items.

## Context
`total_cents` was added in migration 0142 and is null for orders before 2026-06-01
(about 2.4M rows). Line items are in `order_lines`. Production is Postgres 16.

## Constraints
- No long-running transaction on `orders`: it takes writes all day.
- Use the existing job runner in `src/jobs/`, not a one-off script.

## Acceptance
- `SELECT count(*) FROM orders WHERE total_cents IS NULL` returns 0 on staging.
- The job works in batches of at most 1,000 rows and can be stopped and resumed.
- A test covers an order with no line items (total is 0, not null).

## Out of scope
Changing how new orders compute their total.
```

## One agent per job, and say so

When more than one agent, or more than one person, can pick up the same work, the work needs to be
*claimed* before anyone starts. A claim says "this is mine for now", and everyone else can see it.

Whatever you use, the claim should be:

- **Visible.** Anyone looking at the work can see who has it.
- **Exclusive.** A second agent asking for the same work is told it is taken, rather than starting.
- **Releasable.** An agent that is stuck, or that finds the work is not its to do, gives it back
  with the reason, so the next one starts from that reason.

## Make progress visible

A one-line note at each milestone is enough: "reproduced it", "tests written, failing as expected",
"fix in, running the suite". Two things follow from it.

You can see the difference between stuck and nearly done. And silence starts to mean something: an
agent that has said nothing for half an hour has probably stalled, and is worth a look before it
burns another hour.

## Hand in evidence, not a summary

When the agent says it is done, ask for evidence against each acceptance line, not a narrative.
Evidence is anything you can check without trusting the agent's account:

- The command it ran and the lines of output that decided it.
- A test summary.
- A link to the commit or pull request.
- A screenshot, for anything visual.

"I ran the tests and they pass" is a claim. `47 passed, 0 failed` with the command above it is
evidence. A good rule: a hand-in without evidence is not a hand-in. Send it back.

## Review against the acceptance lines

With acceptance written first and evidence per line, review becomes a checklist. Go through the
lines and, for each one, ask whether the evidence shows it. Send back only the lines that are not
met, with the reason. The next attempt, by the same agent or another, starts from that reason
rather than from scratch.

This is also where you catch the work that did something you did not ask for. If the change
touches what was out of scope, that is a line to send back too.

## Handing work between sessions

The most common handoff is to yourself: the same agent, tomorrow, in a fresh session. The usual
answer is a `HANDOFF.md` file in the repo, written at the end of a session: what was done, what is
in progress, what is blocked, and the next step.

It works well for one person working one thread at a time. It starts to break when:

- **Sessions run in parallel.** Two agents write the same file, and one overwrites the other.
- **It is overwritten every session.** Yesterday's decisions are gone once today's note replaces
  them.
- **It has no state.** Nothing says whether the work is claimed, finished or abandoned.
- **It lives in one repo.** The handoff to an agent in a different repo, or on a different machine,
  has to be copied by hand.

If you hit those, the fix is to treat each handoff as its own document with a kind, an owner and a
status, rather than one file that is always "the current state".

## Handing work between tools

A handoff written as plain markdown moves between tools without translation. Every one of them
reads markdown well. What differs is where the tool runs, and so how the handoff reaches it.

**Coding agents in your repo**, such as Claude Code and Codex, can read a file
in the repo, run commands and connect to a local MCP server. They are where the work gets done, and
the only ones that can produce evidence like test output from your code.

**Chat assistants**, such as ChatGPT and Claude on the web or desktop, cannot see your repo. They
reach outside tools through connectors, which are remote MCP servers added by URL. Without one,
the handoff is whatever you paste in.

Keep the document free of tool-specific instructions where you can. "Run the test suite" survives a
change of tool. "Use the Bash tool to run…" does not.

## From a chat assistant to a coding agent

A lot of work starts in a chat: you think a feature through with ChatGPT or Claude, settle the
approach, and then need an agent in the repo to build it. The conversation that settled it is
exactly the context the coding agent will not have.

Before you leave the chat, ask it to write the task in the shape above: a Goal, the Context it
learned from you, the Constraints you agreed, and Acceptance lines that can be checked. Read it
before you hand it over, because the chat assistant was not in your codebase and will guess at
paths and names. Mark the guesses so the coding agent checks them rather than trusting them.

The return trip works the same way. A coding agent's hand-in, with its evidence, is something you
can take back to the chat to decide what comes next.

## Handing work to a teammate's agent

Handing work to a person who will run an agent on it adds one thing: the person needs to know it
arrived, and you need to know they took it. The same claim, progress and hand-in signals cover
this. You can see whether it was opened, who took it, where it has got to, and what came back.

## A checklist before you hand anything off

- [ ] It says what kind it is: a task, a bug, or finished work to repeat.
- [ ] A task has a Goal and acceptance lines a person or a script can check.
- [ ] Anything specific to the original environment is marked, so it gets adapted, not copied.
- [ ] What is out of scope is written down.
- [ ] A bug says how to see it under *Reproduce*, not *Steps*.
- [ ] A transfer includes what went wrong along the way.
- [ ] Someone will claim it before starting, and everyone can see who.
- [ ] The hand-in comes with evidence against each acceptance line.

## Doing this with Passalong

[Passalong](/) is built around this way of working. A handoff is a guide: markdown with
frontmatter, in the three kinds above ([the format](/docs/guide-format)). An agent works any guide
with four calls: it takes it, reports progress, hands it in with evidence, or passes it back with
the reason. Nobody else can take work an agent is holding. Half an hour of silence marks it as
stalled, and a hand-in without evidence is refused. You review the write-up line by line against
the acceptance you wrote.

It runs as a CLI and a local MCP server for Claude Code and Codex, and as a
connector for ChatGPT and Claude, so a task written in a chat can be taken by an agent in your
repo. Anything else that speaks MCP or HTTP works too, and it needs no account to use locally.

```sh
npm i -g passalong
passalong setup
```

[Connect your tools](/connect), or read [the docs](/docs).
