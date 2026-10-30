---
title: Handing work to AI coding agents
date: 2026-10-03
description: How to hand work to an AI coding agent so it starts with what it needs, and how to check what comes back. A bug, a feature or a fix to repeat elsewhere. Works with any agent.
draft: false
---

An agent handoff is the moment work moves from one context to another: from you to an agent, from
one agent session to the next, from a plan in ChatGPT or Claude to Claude Code or Codex in your
repo, or from your agent to a teammate's. The
receiving side starts with only what was written down. Everything else stayed in a context window
that has already closed.

Most handoffs today are a sentence in a chat box, and most of what goes wrong with coding agents
starts there. This page covers what a good handoff contains, how to write the part that matters
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

## Write what the next reader needs

A handoff does not need a form. Templates with fixed sections tend to get filled in for their own
sake: a two-line note padded into six headings, or a bug squeezed into a shape made for a feature.
What the receiving agent needs is shorter than that:

- **A title** that says what it is, in a few words.
- **One or two plain sentences** saying what this is and whether anyone has to act. This is what a
  person scanning a list reads. Keep ids and paths out of it.
- **The body**, in whatever shape fits: what is wrong or wanted, where to look, what must not
  change, and how to tell it is done.

A capable agent reading "the upload button does nothing, screenshot attached" knows it is a bug and
what fixed looks like. You do not have to label it. What you do have to write down is whatever only
you know.

A few things are worth saying whenever they apply:

- **What must not change.** A public API, a schema, a file another team owns.
- **What is out of the way.** Nearby things that look related and are not part of this, so the
  agent does not wander.
- **What failed.** For a fix that was already made once and needs repeating somewhere else, the
  dead ends are the most valuable part, and the part most often left out.
- **What depends on where you were.** Mark a path, a version or a service name that came from the
  original environment, so the receiving agent adapts it instead of copying it.

For a bug, write how to see it as just that: how to see it. Do not head it *Steps*. An agent
follows Steps, and it should not follow the recipe that produces the bug.
[A bug report template for AI coding agents](/learn/bug-report-template-for-ai-agents) goes through
a bug in full.

## Write acceptance an agent can check

If you only improve one part of how you hand work to agents, make it this. Acceptance is the
definition of done, written before the work starts. A good acceptance line is something a person or
a script can check, with an answer that cannot be argued with.

Lines that do not work:

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

[How to write a task an AI coding agent can finish](/learn/write-tasks-for-ai-coding-agents) goes
further: acceptance for each sort of work, how much context to give, and how to size a task.

Here is a whole piece of work written that way: a title, a plain summary, and a body with no
required sections.

```markdown
---
title: Backfill order totals without locking the table
summary: Old orders have no total. Fill them in without slowing the shop.
---

`total_cents` was added in migration 0142 and is null for
orders before 2026-06-01 (about 2.4M rows). Compute it from
the line items in `order_lines`. Production is Postgres 16.

Do not hold a long transaction on `orders`: it takes writes
all day. Use the job runner in `src/jobs/`, not a one-off
script.

**Done when**
- On staging, this returns 0:
  `SELECT count(*) FROM orders WHERE total_cents IS NULL`
- The job works in batches of at most 1,000 rows,
  and can be stopped and resumed.
- A test covers an order with no line items
  (total is 0, not null).

Not part of this: how new orders compute their total.
```

## One agent per job, and say so

When more than one agent, or more than one person, can pick up the same work, the work needs to be
*claimed* before anyone starts. A claim says "this is mine for now", and everyone else can see it.

Whatever you use, the claim should be:

- **Visible.** Anyone looking at the work can see who has it.
- **Exclusive.** A second agent asking for the same work is told it is taken, rather than starting.
- **Releasable.** An agent that is stuck, or that finds the work is not its to do, gives it back
  with the reason, so the next one starts from that reason.

Running several agents at once raises more than claims: workspaces, splitting the work, and keeping
up with review. [Running several AI coding agents at once](/learn/run-multiple-ai-coding-agents)
covers the rest.

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
evidence. A good rule: a hand-in without evidence is not a hand-in.

## Check it against what you asked for

With "done when" written first and evidence for each line, checking the work is a checklist rather
than a re-read. Go through the lines and, for each one, ask whether the evidence shows it.

When something is not met, reopen the work with the reason. The next attempt, by the same agent or
another, starts from that reason rather than from scratch. This is also where you catch work that
did something you did not ask for: a change to what was out of the way is a reason to reopen too.

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

If you hit those, split the file in two. What someone must still do becomes its own piece of work,
with an owner and a state. What you learned about the project goes into documents that outlast any
one session: how it is built, what was decided and why, what to avoid.

[The HANDOFF.md pattern, and when it stops working](/learn/handoff-md) has a template, a prompt to
have the agent write it, and workarounds for each of these.

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

Before you leave the chat, ask it to write the work down: what is wanted, what it learned from
you, what you agreed must not change, and "done when" lines that can be checked. Read it
before you hand it over, because the chat assistant was not in your codebase and will guess at
paths and names. Mark the guesses so the coding agent checks them rather than trusting them.

The return trip works the same way. A coding agent's hand-in, with its evidence, is something you
can take back to the chat to decide what comes next.

## Handing work to a teammate's agent

Handing work to a person who will run an agent on it adds one thing: the person needs to know it
arrived, and you need to know they took it. The same claim, progress and hand-in signals cover
this. You can see whether it was opened, who took it, where it has got to, and what came back.

## A checklist before you hand anything off

- [ ] It has a title and a plain sentence or two a person can read.
- [ ] It says how to tell it is done, in lines a person or a script can check.
- [ ] Anything specific to the original environment is marked, so it gets adapted, not copied.
- [ ] What is out of the way is written down.
- [ ] A bug says how to see it, not *Steps*, with the error or screenshot attached.
- [ ] A fix to repeat elsewhere says what went wrong along the way.
- [ ] Someone will claim it before starting, and everyone can see who.
- [ ] The hand-in comes with evidence for each thing it asked for.

## Doing this with Passalong

[Passalong](/) is built around this way of working. A piece of work is markdown with a title, a
summary and whatever text, pictures and files the next reader needs ([the
format](/docs/work-format)). There are no kinds and no required sections. An agent works it with
four calls: `take` it, report `progress`, `hand_in` with evidence, or `pass` it back with the
reason. Nobody else can take work an agent is holding. Half an hour of silence marks it stalled, and
a hand-in without evidence is refused. Finishing is final: the work goes to Done with what was
shown, and anyone on the team can **Reopen** it with a reason.

Each piece of work lives in a project, one per product. A project's documents hold what to know:
what the product is, how it is built, what was decided. What an agent learns goes there, so the
next agent on that product starts knowing it, instead of a one-off handover written for one person.

With Passalong connected to your tools, an agent can run the whole loop itself: write down the bugs
it finds, take work that is waiting, report progress, hand it in with evidence, and write what it
learned into the project's documents. Nothing gets copied between tools by hand.

It runs as a CLI and a local MCP server for Claude Code and Codex, and as a connector for ChatGPT
and Claude, so work written in a chat can be taken by an agent in your repo. Anything else that
speaks MCP or HTTP works too.

```sh
npm i -g passalong
passalong setup
passalong login
```

[Connect your tools](/connect), or read [the docs](/docs).
