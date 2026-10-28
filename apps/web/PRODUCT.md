# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Developers working with AI agents** (the original persona, docs/PRD.md §4): solo developers across many repos and sessions, and small teams of 2 to 15 engineers. They hand finished work and new tasks between agent sessions, machines and teammates.
- **People who are not developers** (AGENTS.md, docs/LOOP.md §5): support staff, product managers, testers. Nothing is installed for them and nothing is typed in a terminal; they work in the hub.
- **Who answers customers is unpredictable** (confirmed 2026-10-28): it may be dedicated support staff, a founder, or a developer. Support screens assume no technical knowledge and no fixed role.

They work at a laptop. The phone receives alerts and is used for quick replies (confirmed 2026-10-28).

## Product Purpose

Passalong hands work from one context to another — between agent sessions, machines, people, and AI agents — as guides an agent can act on directly. Success is closure: in development, work handed over gets done with proof; in support, every customer request ends resolved or declined with a reason, and nothing is left behind (docs/LOOP.md §1).

## Positioning

Handoffs for agents first (confirmed 2026-10-28). Support is one way work arrives, not a separate help-desk product. Passalong's mechanism is the baton pass: a guide carries the full context, an agent or person takes it, works it, and hands back proof. It is the referee that guarantees every item closes, whoever does the work (docs/LOOP.md §5).

## Operating Context

- Work arrives from agents (CLI, MCP over stdio and HTTP), from email and webhooks, and from customers writing to a support address.
- A team shares one Work board (Draft, To do, a column per person, In progress, Done).
- Agents take, report progress, ask, hand in with evidence, or pass. People reply, reopen, archive.
- A customer's messages form one thread, as in Freshdesk; customers never see Passalong itself, only email with a tracking number.

## Capabilities and Constraints

- Guides are plain markdown with frontmatter; kinds are `task`, `bug` and `transfer`, always stated.
- Guide pages render markdown a stranger wrote and run no script; only `/hub`, `/join/:code` and `/reset` run script. The hub frames a guide's document, never renders it as its own HTML.
- A customer's contact details are columns, never in a guide's document.
- Nothing is sent to a customer until a person presses Send.
- Settings must not grow; new setup belongs on the board or in a folder.
- Undecided: where customers write besides email; where the agent runner runs.

## Brand Commitments

Name: Passalong. Voice: plain words, short sentences, says what happened and who did it; no marketing tone in the product. The hub names actions in plain words (I'll do this, Stop this agent, Finish, Reopen) rather than command names.

## Evidence on Hand

No customer testimonials, logos or usage figures are recorded for use in the product; none may be invented. Internal production figures exist in docs/REVIEW.md and AGENTS.md for decisions, not for display.

## Product Principles

1. Nothing is left behind: every item ends done or declined with a reason, and anything that stops reaches a person.
2. Shown, not said: finishing needs proof a person can look at.
3. People decide where judgment is theirs; agents do the rest.
4. No surface for a role that has to learn developer vocabulary to use it.
5. One place for each rule; the product does not invent answers on someone's behalf.
