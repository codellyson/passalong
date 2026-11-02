---
title: A bug report template for AI coding agents
date: 2026-10-03
description: A bug report an AI coding agent can fix from: the template, how to show the bug, what evidence to attach and what a fix must not break.
draft: false
---

A bug report written for a person leans on things the person already has: the screen you are both
looking at, the context of the standup where it came up, the judgement not to "fix" a failing test
by deleting it. An AI coding agent has none of that. It has the report and the repo.

A good bug report for an agent is not longer than one for a person. It is more exact, in a few
specific places. This post gives the template, then goes through the parts that matter most. It
works the same for Claude Code, Codex or any other agent. For work that is not a bug, see [How to write a task an AI coding agent can
finish](/learn/write-tasks-for-ai-coding-agents).

## The template

```markdown
---
title: Signing out on the settings page shows an error
summary: Nobody can sign out from the settings page. They get the error page.
tags: [bug]
---

## What happens
Clicking "Sign out" on /settings shows the error page.
It works from every other page.

## What should happen
Signed out, and on the sign-in page, as from /home.

## How to see it
1. `npm run dev`, sign in as `ada@example.test`.
2. Open http://localhost:3000/settings.
3. Click "Sign out".

## Evidence
Server log at the moment of the click:
    TypeError: Cannot read properties of undefined
    (reading 'id') at src/settings/save.ts:41
Screenshot of the error page: attached.

## What a fix must not break
- /settings saves on blur, so the click also fires a
  save after the session is gone.
- A fix must not stop settings saving on blur.
```

A title, a plain summary a person can read in a list, and a body that says what happens, what
should happen, how to see it, the evidence, and what a fix must not break. The headings are a
suggestion, not a form: a two-line bug with a screenshot is a fine bug report. The `bug` tag is
optional too. It tells a person scanning a list what this is; it changes nothing about how the work
is handled.

Two parts, how to see it and what a fix must not break, are where most bug reports for agents go
wrong.

## Call it how to see it, not Steps

This sounds like a detail and is not. Agents are trained to follow a section called Steps: it is
what most instructions call the things to do. A bug report with a Steps section that walks through
producing the bug invites the agent to do exactly that, then to read what should happen, find it is
not true (because the bug is real), and conclude the report is wrong.

Head it **How to see it** or **Reproduce**, and keep it to what produces the bug. The fix is the
agent's to work out; it does not go in the report.

## Make the reproduction runnable

Write the reproduction so an agent can run it without asking anything:

- **Commands, not descriptions.** `npm run dev`, not "start the app".
- **Exact inputs.** The account, the record, the request body. If the bug needs particular data,
  say how to get it: a seed command, a fixture, a SQL insert.
- **The URL or the entry point.** Not "the settings page" but `/settings`.
- **One path.** If it happens three ways, give the shortest one and mention the others under What happens.

If you cannot reproduce it reliably, say so, and say how often it happens and under what
conditions. An agent that knows the bug is intermittent looks for races and timing. One that does
not will run the reproduction once, see nothing and report that it cannot find a bug.

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

**What should happen** is the behaviour that should have happened, stated plainly enough to check. "Signed
out, and on the sign-in page" can be checked. "Works properly" cannot.

If you can, ask for the fix to come with a test that fails before it and passes after. It is the
strongest evidence there is that the bug was understood rather than worked around, and it keeps the
bug from coming back.

## Write down what a fix must not break

**What a fix must not break** is the section people skip and agents need most. It has two parts:

- **What made it hard to see.** The thing you found while investigating: it only happens after a
  save on blur, it only fails on the second request, the log line is misleading. This saves the
  agent rediscovering it.
- **What a fix must not break.** The obvious fix for the example above is to stop saving on blur.
  That would fix the 500 and break a feature people rely on. Say so up front.

This is also where to rule out the fixes you would reject: "do not catch and ignore the error", "do
not change the test to expect a 500".

## Say how bad it is, in words

Whoever picks it up needs to know how much to drop for it. A plain sentence in the summary does that
better than a code: "nobody can sign out from the settings page" says who is stuck and how badly.
An agent, a teammate and you in three months all read that the same way. Nobody reads `s2` the same
way twice.

## One bug per report

When an agent finds several bugs during a test run or a review, the temptation is one report with
a list. Do not. A report holding six bugs has one owner and one status, so "four of these are fixed"
has nowhere to go, and nobody can take the fifth one on its own.

File each bug as its own report, with its own way to see it and its own evidence. If they came
from the same session, point each at the same parent, but keep them separate.

## Have the agent file what it finds

Agents find bugs they were not asked to fix: a flaky test, a wrong error message, a broken page next
to the one they were working on. Ask them to write those up in this template rather than fixing
them in passing. You get a report you can hand to the right person, and the change you asked for
stays the size you asked for.

> You noticed bugs you are not fixing. Write each one down on its own: a title, a plain sentence
> saying what is wrong and who it stops, what happens, what should happen, how to see it (not
> Steps), the exact error or a screenshot, and what a fix must not break.

## Bug reports in Passalong

In [Passalong](/), a bug is a piece of work like any other ([the format](/docs/work-format)): a
title, a summary of a sentence or two, and the body above. There are no kinds and no required
sections. An agent reads it and works out what fixed means. You may tag it `bug`, and the hub shows
the tag as a label; nothing turns on it.

An agent that finds bugs it is not fixing writes them all down in one `create_work` call, one item
each, so each has its own link, its own holder and its own state, and any of them can go to whoever
fixes it. A screenshot goes on with `add_file`, which returns the line to put in the text, so the
picture travels with the bug it shows. Whoever takes a bug hands in the fix with evidence: the
error that is gone, the test that now passes, a screenshot of the page working. Finishing is final,
and if the fix does not hold, anyone on the team can **Reopen** it with the reason.

With Passalong connected to your tools, an agent can run the whole loop itself: write down the bugs
it finds, take work that is waiting, report progress, hand it in with evidence, and write what it
learned into the project's documents. Nothing gets copied between tools by hand.

It works from Claude Code and Codex, and from ChatGPT and Claude as a connector.

```sh
npm i -g passalong
passalong setup
passalong login
```

[Connect your tools](/connect), or read [Handing work to AI coding agents](/learn/ai-agent-handoff)
for how a bug fits with the rest of the work you hand an agent.
