# PRD: Passalong

**Author:** Lukman Isiaka  **Version:** 1.0  **Date:** October 2026

What the product is for and who pays for it. `docs/LOOP.md` is the direction and `docs/WORK.md`
the shape of work; this page keeps the intent, the principles and the numbers they are measured by.
Section numbers are cited from code and other docs, so they stay put.

## 1. One-liner

Passalong keeps a team's work and what it knows, for people and their agents: work someone must
still do, and projects holding the documents and files that work needs.

## 2. Problem

Work crosses contexts all day: from a customer to the team, from one person to another, from a
person to an agent and back, from one repo or machine to the next. Today it crosses through chat
messages, memory and re-explaining the problem to a fresh agent session. Almost nothing survives:
what was asked, what was tried, what was decided and how it was checked. And what was learned along
the way lives in one session's transcript, where nobody finds it again.

## 3. Insight

With agents, work written down is executable. A piece of work an agent can read through MCP is
acted on at once, and what it learns can be written back where the next reader looks. The product
is not a knowledge base and not a ticket tracker: it is the place work passes through, and the
project documents it leaves behind.

## 4. Who it is for

The small team (2 to 15 people) whose agents (Claude Code, Codex, ChatGPT, Claude, Cursor) are part
of the daily work, and the people around them who do not run agents: testers, designers, support.
A person working alone gets value on day one, but the team is what Passalong is sold to (§11).

## 5. Core loop

1. **Something comes in.** A teammate's words in the hub's box, an email, a phone's share sheet, a
   webhook, a customer's message, or an agent's `create_work`. The reader (Passalong's own model
   call) gives it a title, a summary and the project and group it is for.
2. **Someone takes it.** A person ("I'll do this") or an agent (`take`). One holder at a time; the
   author sees who has it.
3. **It moves.** Progress notes as it goes; `ask` when the holder needs the person, who replies.
4. **It finishes.** A hand-in with proof a person can look at puts it in Done. Reopen brings it back
   with the reason.
5. **What was learned is kept.** The agent writes it into the project's documents, where everyone
   finds it.

Passalong runs no agent of its own on a team's work: teams bring their own.

## 6. The artifact

Work is plain markdown with frontmatter: a `title`, a `summary` a person can read (400 characters at
most) and whatever body the next reader needs. No kinds, sections or templates. `status` is
`draft`, `ready` or `done`; `tags`, `parent:` and `blocked_by:` are optional. Pictures and files
travel with it. Project documents are markdown too, versioned so a person's and an agent's edits
cannot silently replace each other.

## 7. Product surface

- **The hub** (`/hub`): Needs you, the team board (Draft, To do, In progress, Done), projects with
  their documents, files, work and history, Support, and the box for writing work.
- **MCP**, stdio (`passalong mcp`) and hosted (`/v1/mcp`): seventeen tools over work, projects,
  documents and files.
- **The CLI** (`passalong`): the same acts from a terminal, and `passalong work` to run an agent on
  ready work.
- **Share links** (`/w/:id/:key`, `/p/:id/:key`): a read-only page for anyone holding the link,
  running no script.

## 8. Teams

A team sees one board and anyone on it moves the work. Work is addressed to a person (`@handle`),
a group (`#group`) or the whole team, and whoever it is for is told: in the hub, by push, by mail.
Out of scope: analytics dashboards, comment threads (a thread on work is only between whoever holds
it and the people it is for), and permissions beyond team membership and ownership.

## 9. Positioning

**What Passalong is not:** a wiki, a docs site, a replacement for `docs/` in a repo, a note-taking
app, a Trello for agents, or a host for agents.

**What it competes with in practice:** chat messages to teammates and to yourself, pasted snippets,
and re-prompting agents from scratch.

**Why not just git or an issue tracker?** Git is one repo and has no way into an agent's context
across tools. A tracker holds tickets for people to read; Passalong holds work an agent takes and
finishes with proof, and the documents it learned from.

## 10. Principles

- **No lock-in.** Work and documents are plain markdown. `passalong export` dumps everything.
  Deleting your account leaves you with all your content.
- **Server-first, nothing left behind.** Work lives on the server; nothing is kept on the machine
  unless somebody asks (`take --save`, `export`).
- **Zero-friction start.** Install, `passalong login` (approved in the browser), write work.
  Invites are accepted in the browser, so a teammate needs no terminal.
- **Agent-native.** Every feature must answer: can an agent do this without a human clicking
  through a UI? The one deliberate exception is mail to a customer, which only a person sends.

## 11. Monetization

- **Free:** a ceiling of `FREE_SYNC_LIMIT` (25) active pieces of work, open to new accounts while
  `FREE_SIGNUP` is `"1"`. Accounts from before the free tier changed keep what they had.
- **Solo:** $5 a month, no ceiling for one person.
- **Team:** $20 a month for up to ten people. A seat lifts whoever sits in it, paid for or not.
- **Target buyer:** the lead tired of re-explaining. Land with one person, expand to the team.

A lapsed plan is read-only, not dark: new work stops flowing in, but work in flight still closes
and everything stays readable and exportable, because withholding a team's own work to collect a
debt is what §10 forbids. Payments go through Bachs, a merchant of record; plans can be given for a
time by whoever runs Passalong, and every gift ends. AGENTS.md holds the rules.

## 12. Risks and open questions

- **Platform absorption.** Agent vendors are building adjacent queues and memories. Defensible
  ground: cross-tool, cross-person, and work that closes with proof.
- **"Why not just paste it?"** For small crossings, pasting wins. Passalong has to win on
  addressability, proof, and what is kept for the next person.
- **The loop's open steps** are in docs/LOOP.md §7.

## 13. Milestones

- **Built:** the CLI, MCP over stdio and HTTP, the hub, teams, the task queue, projects, intake by
  box, mail, share sheet and webhook, customer support, paid plans.
- **1.0:** one model and one set of words (docs/WORK.md, docs/DEPLOY.md's cutover).
- **Next:** docs/LOOP.md's build order.

## 14. Success metrics

- **Activation:** an account's first piece of work taken in a different context within 7 days.
- **Core health:** crossings per active person per week (work written and taken by somebody).
- **Quality proxy:** the share of work taken by somebody else that finished with proof and was not
  reopened.
- **Crossing people:** the share of crossings from one person to another, rather than to yourself.

All four are computed by `pnpm metrics --dev` (or `--remote`), which reads D1 directly and prints
beside each number what it cannot say. None can come from Aptabase: the per-account figures need
sequences joined on who did what, and `analytics.ts` never sends an id, on purpose.
