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
passalong setup      # installs the Claude Code capture skill, the MCP server, two hooks and a status line
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

```
  passalong new "<what needs doing>" [--to TARGET] [--parent ID] [--draft]  write work down
  passalong new <file.md> [--to TARGET] [--parent ID] [--draft]  the same, from a file
  passalong board               what needs you, who is on what, and what is ready
  passalong list [query]        work you and your teams can see, newest first
  passalong open <id> [--print] view work in the browser (or the terminal)
  passalong take [id] [--save]  you are doing it: nobody else can take it while you hold it
  passalong progress <id> <note>  still on it, with a one-line note the hub shows
  passalong hand-in <id> <note> --evidence TEXT [--writeup TEXT] [--pr LINK]  it is done
  passalong pass <id> <why>     it is not yours, or you are stuck — hands it back with your reason
  passalong ask <id> <question> ask the person, keep it, and wait for their answer
  passalong reply <id> <text>   write to whoever holds it (--file PATH to attach); or leave a note
  passalong assign <id> <to>    give it to @handle (or several: @ada @bola), a #group, or "team"
  passalong release <id>        take work back from whoever holds it
  passalong reopen <id> <why>   finished work isn't right: back to To do, and whoever takes it next reads why
  passalong ready <id...|--all> work you have read is Ready — whoever it is for may take it now
  passalong archive <id>        off the board and out of the free tier's count
  passalong rm <id>             delete it
  passalong attach <file>       upload a picture or a file and print the markdown that points at it
  passalong work [--once] [--agent CMD]  run an agent on each piece of ready work here, one after another
  passalong work --watch [--every SECS]  the runner: keep taking work marked safe to run alone
  passalong hub                 open the hub in the browser
  passalong export [dir]        dump every piece of work as plain markdown (default ./passalong-export)
  passalong admin create <email>   make an account that runs Passalong (owner only)
  passalong admin list          who runs it
  passalong admin grant|revoke <@handle>   make an existing account an admin, or stop it being one
  passalong gift <who> --until <date> [--why "..."] [--seats N]
  passalong gifts               what has been given away, and what is still running
  passalong ungift <gift id>    take one back now
  passalong login               sign in from the browser
  passalong login --with-token  read a token from stdin instead (CI, scripts)
  passalong login --new         add another account to this machine
  passalong accounts            the accounts signed in here, and which is the default
  passalong use <name>          make one of them the default
  passalong logout [name]       forget one of them (default: the current one)
  passalong me [--handle H] [--name N] [--email E]   who you are to teammates
  passalong team                current team and its members
  passalong team create <name>  start a team (you become its owner)
  passalong team invite [email] make an invite link (mailed when an email is given)
  passalong team join <link|code>  accept an invite
  passalong team use <slug>     switch the current team
  passalong team promote|demote <@handle>  make a teammate an admin, or a member again
  passalong team remove <@handle>  take a teammate out; `team leave` leaves yourself
  passalong setup               install the Claude Code capture skill, MCP server and hooks
  passalong now                 what this worktree holds and what is waiting (the hooks call --hook)
  passalong mcp                 run the MCP server over stdio
  passalong version             print the installed version (also -v, --version)
```

## More than one account

A machine can be signed in to several accounts, say a work one and a personal one.
`passalong login --new` adds another beside the first, `passalong accounts` lists them, and
`passalong use <name>` picks the default a person at a terminal gets.

An agent has no terminal to be asked at, so with two or more accounts and nothing saying which, it
is refused and told to ask you. It puts the question to you in plain words, you answer, and it calls
`use_account` with the name. That lasts for the session and moves nothing on disk. From a shell,
`--as <name>` or `PASSALONG_ACCOUNT=<name>` says the same for one command. The team you work in
(`passalong team use`) belongs to the account, not the machine.

## Working the queue unattended

`passalong work` runs `claude -p` on each piece of ready work for the repo you are in, one after
another. The agent runs headless, so it can only use the tools you allow up front. Work that needs
a command you did not allow ends up blocked: the agent says so with a `BLOCKED:` progress note and
stops. To allow tools, point `--agent` (or `PASSALONG_AGENT`) at a small script:

```sh
#!/bin/sh
# The prompt must come first: --allowedTools takes any number of values and would swallow it.
exec claude -p "$@" --permission-mode acceptEdits \
  --allowedTools "mcp__passalong__*,Bash(npm test:*),Bash(node:*),Bash(git add:*),Bash(git commit:*),Bash(chmod:*)"
```

```sh
passalong work --agent ./agent.sh
```

Each agent commits its change as `<work id>: …` and hands the hash in with `hand_in`, which puts
the work in Done. If it is not right, `passalong reopen <id> <why>`: the next agent reads the
reason before it starts again. `passalong work --watch` on an always-on machine takes only work a
person marked, on its page, as safe for an always-on agent to take on its own.

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

A team is the unit of sharing: everyone in it sees the same board (Draft, To do, In progress,
Done) and may move work on it. Work can be for one person (`@handle`), a group (`#group`) or the
whole team.

```sh
passalong me --handle lukman            # how teammates address you
passalong team create Khaime            # you become owner; "khaime" is now current
passalong team invite ada@example.com   # or no email: prints a link to send yourself
passalong team join <link>              # on Ada's machine — or she just opens the link
passalong new "Fix the login redirect" --to @ada
passalong board                         # what needs you, who is on what, and what is ready
```

Invites are accepted in the browser, so a teammate needs no terminal to be part of a team.

## MCP

`passalong setup` registers the server with Claude Code, and adds two hooks to `~/.claude/settings.json`: at session start the agent is told what its worktree holds (`passalong now --hook session`), and a session that still holds work is stopped once and told to hand it in, pass it, or leave a progress note (`passalong now --hook stop`). Both say nothing when offline or signed out. It also adds a status line, `passalong now --statusline`, showing what this worktree holds and how much needs you; it prints from a local cache refreshed in the background, and a status line you already have is never replaced. For other clients:

```sh
claude mcp add passalong -- passalong mcp     # or the equivalent stdio config
```

Tools: `take`, `progress`, `hand_in`, `pass` and `ask` for working any piece of work, each answering with what to call next; `create_work`, `find_work` and `update_work` for writing and finding it; `find_projects`, `save_project`, `read_document`, `save_document` and `delete_document` for projects; `add_file`, `read_file` and `delete_file`; and `accounts`.

The same server is hosted at `https://passalong.dev/v1/mcp` for assistants that add remote MCP servers. A screenshot reaches it differently by assistant — ChatGPT passes the file, Claude sends it from its code sandbox to a one-time upload link (`create_upload`, with `passalong.dev` allowed in its network settings), and a local server reads a path. [passalong.dev/connect](https://passalong.dev/connect#screenshots) has the steps.

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
