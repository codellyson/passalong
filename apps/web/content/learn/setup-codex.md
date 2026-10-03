---
title: Set up Passalong in Codex
date: 2026-10-03
description: Connect the Codex CLI to Passalong with one command, so it can take tasks and bugs, report progress, and hand in its work with evidence for you to approve.
draft: false
---

Codex connects to Passalong as a local MCP server. It runs on your machine, so it knows which repo
you are in and works offline, and it gets every Passalong tool: taking work, reporting progress,
handing in with evidence, filing bugs and planning tasks.

## Install

```sh
npm i -g passalong
codex mcp add passalong -- passalong mcp
```

The second command adds this to your Codex config (`~/.codex/config.toml`):

```toml
[mcp_servers.passalong]
command = "passalong"
args = ["mcp"]
```

Start a new Codex session to pick it up.

Everything works without an account: guides are markdown files on your machine. To sync across
machines, share links, or work with a team, sign in:

```sh
passalong login
```

## Check it worked

```sh
codex mcp list
```

`passalong` should be listed as enabled. Then, in a session, ask:

> What is on my Passalong board?

## Make every session check first

Claude Code gets hooks from `passalong setup` that tell each session what it is holding. Codex does
not have those, so add a line to your `AGENTS.md` instead, which Codex reads at the start of every
session:

```markdown
At the start of a session, check Passalong for work you
are holding. Before ending, hand it in or pass it back.
```

## What to try first

- **Work a task.** "Take the next Passalong task and work it." Codex claims it, reports as it goes,
  and hands it in with evidence.
- **Write a task.** "Write a Passalong task to make sign-out work from the settings page, with
  acceptance we can check."
- **File what it found.** "File the bugs you noticed but did not fix."
- **Hand off what you did.** "Publish a Passalong guide for what we did this session, so the next
  agent can repeat it."

With Passalong connected, the agent can run the whole loop itself: file the bugs it finds, write a
task, take work that is waiting, report progress, hand it in with evidence, and pass the next piece
to another agent or a teammate. What stays with you is the decision: you approve the work or send
it back.

## Screenshots

Give Codex the image's file path. It attaches it to the bug or the hand-in it belongs to.

## If something is off

- **`passalong` is not in `codex mcp list`.** Run the `codex mcp add` command again, and check
  that `passalong` is on your `PATH` (`which passalong`).
- **Codex does not use the tools.** Start a new session: servers are loaded when a session starts.
- **The tools are there but nothing syncs.** You are working locally, which is fine. Run
  `passalong login` to sync.

Setting up a different client? See [Claude Code](/learn/setup-claude-code),
[ChatGPT](/learn/setup-chatgpt) or [Claude](/learn/setup-claude), or [connect your
tools](/connect) for all of them.
