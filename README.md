# Passalong

Hand finished work to another context.

Solve something non-trivial in one agent session. Run one command. Open a session in another
repo, on another machine, or with a teammate, and the agent there already knows the whole story:
the problem, the decisions and why, the steps, how to verify, and what went wrong along the way.

```sh
npm i -g passalong
passalong setup      # installs the Claude Code capture skill + registers the MCP server
passalong login      # optional: sync guides across machines and get share links
```

## The loop

1. **Finish work** in Claude Code (or any agent). Say *"pass this along"*, run `/passalong-capture`, or
   run `passalong share` yourself.
2. **Trim and publish.** The draft opens in your editor. Save it and you get a short id and a link.
3. **Pull on the other side.** `passalong pull <id>` in the target repo, or paste the link to any
   agent with the Passalong MCP server. The guide lands in its context; it implements, adapting the
   parts marked `ASSUMES:`.
4. **Close.** Say whether it worked: `passalong works <id>`, or `passalong broken <id> <why>`.
   `passalong done <id>` shelves it when you are finished with it.

## Commands

```
passalong share [file] [--to team[/handle]]  publish a guide → id + link; --to hands it to a team or teammate
passalong task "<what needs doing>"  write a task for an agent; it waits in Draft
passalong ready <id...|--all> tasks you have read are ready — an agent may take them now
passalong tasks               every task and where it is: draft, ready, claimed, stalled, review
passalong work [--once] [--agent CMD]  run an agent on each ready task here, one after another
passalong approve <id>        the work in review is done
passalong reject <id> <why>   not done: back to Ready, and the next agent reads why
passalong release <id>        take a task back from the agent holding it, stalled or not
passalong pull <id|link>      fetch a guide into ./.passalong/ (git-ignored) and print it
passalong inbox               guides handed to you that you have not pulled yet
passalong board               waiting on you, in flight, landed, worth keeping
passalong activity [--all]    what happened while you were away; clears unless --all
passalong log [repo]          what you did, newest first, under a heading per month
passalong list [query]        your guides and your teams', local and synced
passalong open <id> [--print] view a guide in the browser (or the terminal)
passalong hub                 open your synced guides in the browser
passalong works <id>          you tried it and it holds up
passalong broken <id> <why>   you tried it and it does not — the author is told, with your reason
passalong done <id>           deprecated: mark consumed
passalong rm <id>             delete a guide locally and from sync
passalong export [dir]        dump every guide as plain markdown
passalong login [token]       create an account, or attach this machine with a token from your hub
passalong me [--handle H] [--name N] [--email E]   who you are to teammates
passalong team                current team and its members
passalong team create <name>  start a team (you become its owner)
passalong team invite [email] make an invite link (mailed when an email is given)
passalong team join <link>    accept an invite
passalong team use <slug>     switch the current team
passalong setup               install the Claude Code capture skill + register the MCP server
passalong mcp                 run the MCP server over stdio
```

## Working the task queue unattended

`passalong work` runs `claude -p` on each ready task for the repo you are in, one after another.
The agent runs headless, so it can only use the tools you allow up front. A task that needs a
command you did not allow ends up blocked: the agent says so on the board with a
`BLOCKED:` progress note and stops. To allow tools, point `--agent` (or `PASSALONG_AGENT`) at a
small script:

```sh
#!/bin/sh
# The prompt must come first: --allowedTools takes any number of values and would swallow it.
exec claude -p "$@" --permission-mode acceptEdits \
  --allowedTools "mcp__passalong__*,Bash(npm test:*),Bash(node:*),Bash(git add:*),Bash(git commit:*),Bash(chmod:*)"
```

```sh
passalong work --agent ./agent.sh
```

Each agent commits its change as `<task id>: …` and hands the hash in with `hand_in`, so you
review one task's change at a time. Then `passalong approve <id>`, or
`passalong reject <id> <why>`: the next agent reads the reason before it starts again.

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

## Teams

A team is the unit of sharing. Members can find, pull, and mark consumed every guide shared to
the team; a guide can also be handed to one person, who sees it in their inbox (and by email
when the server has mail configured).

```sh
passalong me --handle lukman            # how teammates address you
passalong team create Khaime            # you become owner; "khaime" is now current
passalong team invite ada@example.com   # or no email: prints a link to send yourself
passalong team join <link>              # on Ada's machine — or she just opens the link
passalong share --to khaime/ada         # hand this guide to Ada
passalong inbox                         # on Ada's side: what was handed to you
passalong activity                      # back on your side: it landed, and who pulled it
```

A receiver who tries the work reports back with `passalong works <id>` or `passalong broken <id> <why>`.
That is separate from `done`, which means *implemented*: a verdict means it actually runs, a failing
one has to say why, and the author sees it on their board and in their inbox.

Sign in at [the hub](https://passalong.dev/hub) with an email and password, and mint
an API token there for the CLI and MCP servers — named, revocable, and shown once. Your password
never goes near the terminal. `passalong login` with no arguments still makes an account without
any of that; add an email and password later to be able to sign in from a browser and recover it.

Not everyone who receives a guide implements it. Every guide page has a **Verify** view
(`?view=verify`) that leads with Problem, Verification and Gotchas and folds the implementation
away — for a tester or anyone checking the work rather than doing it. Invites are accepted in the
browser, so a teammate needs no terminal to be part of a team.

`passalong activity` is the other half of the transfer: it tells you when someone pulled a guide
you handed over, when they marked it consumed, and when an invite was taken up. A handoff
addressed to a person is also emailed; a team-wide share is not, because mail nobody is
named in is the first thing people filter out. A guide's pull count is on its row, which is how
you see which ones keep travelling — there is nothing to mark them as, and nothing to mark.

## MCP

`passalong setup` registers the server with Claude Code. For other clients:

```sh
claude mcp add passalong -- passalong mcp     # or the equivalent stdio config
```

Tools: `take`, `progress`, `hand_in` and `pass` for working any guide, each answering with what to call next; `publish_guide` (with `to`), `file_bugs`, `get_guide`, `search_guides`, `guide_template`, `set_guide_status`, `attach_screenshot`, `inbox`, `board`, `activity`, `log`, `plan_tasks`. The older `start_guide`, `ack_guide`, `verify_guide`, `next_task`, `task_progress` and `finish_task` still work, as those four.

The same server is hosted at `https://passalong.dev/v1/mcp` for assistants that add remote MCP servers. A screenshot reaches it differently by assistant — ChatGPT passes the file, Claude sends it from its code sandbox to a one-time upload link (`create_upload`, with `passalong.dev` allowed in its network settings), and a local server reads a path. [passalong.dev/connect](https://passalong.dev/connect#screenshots) has the steps.

## Principles

- **No lock-in.** Guides are files. `passalong export` dumps everything.
- **Local-first.** Works with no account. Sync is the hosted layer.
- **Agent-native.** Everything the CLI does, an agent can do over MCP.

## Repo

- `packages/passalong` — CLI + MCP server (`passalong` on npm)
- `apps/api` — sync API and read-only web view (Cloudflare Worker + D1; static assets in `public/`)
- `docs/PRD.md` — the product spec
- `docs/wiki/` — reference: data model, API surface, auth, the web view, releasing
- `docs/DEPLOY.md` — the runbook

See `AGENTS.md` for the conventions, and `docs/wiki/` for how the pieces actually work.
