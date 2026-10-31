---
title: Set up Passalong in Codex
date: 2026-10-03
description: Connect Codex to Passalong in one command: take work, report progress, hand in with evidence and write what it learned into project documents.
draft: false
---

Codex connects to Passalong as a local MCP server. It runs on your machine, so it knows which repo
you are in, and it gets every Passalong tool: taking work, reporting progress, handing in with
evidence, writing work down, and reading and updating your projects' documents.

## Install

```sh
npm i -g passalong
codex mcp add passalong -- passalong mcp
passalong login
```

The second command adds this to your Codex config (`~/.codex/config.toml`):

```toml
[mcp_servers.passalong]
command = "passalong"
args = ["mcp"]
```

`passalong login` opens a page in your browser to approve; no password is typed in the terminal.
Work and documents live on the server, so the tools need you signed in before they can read or
write anything. Start a new Codex session to pick it all up.

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
are holding. Before ending, hand it in or pass it back,
and write what you learned into the project's documents.
```

## What to try first

- **Do the work.** "Take the next Passalong work and do it." Codex claims it, reports as it goes,
  and hands it in with evidence.
- **Write work down.** "Write this down as Passalong work: make sign-out work from the settings
  page, and say what done looks like."
- **Write down what it found.** "Write down the bugs you noticed but did not fix, one each."
- **Keep what you learned.** "Update this project's Passalong documents with what we learned this
  session, and add a line to its Log."

With Passalong connected, the agent can run the whole loop itself: write down the bugs it finds,
take work that is waiting, report progress, hand it in with evidence, and write what it learned into
the project's documents. Finishing is final; if something is not right, anyone on the team can
reopen it with the reason.

## Screenshots

Give Codex the image's file path. It adds the picture with `add_file` to the work or the hand-in it
belongs to.

## If something is off

- **`passalong` is not in `codex mcp list`.** Run the `codex mcp add` command again, and check
  that `passalong` is on your `PATH` (`which passalong`).
- **Codex does not use the tools.** Start a new session: servers are loaded when a session starts.
- **The tools say you are not signed in.** Run `passalong login`, then start a new session.

Setting up a different client? See [Claude Code](/learn/setup-claude-code),
[ChatGPT](/learn/setup-chatgpt) or [Claude](/learn/setup-claude), or [connect your
tools](/connect) for all of them.
