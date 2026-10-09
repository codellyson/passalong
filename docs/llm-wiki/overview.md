# Overview

**Passalong hands work from one context to another** — repo to repo, machine to machine, agent
session to agent session, person to person — as a **guide**: markdown with frontmatter that the
next agent can act on directly. The product is the handoff, not a knowledge base.

## The problem it answers

Every AI coding session starts from zero. The agent in one repo does not know what the agent in
another found out yesterday; a teammate handed a fix has to reconstruct why it is shaped the way it
is; and when an agent says "done", its author mostly takes its word for it. What people actually
use today is Slack messages, notes to self, pasted snippets and re-prompting from scratch
(PRD §9).

## The loop

1. Someone — usually an agent at the end of a session — writes a guide: what the work is, what
   done looks like, how to check it.
2. It is addressed: to a person, a group, a team, or the task queue.
3. Whoever picks it up **takes** it, reports **progress**, and **hands in** with evidence — or
   **passes** with a reason.
4. The author sees it come back: the evidence, a verdict, the write-up. They approve it or send it
   back with what is still wrong.

Everything else in the repo exists to make that loop cheap: the CLI and MCP server so an agent can
do it without a human, the hub and share links so a person can, teams so it can be addressed,
folders so a longer project can supply reusable context to several guides, and notifications so
nobody has to go and look.

## Who it is for

The eng lead or senior developer tired of re-explaining, landing through one enthusiastic developer
and expanding to a team (PRD §4, §11). Agent-native by rule: every feature must answer *can an agent
do this without a human clicking through a UI?* (PRD §10).

## What it is not

A wiki, a docs site, a replacement for a repo's `docs/`, or a general note-taking app (PRD §9).
Folders hold the material for a specific project; guides remain plain markdown, exportable with
`passalong export` — no lock-in (PRD §10).

## Sources
- [docs/PRD.md](../PRD.md) §1–§11
- [AGENTS.md](../../AGENTS.md), opening section
- [docs/wiki/README.md](../wiki/README.md)
