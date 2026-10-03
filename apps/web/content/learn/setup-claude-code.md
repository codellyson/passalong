---
title: Set up Passalong in Claude Code
date: 2026-10-03
description: Connect Claude Code to Passalong in two commands, so it can take tasks and bugs, report progress, hand in its work with evidence and hand off what it did. Includes the hooks and status line.
draft: false
---

Claude Code gets the most complete Passalong setup of any client: the MCP server, a skill that
writes up what a session did, two hooks that keep a session from forgetting the work it holds, and
a status line. It runs on your machine, so it knows which repo you are in and works offline.

## Install

```sh
npm i -g passalong
passalong setup
```

`passalong setup` does four things:

- **Registers the MCP server** with Claude Code, the same as running
  `claude mcp add passalong -- passalong mcp`.
- **Installs the capture skill**, so "pass this along" at the end of a session turns what the
  session did into a handoff guide.
- **Adds two hooks.** When a session starts, it is told what this worktree is holding. When it
  tries to end while still holding work nobody has handed in, it is stopped once and told what to
  call.
- **Adds a status line** showing what you hold and what needs you, if you do not already have one.
  An existing status line is never replaced.

Everything works without an account: guides are markdown files on your machine. To sync across
machines, share links, or work with a team, sign in:

```sh
passalong login
```

## Check it worked

```sh
claude mcp list
```

`passalong` should be in the list. Then start a session and ask:

> What is on my Passalong board?

## What to try first

- **Hand off what you just did.** At the end of a session: "pass this along". The skill writes a
  guide you can trim and publish.
- **Write a task.** "Write a Passalong task to make sign-out work from the settings page, with
  acceptance we can check."
- **Work a task.** "Take the next Passalong task and work it." The agent claims it, reports as it
  goes, and hands it in with evidence.
- **File what it found.** "File the bugs you noticed but did not fix."

With Passalong connected, the agent can run the whole loop itself: file the bugs it finds, write a
task, take work that is waiting, report progress, hand it in with evidence, and pass the next piece
to another agent or a teammate. What stays with you is the decision: you approve the work or send
it back.

## Working a queue unattended

`passalong work` runs Claude Code headless on each ready task in the repo, one after another. A
headless agent can only use the tools you allow up front, so point it at a script that allows them:

```sh
#!/bin/sh
exec claude -p "$@" --permission-mode acceptEdits \
  --allowedTools "mcp__passalong__*,Bash(npm test:*)"
```

```sh
passalong work --agent ./agent.sh
```

A task that needs a command you did not allow ends up blocked, and the agent says so on the board.

## Screenshots

Give the agent the image's file path. It attaches it to the bug or the hand-in it belongs to.

## If something is off

- **`passalong` is not in `claude mcp list`.** Register it by hand:
  `claude mcp add passalong -- passalong mcp`.
- **The tools are there but nothing syncs.** You are working locally, which is fine. Run
  `passalong login` to sync.
- **A session keeps saying it holds work.** That is the Stop hook. Hand the work in, pass it back,
  or post progress if you are stopping mid-way.

Setting up a different client? See [Codex](/learn/setup-codex), [ChatGPT](/learn/setup-chatgpt)
or [Claude](/learn/setup-claude), or [connect your tools](/connect) for all of them.
