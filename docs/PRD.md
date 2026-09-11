# PRD: Passalong (formerly Relay)

**Version:** 0.1 draft  **Author:** Lukman Isiaka  **Date:** September 2026  **Status:** Draft for review

## 1. One-liner

Passalong lets a developer capture an implementation they just finished in one context and hand it to another context (a different repo, machine, agent session, or teammate) in a form an AI agent can act on directly.

## 2. Problem

Developers increasingly work across many contexts in parallel: multiple repos, multiple products, multiple agent sessions, sometimes multiple machines. Solutions figured out in one context regularly need to be implemented somewhere else. Today that transfer happens through Slack messages, memory, copy-pasted snippets, or re-explaining the problem to a fresh agent session from scratch.

This is lossy and slow. The original session contained the full reasoning: what was tried, what failed, which decisions were made and why, and how success was verified. Almost none of that survives the transfer. The receiving context (whether it is the same person five minutes later or a teammate on a different codebase) starts close to zero.

Repo docs do not solve this. A `docs/` folder is scoped to one repo and written for permanence. The artifact needed here is scoped to a transfer moment and written for execution: portable, structured, and consumable by an agent on the receiving side.

## 3. Insight

In the age of AI agents, an implementation guide is no longer documentation. It is executable context. A well structured transfer guide can be pulled into a receiving agent's context via MCP and acted on immediately. The product is not a knowledge base. It is a baton pass between contexts.

## 4. Who it is for

**v1 persona:** the multi-context solo developer. Someone running several products, services, or client projects at once. The sender and receiver are frequently the same person in different sessions. No team required to get value on day one.

**v2 persona:** the small dev team (2 to 15 engineers). Teams where knowledge transfer currently happens over chat, and where agents (Claude Code, Cursor, etc.) are part of the daily workflow.

## 5. Core loop (v1)

1. **Finish work in an agent session.** Developer solves something non-trivial in Claude Code (or any agent tool).
2. **Capture.** Run `passalong share`. The CLI (or an agent skill/hook) distills the session into a draft transfer guide: problem, solution shape, decisions and rationale, concrete steps with context-specific parts flagged, and verification steps.
3. **Trim and publish.** Developer reviews the draft, cuts noise, publishes. The guide gets a short ID and is synced.
4. **Pull on the other side.** In the receiving context, run `passalong pull <id>` or let the receiving agent fetch it via the Passalong MCP server. The guide lands in the agent's context and the agent implements, adapting the flagged context-specific parts.
5. **Close.** Say whether it worked. That verdict is the close — an author lifecycle on top of it (`consumed`, `promoted`) was cut, because it said the same thing twice and the pull count already reports how well-travelled a guide is.

The demo moment: solve a bug in service A, run one command, open a session in service B, and the agent there already knows the whole story.

## 6. The artifact: what a transfer guide contains

Plain markdown with frontmatter. No proprietary format, fully exportable, git-friendly.

**Frontmatter:**
- id, title, created, author
- source_context: repo/product where it originated
- status: draft, published (`consumed` and `promoted` are legacy: accepted, never set)
- stack_assumptions: e.g. Postgres, Next.js 15, Paystack v2 API
- tags

**Body sections:**
- **Problem.** What was broken or needed, in two or three sentences.
- **Solution shape.** The approach at a high level, before any code.
- **Decisions and rationale.** What was chosen, what was rejected, and why. This is what lets the receiving context adapt instead of blindly copying.
- **Steps.** Concrete implementation steps. Context-specific parts are explicitly marked (e.g. "ASSUMES: Postgres. If MySQL, adjust X").
- **Verification.** How to confirm it worked: commands, expected outputs, test cases.
- **Gotchas.** Things that failed along the way and why. Often the highest-value section.

## 7. Product surface (v1)

**CLI (`passalong`):**
- `passalong share` - capture from the current session/directory, open draft for review
- `passalong pull <id>` - fetch a guide into the current directory/context
- `passalong list` - list your guides
- `passalong open <id>` - view in terminal or browser

**MCP server:** Exposes `search_guides`, `get_guide`, and `publish_guide` tools so any MCP-capable agent can pull and create guides without leaving the session. This is the strategic rail: it makes Passalong tool-agnostic across Claude Code, Cursor, Windsurf, and whatever comes next.

