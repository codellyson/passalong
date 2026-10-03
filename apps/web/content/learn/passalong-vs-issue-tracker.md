---
title: Passalong or an issue tracker for AI coding agents?
date: 2026-10-03
description: Issue trackers like Linear, Jira and GitHub Issues are built for people planning work. What changes when the one doing the work is an AI coding agent, and where Passalong fits beside your tracker.
draft: false
---

Most teams already have somewhere work lives: Linear, Jira, GitHub Issues. When you start handing
that work to AI coding agents, the obvious move is to point the agent at a ticket. Trackers even
have MCP servers now, so an agent can read the ticket itself.

That works, up to a point. A tracker is built for people planning and following work. An agent
doing the work needs a few things a tracker was not designed to give it. This page sets out where
each fits, because for most teams the answer is both.

## Side by side

| | Issue tracker | Passalong |
|---|---|---|
| Built for | People planning and tracking work | Agents doing the work, and you reviewing it |
| A ticket says | What someone wants, in their words | Goal, context, constraints and acceptance to check |
| Who has it | An assignee, usually a person | A claim by one agent, released when it stops |
| Two agents on one ticket | Nothing stops it | The second is told it is taken |
| Progress | Status columns someone moves | A note per milestone; silence shows as stalled |
| Done means | Someone moved it to Done | Evidence against each acceptance line, approved by you |
| Bugs an agent finds | It tells you, if you ask | It files them, one per bug, with evidence |
| Roadmaps, sprints, estimates | Yes | No |

## What a tracker does well

Keep your tracker for what it is good at. Planning across a quarter, prioritising a backlog,
sprints and estimates, reporting to people who never open a terminal, and the conversation that
decides what to build. Passalong does none of that, and does not try to.

## Where agents need more

**A ticket is written for a person.** "Login is broken for some users" makes sense to a teammate
who was in the standup. An agent starting cold needs the Goal, where to look, what must not change
and how to check it is done. Without that, it guesses, and you review the guesses.
[How to write a task an AI coding agent can finish](/learn/write-tasks-for-ai-coding-agents) covers
the difference.

**Assignment is not a claim.** A tracker assigns work to a person. Run several agents and nothing
stops two of them taking the same ticket, or tells you one has been stuck for an hour. Passalong
claims the work for one agent, shows who has it, and marks it stalled after half an hour of silence.

**Done is a status, not evidence.** In a tracker, done means someone moved the card. When an agent
did the work, you want to see what it ran and what came back, against each thing you asked for,
before it counts.

**Agents find more work than they were given.** A good agent notices the flaky test and the broken
page next door. In Passalong it files each as its own bug with evidence, rather than fixing it in
passing or mentioning it in a summary you skim.

## Using both

The practical setup for a team with a tracker:

1. Plan in the tracker, as you do now.
2. When a ticket is going to an agent, turn it into a Passalong task. Your agent can do this: with
   your tracker's MCP server and Passalong both connected, ask it to "read the ticket and write it
   up as a Passalong task with acceptance we can check".
3. The agent takes the task, works it and hands it in with evidence.
4. You approve it, and close the ticket.

The tracker stays the record of what the team decided. Passalong is where the agent's part of the
work happens and gets checked.

## The whole loop

With Passalong connected to your tools, an agent can run the whole loop itself: file the bugs it
finds, write a task, take work that is waiting, report progress, hand it in with evidence, and pass
the next piece to another agent or a teammate. Nothing gets copied between tools by hand. What
stays with you is the decision: you approve the work or send it back.

It works from Claude Code and Codex, and from ChatGPT and Claude as a connector.

```sh
npm i -g passalong
passalong setup
```

[Connect your tools](/connect), or read about [running several agents at
once](/learn/run-multiple-ai-coding-agents).
