---
title: Set up Passalong in Claude Code
date: 2026-10-03
description: Connect Claude Code to Passalong in three commands: take work, report progress, hand in with evidence and write what it learned into project documents.
draft: false
---

Claude Code gets the most complete Passalong setup of any client: the MCP server, a skill that
writes what a session learned into your project's documents, two hooks that keep a session from
forgetting the work it holds, and a status line. The server runs on your machine, so it knows which
repo you are in.

## Install

```sh
npm i -g passalong
passalong setup
passalong login
```

`passalong setup` does four things:

- **Registers the MCP server** with Claude Code, the same as running
  `claude mcp add passalong -- passalong mcp`.
- **Installs the capture skill**, so "pass this along" at the end of a session hands in what the
  session finished and writes what it learned into the project's documents: the page that covers
  it, and a line on the project's Log.
- **Adds two hooks.** When a session starts, it is told what this worktree is holding. When it
  tries to end while still holding work nobody has handed in, it is stopped once and told what to
  call.
- **Adds a status line** showing what you hold and what needs you, if you do not already have one.
  An existing status line is never replaced.

`passalong login` opens a page in your browser to approve; no password is typed in the terminal.
Work and documents live on the server, so the tools need you signed in before they can read or
write anything.

## Check it worked

```sh
claude mcp list
```

`passalong` should be in the list. Then start a session and ask:

> What is on my Passalong board?

## What to try first

- **Capture what a session learned.** At the end of a session: "pass this along". The skill hands
  in what you finished and updates the project's documents.
- **Write work down.** "Write this down as Passalong work: make sign-out work from the settings
  page, and say what done looks like."
- **Do the work.** "Take the next Passalong work and do it." The agent claims it, reports as it
  goes, and hands it in with evidence.
- **Write down what it found.** "Write down the bugs you noticed but did not fix, one each."

With Passalong connected, the agent can run the whole loop itself: write down the bugs it finds,
take work that is waiting, report progress, hand it in with evidence, and write what it learned into
the project's documents. Finishing is final; if something is not right, anyone on the team can
reopen it with the reason.

## Working a queue unattended

`passalong work` runs Claude Code headless on each piece of ready work for the repo, one after
another. A headless agent can only use the tools you allow up front, so point it at a script that
allows them:

```sh
#!/bin/sh
exec claude -p "$@" --permission-mode acceptEdits \
  --allowedTools "mcp__passalong__*,Bash(npm test:*)"
```

```sh
passalong work --agent ./agent.sh
```

Work that needs a command you did not allow ends up blocked, and the agent says so on the board.
On an always-on machine, `passalong work --watch` keeps going, and takes only work a person has
marked safe to run alone.

## Screenshots

Give the agent the image's file path. It adds the picture with `add_file` to the work or the
hand-in it belongs to.

## If something is off

- **`passalong` is not in `claude mcp list`.** Register it by hand:
  `claude mcp add passalong -- passalong mcp`.
- **The tools say you are not signed in.** Run `passalong login`, then start a new session.
- **A session keeps saying it holds work.** That is the Stop hook. Hand the work in, pass it back,
  or post progress if you are stopping mid-way.

Setting up a different client? See [Codex](/learn/setup-codex), [ChatGPT](/learn/setup-chatgpt)
or [Claude](/learn/setup-claude), or [connect your tools](/connect) for all of them.
