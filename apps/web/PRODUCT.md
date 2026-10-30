# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Leads and founders** of small mixed teams (developers, marketing, support): the first person to open Passalong each day, to see what needs them, which customers are waiting and what is stuck, then act (confirmed 2026-10-29).
- **Developers working with AI agents**: their agents take work, read the project's documents, and hand in with evidence.
- **People who are not developers** (AGENTS.md, docs/LOOP.md §5): support staff, product managers, testers. Nothing is installed for them and nothing is typed in a terminal; they work in the hub.
- **Who answers customers is unpredictable** (confirmed 2026-10-28): it may be dedicated support staff, a founder, or a developer. Support screens assume no technical knowledge and no fixed role.

They work at a laptop. The phone receives alerts and is used for quick replies (confirmed 2026-10-28).

## Product Purpose

Passalong keeps a mixed team from dropping work in the AI age, and gives every person and agent who picks work up the knowledge of the product (docs/LOOP.md §0). Five ideas: things come in (customer email, a phone screenshot, the box, alerts); the agent sorts them into a project and to a group; projects (one per product or repo) hold documents (what to know) and work (what to do). Success is closure: in development, work handed over gets done with proof; in support, every customer request ends resolved or declined with a reason, and nothing is left behind (docs/LOOP.md §1).

## Positioning

"Your team's agents know your product, and nothing that comes in gets dropped" (2026-10-29). Not a help desk, a wiki or a tracker on its own: the referee between what comes in and what gets closed, with the product's memory attached. Passalong never hosts the agent that does the work; its own agent sorts, tidies the board and decides, recording why, with Reopen as the undo. Maturity bar named by the user: Notion, Intercom/Front, Attio/Height.

## Operating Context

- Work arrives from agents (CLI, MCP over stdio and HTTP), from email and webhooks, and from customers writing to a support address.
- A team has projects; each holds documents and work. A team board shows work across projects (Draft, To do, a column per person or group, In progress, Done).
- Agents take, report progress, ask, hand in with evidence, or pass. People reply, reopen, archive.
- A customer's messages form one thread, as in Freshdesk; customers never see Passalong itself, only email with a tracking number.

## Capabilities and Constraints

- Work is one thing: plain markdown with a title, a summary and optional tags (an agent may tag `bug`); no kinds or required sections (docs/WORK.md). People see "work", "project", "document", "file"; never "work".
- Share pages render markdown a stranger wrote and run no script; only `/hub`, `/join/:code` and `/reset` run script. The hub frames a work item's document, never renders it as its own HTML.
- A customer's contact details are columns, never in the document.
- Nothing is sent to a customer until a person presses Send.
- Settings must not grow; new setup belongs on the board or in a project.
- Undecided: where customers write besides email.

## Brand Commitments

Name: Passalong. Voice: plain words, short sentences, says what happened and who did it; no marketing tone in the product. The hub names actions in plain words (I'll do this, Stop this agent, Finish, Reopen) rather than command names.

## Evidence on Hand

No customer testimonials, logos or usage figures are recorded for use in the product; none may be invented. Internal production figures exist in AGENTS.md for decisions, not for display.

## Product Principles

1. Nothing is left behind: every item ends done or declined with a reason, and anything that stops reaches a person.
2. Shown, not said: evidence travels with finished work, as input to a decision rather than a gate.
3. The agent decides and records why; people are told, not asked, and undo in one tap. Sending to a customer stays a person's.
4. No surface for a role that has to learn developer vocabulary to use it.
5. One place for each rule; the product does not invent answers on someone's behalf.