**Capture skill/hook for Claude Code:** A skill that, when invoked at session end, distills the transcript into the guide structure above. This is the cold start killer: guides are created as a byproduct of work, not as a writing chore.

**Thin web view:** Read-only rendering of guides with a shareable link. No editor at launch. Editing happens in your own tools on the markdown.

## 8. v2: team coordination

- Team workspaces with invite by email
- Guides addressed to a person or team ("handoff to X"), with notification
- Pull activity visible to the sender (did the transfer land?)
- Team-wide MCP endpoint so every member's agents can search the team's guides

Explicitly out of scope for v2: analytics dashboards, rich text editor, comments/threads, permissions beyond workspace membership.

Removed 2026-09-11: a **promotion flow** was listed here — guides that keep getting pulled graduating into a small set of maintained references. It was cut during M2 for the reason §5 already records: the pull count on a guide says how travelled it is, and an author lifecycle on top of that says the same thing twice. Nothing reads `promoted`, the board has no bucket for it, and `passalong promote` prints its own deprecation notice. The line stayed on this list after the thing it described was removed, which made a deliberate decision read as an outstanding gap.

Added 2026-09-04, after asking where a tester's output goes: a **verdict** (`works` / `broken` with a one-line reason) is a first-class event, separate from the guide's status. `consumed` means implemented; a verdict means it actually runs. It is capped at one line per person per guide precisely so it stays a verdict and does not become the comment thread excluded above. This also widens the persona: testers and QA receive guides, and the Verification and Gotchas sections were already written for them.

## 9. Positioning

**What Passalong is not:** a wiki, a docs site, a replacement for `docs/` in a repo, a note-taking app.

**What it competes with in practice:** Slack messages to teammates, messages to self, copy-pasted snippets, and re-prompting agents from scratch.

**Why not just git?** Git is scoped to one repo and has no delivery mechanism into agent context across repos and tools. Passalong's job is the crossing: repo to repo, machine to machine, person to person, agent to agent.

**Why now:** agents made implementation knowledge executable. MCP made cross-tool delivery possible. Neither was true 18 months ago.

## 10. Principles (Just X DNA)

- **No lock-in.** Guides are plain markdown. `passalong export` dumps everything. Deleting your account leaves you with all your content.
- **Local-first spirit.** The CLI works against a local store; sync is the hosted layer. Solo usage should feel like a local tool that happens to sync.
- **Zero-friction start.** Install, `passalong share`, done. Account required only when sync/team enters the picture (this is the one deliberate deviation from pure no-account, since transfer across machines inherently needs a rail). Updated 2026-09-05: email + password sign-in exists for people who arrive through a browser, but the CLI still mints an anonymous account with no email, no password and no forms. Both kinds of account are the same account; one has simply been claimed.
- **Agent-native.** Every feature must answer: can an agent do this without a human clicking through a UI?

## 11. Monetization

- **Free:** solo, unlimited local guides, limited synced guides (e.g. 25 active), personal MCP endpoint.
- **Team (paid, per seat):** shared workspace, team MCP endpoint, handoff/notification flow, unlimited synced guides.
- **Target buyer:** the eng lead or senior dev tired of re-explaining. Land via one enthusiastic dev on the free tier, expand to team.

Built 2026-09-11: **Solo is a real plan.** Every subscription route was team-scoped and owner-only, so an individual who wanted to pay had to invent a team of one — which is also why the free tier could not be closed, since a new account had nowhere to go. `POST /v1/subscribe` buys it and `account.plan` holds it.

Decided 2026-09-11: **the free tier closes to new accounts, and every account that already existed keeps it.** Migration 0016 marks them; `FREE_SIGNUP` is the switch and it is **closed** in production as of 2026-09-11, now that Solo gives an individual somewhere to buy. It still defaults to open in code, so a deployment that does not set it keeps the old behaviour rather than locking people out by omission. What stays free for everybody is the local store — the CLI writes and reads guides with no account and no ceiling, which is §10 and is not a concession.

Pricing note: this is deliberately a team-monetized product. The solo tier is the distribution engine, not the revenue.

