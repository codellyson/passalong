# Passalong

Keep a team's work and what it knows, for people and their agents. **Work** is what someone must
still do; **projects** hold the **documents** (what to know) and **files** that work needs. Work
comes in from the hub's box, email, a phone's share sheet or a customer, and is taken by whoever
does it, person or agent: one holder at a time, a progress note as it goes, and a hand-in with
proof a person can look at. Works with Claude Code, Codex, ChatGPT, Claude, or anything that speaks
MCP or HTTP. See [passalong.dev](https://passalong.dev).

```sh
npm i -g passalong
passalong login      # sign in from the browser; work lives on the server
passalong setup      # installs the Claude Code capture skill, the MCP server, four hooks and a status line
codex mcp add passalong -- passalong mcp   # Codex: the same MCP server
```

## The loop

1. **Write it down.** `passalong new "<what needs doing>"`, the hub's box, an email, or an agent's
   `create_work`. It needs a title and a one-line summary; the rest is free markdown. New work is
   Ready unless it says `status: draft`.
2. **Take it.** `passalong take <id>` (or `take` with no id for the next thing waiting for you).
   Nobody else can take it while you hold it, and its author sees you are on it.
3. **Say how it is going.** `passalong progress <id> <note>`; `passalong ask <id> <question>` when
   you need the person, who answers with `reply`.
4. **Finish it.** `passalong hand-in <id> <note> --evidence TEXT` puts it in Done with what you
   showed. `passalong pass <id> <why>` hands it back. Finished work that is not right comes back
   with `passalong reopen <id> <why>`.

What was learned goes into the project's documents, where everyone finds it.

## Commands

Every command, grouped by what it is for: [passalong.dev/docs/cli](https://passalong.dev/docs/cli).
`passalong work` runs an agent on each piece of ready work, and a machine can hold several
accounts; both are explained there too.

## The work

Plain markdown with frontmatter. Only `title` and `summary` are required; the body is whatever the
next reader needs.

```markdown
---
id: k3mq2xa7
title: Verify Paystack webhook signatures
summary: Payments can be faked until the webhook checks its signature. Whoever takes this fixes it.
status: ready
tags: [bug]
---

The webhook at `app/api/paystack/route.ts` trusts the body. Check `x-paystack-signature`…
```

## Teams

A team is the unit of sharing: everyone in it sees the same board (Draft, Ready, In progress,
Done) and may move work on it. Work can be for one person (`@handle`), a group (`#group`) or the
whole team. Invites are accepted in the browser, so a teammate needs no terminal to be part of a
team.

## MCP

`passalong setup` registers the server with Claude Code, and adds four hooks to `~/.claude/settings.json`: at session start the agent is told what its worktree holds (`passalong now --hook session`); after each tool call it is told what someone wrote on its work since, so a reply reaches it at its next step instead of its next progress call (`passalong now --hook tool`, which asks the server at most every 15 seconds); and a session that still holds work is stopped once and told to hand it in, pass it, or leave a progress note (`passalong now --hook stop`), unless it is only waiting on a command it put in the background; and when a session ends, whatever it still holds is passed back with the reason, so it returns to the queue at once (`passalong now --hook end`). All four say nothing when offline or signed out. It also adds a status line, `passalong now --statusline`, showing what this worktree holds and how much needs you; it prints from a local cache refreshed in the background, and a status line you already have is never replaced. For other clients:

```sh
claude mcp add passalong -- passalong mcp     # or the equivalent stdio config
```

Tools: `take`, `progress`, `hand_in`, `pass` and `ask` for working any piece of work, each answering with what to call next; `create_work`, `find_work` and `update_work` for writing and finding it; `find_projects`, `save_project`, `read_document`, `save_document` and `delete_document` for projects; `add_file`, `read_file` and `delete_file`; and `accounts`.

The same server is hosted at `https://passalong.dev/v1/mcp` for assistants that add remote MCP servers. A screenshot reaches it differently by assistant — ChatGPT passes the file, Claude sends it from its code sandbox to a one-time upload link (`add_file` mints it, with `passalong.dev` allowed in its network settings), and a local server reads a path. [passalong.dev/connect](https://passalong.dev/connect#screenshots) has the steps.

## Principles

- **No lock-in.** Work is markdown. `passalong export` dumps everything.
- **Server-first.** Work lives on the server; nothing is kept on the machine unless you ask
  (`take --save`, `export`).
- **Agent-native.** Everything the hub and CLI do, an agent can do over MCP.

## Repo

- `packages/passalong` — CLI + MCP server (`passalong` on npm)
- `apps/web` — the deployed Worker: every page, and the API mounted from `apps/api`
- `apps/api` — the sync API (Hono + D1), mounted by `apps/web`
- `docs/LOOP.md` — the direction; `docs/WORK.md` — work as one thing
- `docs/wiki/` — reference: data model, API surface, auth, the web view, releasing
- `docs/DEPLOY.md` — the runbook

See `AGENTS.md` for the conventions, and `docs/wiki/` for how the pieces actually work.
