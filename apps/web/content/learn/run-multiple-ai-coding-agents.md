---
title: Running several AI coding agents at once
date: 2026-10-03
description: How to run several AI coding agents without collisions: separate workspaces, one job per agent, work split so it doesn't overlap, proof on every hand-in.
draft: false
---

One coding agent at a time is easy to manage: you watch it, answer its questions, review what it
did. The moment you start a second one, in another terminal or another worktree, a new set of
problems appears. They edit the same file. They both pick up the same bug. One finishes while you
are reading the other's output, and its work sits unreviewed for a day.

None of this is a problem with the agents. It is coordination, the same problem a team of people
has, arriving faster. This page covers how to set up for it: where each agent works, how work is
divided and claimed, how you keep track, and how you keep up with review. It applies to Claude Code,
Codex or any mix of agents. For a single handoff in detail, see [Handing work to AI coding
agents](/learn/ai-agent-handoff).

## What goes wrong

Most failures with parallel agents fall into a few kinds:

- **Two agents do the same work.** Nothing said the bug was taken, so both fixed it, differently.
- **They edit the same files.** Two changes that each work alone conflict when merged.
- **One waits on the other without knowing.** The UI agent builds against an API the other agent
  has not finished, and guesses at its shape.
- **You lose track.** Five agents, five terminals and no single place that says which is done,
  which is stuck and which is waiting on you.
- **Review piles up.** Agents produce changes faster than you can read them, and unreviewed work
  is not finished work.

Each section below deals with one or more of these.

## Give each agent its own workspace

Two agents in the same checkout will trip over each other's uncommitted changes, branches and
build output. Give each its own working directory. Git worktrees are the simplest way: one
repository, several checkouts, each on its own branch.

```sh
git worktree add ../app-login -b fix/login-redirect
git worktree add ../app-invites -b feat/invite-errors
```

Start one agent in each. When the work is merged:

```sh
git worktree remove ../app-login
```

Watch for shared state outside git. Two dev servers want the same port, two test runs write to the
same local database, two agents run the same migration. Give each worktree its own port and, where
it matters, its own database, or have the agents run only the tests for their area.

## One job per agent, claimed

Every agent should be working on exactly one thing, and everyone, including the other agents,
should be able to see what that thing is.

That means work is **claimed** before it starts. A claim says "this is mine for now". A second
agent that asks for the same work is told it is taken and moves on to something else. When an
agent is stuck, or the work turns out not to be its to do, it releases the claim with the reason,
so the next one starts from there.

A shared list with names next to items can work for two agents and one person. Past that, it
breaks for the same reason a shared spreadsheet breaks for a team: nothing stops two people
writing their name on the same row.

## Split work so it does not overlap

How you divide the work decides how much merging you do later.

- **Split by area, not by step.** "The settings page" and "the invites API" can run side by side.
  "Write the model" and "write the tests for the model" cannot.
- **Say which pieces depend on which.** If the UI needs the API, the UI work waits until the API work is done,
  rather than starting now and guessing.
- **Keep shared files out of parallel tasks.** If two tasks would both change the router, the
  schema or a shared config, run them one after the other.
- **Size each task to one sitting.** A small task conflicts with less and is easier to review.
  [How to write a task an AI coding agent can finish](/learn/write-tasks-for-ai-coding-agents)
  covers sizing in more detail.

## Know what every agent is doing

You should be able to answer, at any moment and without switching terminals: what is each agent
working on, which ones are done, which are stuck, and which are waiting for you.

Two habits make that possible:

- **Progress notes.** One line from the agent at each milestone: "reproduced it", "fix in, running
  tests". It is the difference between an agent that is nearly done and one that stalled twenty
  minutes ago.
- **Treat silence as a signal.** An agent that has said nothing for half an hour has probably hit
  a wall. Look before it burns another hour.

When an agent needs a decision only you can make, it should ask and wait, keeping its claim, rather
than guessing or giving the work up. The question should reach you wherever you are, and your
answer should reach the agent without you hunting for its terminal.

## Keep up with review

Parallel agents move the bottleneck from writing code to reviewing it. If review does not keep up,
the extra agents are only producing a backlog.

- **Write acceptance before the work starts**, so review is checking lines off rather than
  re-reading the whole change.
- **Ask for evidence with every hand-in**: the test output, the command that shows the fix, a
  screenshot. You check evidence; you do not take the agent's word.
- **Reopen only what is not met**, with the reason. The next attempt starts from your reason.
- **Review in one place.** A single queue of finished work is something you can clear. Five
  terminals with "done!" at the bottom are not.

## Pass work between agents

Some work is naturally a relay. One agent investigates and writes up what it found; another builds
from that. A chat assistant like ChatGPT or Claude helps you plan; a coding agent in the repo does
the work. One agent finishes the API; the next builds the UI against it.

Each pass is a handoff, and it needs what any handoff needs: what done looks like, what was decided
and why, and what was tried and failed. Written down, the next agent starts where the last one
stopped. Not written down, it starts from zero.

## A setup that works

- [ ] Each agent has its own worktree, branch, port and, where it matters, database.
- [ ] Work is split by area, with dependencies stated.
- [ ] Each piece of work says what done looks like, in lines that can be checked.
- [ ] Work is claimed before it starts, and anyone can see who has what.
- [ ] Agents post a line at each milestone, and silence gets a look.
- [ ] Questions reach you, and answers reach the agent.
- [ ] Finished work arrives in one place, with evidence.
- [ ] What each agent learns is written down where the next one will read it.

## Running several agents with Passalong

[Passalong](/) is built for this. Each thing someone must still do is a piece of work: a title, a
plain summary and whatever the next reader needs ([the format](/docs/work-format)). Each is claimed
before it is worked.

- **One agent per job.** An agent takes work before starting. Nobody else can take it while it is
  held, and everyone can see who has what on the team's board.
- **Dependencies.** Work can say what it is waiting on, and it is not handed out until that is
  Done.
- **Progress and stalls.** Agents post a note at each milestone. Half an hour of silence marks the
  work as stalled, and a hold that stays quiet goes back in the queue.
- **Questions.** An agent can ask you a question and wait, keeping its claim. You answer in the hub,
  and your reply reaches it when it takes the work again.
- **One place for finished work.** Every hand-in carries evidence, and finishing is final. If
  something is not right, anyone on the team can **Reopen** it with the reason, which whoever takes
  it next reads first.
- **What they learn stays.** Each product is a project, and its documents hold what to know.
  Agents read them and write back what they learned, so a relay between agents does not lose what
  the last one found.
- **A queue runner.** `passalong work` runs an agent on each piece of ready work for the repo, one
  after another.

With Passalong connected to your tools, an agent can run the whole loop itself: write down the bugs
it finds, take work that is waiting, report progress, hand it in with evidence, and write what it
learned into the project's documents. Nothing gets copied between tools by hand.

It works from Claude Code and Codex, and from ChatGPT and Claude as a connector.

```sh
npm i -g passalong
passalong setup
passalong login
```

[Connect your tools](/connect), or read the [docs](/docs).
