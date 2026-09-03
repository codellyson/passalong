# Relay

Hand finished work to another context.

Solve something non-trivial in one agent session. Run one command. Open a session in another
repo, on another machine, or with a teammate, and the agent there already knows the whole story:
the problem, the decisions and why, the steps, how to verify, and what went wrong along the way.

```sh
npm i -g justrelay
relay setup      # installs the Claude Code capture skill + registers the MCP server
relay login      # optional: sync guides across machines and get share links
```

## The loop

1. **Finish work** in Claude Code (or any agent). Say *"relay this"*, run `/relay-capture`, or
   run `relay share` yourself.
2. **Trim and publish.** The draft opens in your editor. Save it and you get a short id and a link.
3. **Pull on the other side.** `relay pull <id>` in the target repo, or paste the link to any
   agent with the Relay MCP server. The guide lands in its context; it implements, adapting the
   parts marked `ASSUMES:`.
4. **Close.** `relay done <id>` when it landed. `relay promote <id>` if it keeps getting pulled.

## Commands

```
relay share [file]        publish a guide (newest draft, or a scaffold you edit) → id + link
relay pull <id|link>      fetch a guide into ./.relay/ and print it
relay list [query]        your guides, local and synced
relay open <id> [--print] view a guide in the browser (or the terminal)
relay done <id>           mark consumed: implemented on the receiving side
relay promote <id>        mark promoted: graduated into a reusable reference
relay rm <id>             delete a guide locally and from sync
relay export [dir]        dump every guide as plain markdown
relay login [token]       create an account, or attach this machine to an existing one
relay setup               install the Claude Code capture skill + register the MCP server
relay mcp                 run the MCP server over stdio
```

## The guide

Plain markdown with frontmatter. Yours to edit, grep, and commit.

```markdown
---
id: k3mq2xa7
title: Verify Paystack webhook signatures
created: 2026-09-03T10:00:00.000Z
author: Lukman Isiaka
source_context: monieplan@main
status: published
stack_assumptions: [Next.js 15, Postgres]
tags: [paystack, webhooks]
---

## Problem
## Solution shape
## Decisions and rationale
## Steps
## Verification
## Gotchas
```

## MCP

`relay setup` registers the server with Claude Code. For other clients:

```sh
claude mcp add relay -- relay mcp     # or the equivalent stdio config
```

Tools: `search_guides`, `get_guide`, `publish_guide`, `guide_template`, `set_guide_status`.

## Principles

- **No lock-in.** Guides are files. `relay export` dumps everything.
- **Local-first.** Works with no account. Sync is the hosted layer.
- **Agent-native.** Everything the CLI does, an agent can do over MCP.

## Repo

- `packages/relay` — CLI + MCP server (`justrelay` on npm)
- `apps/api` — sync API and read-only web view (Cloudflare Worker + D1; static assets in `public/`)
- `docs/PRD.md` — the product spec

See `AGENTS.md` for how it fits together.
