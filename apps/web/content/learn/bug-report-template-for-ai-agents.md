---
title: A bug report template for AI coding agents
date: 2026-10-03
description: A bug report an AI coding agent can fix from, not just read. The template, why the reproduction is not a list of steps, what evidence to attach, and what a fix must not break.
draft: false
---

A bug report written for a person leans on things the person already has: the screen you are both
looking at, the context of the standup where it came up, the judgement not to "fix" a failing test
by deleting it. An AI coding agent has none of that. It has the report and the repo.

A good bug report for an agent is not longer than one for a person. It is more exact, in a few
specific places. This post gives the template, then goes through the parts that matter most. It
works the same for Claude Code, Codex or any other agent. For tasks, the other kind of work you
hand an agent, see [How to write a task an AI coding agent can
finish](/learn/write-tasks-for-ai-coding-agents).

## The template

```markdown
# Signing out on the settings page returns a 500

## Problem
Clicking "Sign out" on /settings shows the error page.
It works from every other page.

## Reproduce
1. `npm run dev`, sign in as `ada@example.test`.
2. Open http://localhost:3000/settings.
3. Click "Sign out".

## Evidence
Server log at the moment of the click:
    TypeError: Cannot read properties of undefined
    (reading 'id') at src/settings/save.ts:41
Screenshot: the error page, attached.

## Expected
Signed out, and on the sign-in page, as from /home.

## Gotchas
- /settings saves on blur, so the click also fires a
  save after the session is gone.
- A fix must not stop settings saving on blur.

## Severity
Major: a user cannot sign out from that page.
```

Six sections. Two of them, Reproduce and Gotchas, are where most bug reports for agents go wrong.

## Call it Reproduce, not Steps

This sounds like a detail and is not. Agents are trained to follow a section called Steps: it is
what most instructions call the things to do. A bug report with a Steps section that walks through
producing the bug invites the agent to do exactly that, then to read "Expected", find it is not
true (because the bug is real), and conclude the report is wrong.

Call the section **Reproduce**, and keep it to what produces the bug. The fix is the agent's to work
out; it does not go in the report.

## Make the reproduction runnable

Write the reproduction so an agent can run it without asking anything:

- **Commands, not descriptions.** `npm run dev`, not "start the app".
- **Exact inputs.** The account, the record, the request body. If the bug needs particular data,
  say how to get it: a seed command, a fixture, a SQL insert.
- **The URL or the entry point.** Not "the settings page" but `/settings`.
- **One path.** If it happens three ways, give the shortest one and mention the others under Problem.

If you cannot reproduce it reliably, say so, and say how often it happens and under what
conditions. An agent that knows the bug is intermittent looks for races and timing. One that does
not will run the reproduction once, see nothing, and report that it cannot find a bug.

## Paste the evidence, do not describe it

"It throws an error" gives the agent nothing to search for. The error does:

- **The exact message and stack trace**, copied, not paraphrased.
- **The request and response** for anything over the network: method, URL, status, body.
- **Log lines** from around the moment it happened.
- **A screenshot** for anything visual, since the agent cannot see your screen. Attach the image
  itself; a description of a layout bug is a guess at what someone else will see.

The evidence is also what the agent will use to prove the fix: the error that is gone, the request
that now returns 200.

## Say what fixed looks like

**Expected** is the behaviour that should have happened, stated plainly enough to check. "Signed
out, and on the sign-in page" can be checked. "Works properly" cannot.

If you can, ask for the fix to come with a test that fails before it and passes after. It is the
strongest evidence there is that the bug was understood rather than worked around, and it keeps the
bug from coming back.

## Write down what a fix must not break

**Gotchas** is the section people skip and agents need most. It has two parts:

- **What made it hard to see.** The thing you found while investigating: it only happens after a
  save on blur, it only fails on the second request, the log line is misleading. This saves the
  agent rediscovering it.
- **What a fix must not break.** The obvious fix for the example above is to stop saving on blur.
  That would fix the 500 and break a feature people rely on. Say so up front.

This is also where to rule out the fixes you would reject: "do not catch and ignore the error", "do
not change the test to expect a 500".

## Give it a severity

Severity tells whoever picks it up how much to drop for it. Four levels cover most teams:

- **Blocker**: nobody can get past it.
- **Major**: a real task cannot be finished.
- **Minor**: wrong, with a way around it.
- **Cosmetic**: it looks wrong.

Use the names, not codes like `s2`. An agent, a teammate and you in three months all read "Major"
the same way.

## One bug per report

When an agent finds several bugs during a test run or a review, the temptation is one report with
a list. Do not. A report holding six bugs has one owner and one status, so "four of these are fixed"
has nowhere to go, and nobody can take the fifth one on its own.

File each bug as its own report, with its own reproduction and evidence. If they came from the same
session, link them to each other or to a parent note, but keep them separate.

## Have the agent file what it finds

Agents find bugs they were not asked to fix: a flaky test, a wrong error message, a broken page next
to the one they were working on. Ask them to write those up in this template rather than fixing
them in passing. You get a report you can hand to the right person, and the change you asked for
stays the size you asked for.

> You noticed bugs you are not fixing. File each one as a bug report: Problem, Reproduce (not
> Steps), Evidence with the exact error, Expected, Gotchas, and Severity. One report per bug.

## Bug reports in Passalong

In [Passalong](/), a bug is one of the three kinds of guide, in nearly this shape
([the format](/docs/guide-format)): Expected is called Verification, the evidence sits under
Problem, and severity is a field rather than a section, with the same four names. A bug that puts
its reproduction under Steps is refused, for the reason above.

An agent that finds bugs it is not fixing files them in one call, and each becomes its own guide
with its own link, owner and status, so any of them can go to whoever fixes it. Screenshots attach
to the bug they show. Whoever takes a bug hands in the fix with evidence against the Expected
behaviour, and the person who reported it reviews it.

With Passalong connected to your tools, an agent can run the whole loop itself: file the bugs it
finds, write a task, take work that is waiting, report progress, hand it in with evidence, and pass
the next piece to another agent or a teammate. Nothing gets copied between tools by hand. What stays
with you is the decision: you approve the work or send it back.

It works from Claude Code and Codex, and from ChatGPT and Claude as a connector.

```sh
npm i -g passalong
passalong setup
```

[Connect your tools](/connect), or read [Handing work to AI coding agents](/learn/ai-agent-handoff)
for how a bug fits with tasks and handoffs.