Decided 2026-09-11, building it. **A seat lifts whoever sits in it.** A free member of a paid team publishes without a ceiling, and has never paid for anything — the team is what is bought, so the team is what is lifted. Seats are enforced where somebody joins rather than at checkout, because a count taken when a seat is bought drifts the first time a member leaves.

**A lapsed team goes read-only, not dark.** Everything already in it stays readable, pullable and answerable; what stops is new work being addressed to it and anyone new joining. §10 promises no lock-in, and a team's guides are its members' own work — withholding them to collect a debt is exactly what that principle forbids. Verdicts and acks keep working on a lapsed team's guides for the same reason in miniature: they belong to the reader, and the reader is not the person who missed the payment.

## 12. Risks and open questions

- **Capture quality.** If `passalong share` produces mediocre distillations, the loop dies. Mitigation: this is the first thing to prototype and pressure-test before building anything else.
- **Platform absorption.** Anthropic (skills), Cursor, and GitHub are circling adjacent territory. Defensible ground: cross-tool, cross-repo, transfer-shaped rather than library-shaped. The window argues for shipping the narrow loop fast.
- **"Why not just paste it into the next session?"** For small transfers, pasting wins. Passalong has to win on: structure (verification and gotchas survive), addressability (short IDs, MCP search), and cross-machine/cross-person reach. Positioning must be honest that trivial transfers do not need it.
- **Session access.** Capture depends on being able to read the agent session (transcript, hooks). Claude Code hooks make this feasible today; other tools vary. Fallback: `passalong share` can also distill from a working directory diff plus a short prompt.
- **Naming.** Decided 2026-09-04: **Passalong** (was "Relay"). Relay fit the metaphor but was unownable (npm, search, a dozen products). Passalong is plain English, covers self-transfer as well as handoff to a person, and is free on npm and .dev. Rejected: LetThemKnow (implies another person; sounds like notifications), Baton/Handoff/Portage (taken or colliding).

## 13. Milestones

- **M0 - Capture spike (1 to 2 weeks):** prototype the session-to-guide distillation as a Claude Code skill. Success = you personally use it for real transfers between your own projects and the drafts need only light trimming.
- **M1 - Solo loop (3 to 4 weeks):** CLI (share, pull, list), local store, hosted sync, personal MCP server, thin web view. Success = you stop pasting context between your own sessions.
- **M2 - Team layer** (built 2026-09-04; success criterion still open): workspaces, invites, addressed handoffs, team MCP endpoint. Success = one external team (Khaime is the obvious candidate) uses it for a real cross-person transfer weekly.
- **M3 - Public launch:** landing page, docs, Show HN / dev community launch, free and team tiers live.

## 14. Success metrics

- **Activation:** first `passalong share` to first `passalong pull` in a different context within 7 days.
- **Core health:** weekly transfers per active user (share + pull pairs).
- **Quality proxy:** percent of pulled guides that came back with a passing verdict, and how many of those needed no follow-up edit to the guide.
- **v2:** percent of transfers that cross a person boundary (self-transfer vs team-transfer ratio).

All four are computed by `pnpm metrics --dev` (or `--remote`), which reads `guide`, `pull` and `verdict` in D1 directly.

Added 2026-09-11, on making these measurable for the first time. Two notes that belong with the numbers rather than behind them.

The **quality proxy** used to read "percent of pulled guides marked consumed without follow-up edits". `consumed` meant implemented when that was written and means archived now — the author's shelf — so counting it would have answered a different question than the one being asked. The verdict is what replaced it and is the better instrument anyway: the reader's judgement rather than the author's. "Without follow-up edits" survives unchanged, as `guide.updated` moving after a verdict.

**Activation undercounts, and will keep undercounting.** `passalong pull` serves a guide out of the local store without calling the API unless it carries a team, so a developer pulling their own teamless guide into another repo — the v1 loop, exactly — leaves no row to count. Closing that would mean recording a pull for a fetch that never happens, which is worse than a known-low number. Read it as a floor.

None of this can come from Aptabase: both per-account bullets need sequences joined on who did what, and `analytics.ts` sends categorical props and never an id, on purpose. That is why the figures come from a script against the database and not from the dashboard.
