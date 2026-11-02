# Overview

**Passalong keeps a team's work and what it knows, for people and their agents.** Four nouns:
**work** (what someone must still do), **projects** (today's projects, one per product or repo),
their **documents** (what to know about it) and **files**. A piece of work is markdown with
frontmatter — a title, a one-line summary for a person, and whatever the next reader needs — that an
agent can act on directly.

> **Direction since 2026-10-29** ([LOOP.md §0](../LOOP.md)): build step 1, **one thing: work**, is
> built — no kinds, sections or write-up work, 17 agent tools over the four nouns
> ([docs/WORK.md](../WORK.md)). Next: the agent tidies the board (closing finished work, judging
> hand-ins), then onboarding, then projects as the home of all work.

## The problem it answers

Every AI coding session starts from zero, and a mixed team drops work: the agent in one repo does not
know what another found out yesterday, a request from a customer sits in an inbox, and when an agent
says "done", its author mostly takes its word for it. What people actually use today is Slack
messages, notes to self, pasted snippets and re-prompting from scratch (PRD §9). Usage moved from
passing documents between contexts to tracking work: 162 of 200 pieces of work were really tasks and bugs.

## The loop

1. Work comes in: written by a person or an agent (`create_work`, `passalong new`, the hub's box),
   mailed to `key+new@` or `key+support@`, or posted by a webhook. The reader names it and picks the
   group.
2. It is addressed: to a person, a group, a team, or the queue.
3. Whoever picks it up **takes** it, reports **progress**, **asks** when it needs a person, and
   **hands in** with evidence — or **passes** with a reason.
4. Handing in is final: it goes to Done with what was shown. **Reopen** puts it back with why.
   What was learned goes into the project's documents, not into a second piece of work.

Everything else in the repo exists to make that loop cheap: the CLI and MCP server so an agent can
do it without a human, the hub and share links so a person can, teams so it can be addressed,
projects so a project supplies its documents to every piece of work in it, and notifications so
nobody has to go and look.

## Who it is for

The eng lead or senior developer tired of re-explaining, landing through one enthusiastic developer
and expanding to a team (PRD §4, §11). Agent-native by rule: every feature must answer *can an agent
do this without a human clicking through a UI?* (PRD §10).

## What it is not

A general wiki or note-taking app, or a host for agents — teams bring their own (PRD §9, LOOP.md §0).
A project's documents are about that product; work stays plain markdown, exportable with
`passalong export` — no lock-in (PRD §10).

## Sources
- [docs/PRD.md](../PRD.md) §1–§11
- [AGENTS.md](../../AGENTS.md), opening section
- [docs/LOOP.md](../LOOP.md) §0, [docs/WORK.md](../WORK.md)
- [docs/wiki/README.md](../wiki/README.md)
