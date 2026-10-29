# The loop: every request closes

**Status:** Direction, recorded 2026-10-28 from a conversation with the author. Nothing here is
built. It is written down so the train of thought is not lost; each step below still needs its own
decision before it is built.

## 1. The dream, and how to tell it is true

Passalong should let AI do work end to end with little or no human interference. The measure is
not activity, it is closure:

- **In development, work gets done.** A task goes from Ready to Done with proof, and nobody has to
  nudge it along the way.
- **In customer support, things get done and nothing is left behind.** Every request ends in one of
  two places: resolved with proof, or declined with a reason someone gave. Nothing sits silently in
  between.

"Nothing left behind" is countable: items with no owner and no movement, getting older. That number
should be zero, and the product should show it.

## 1a. Three problems, and the author's calls (2026-10-28)

The work is organised by the problem it solves. The author answered each solution in a shared doc
([Passalong: problems and solutions](https://claude.ai/artifact/X8H9UBRe6vAMwFLw9xEmqa)); this is
what was decided.

**Problem 1 — support loses track of customers and the issues they reported.** A business problem:
what is lost is customers. Decided:
- A customer's messages are **one thread**, as in Freshdesk: replies and a customer writing again
  continue it, whatever state the request is in.
- **The agent routes each message to the team that should act** — developers, marketing, and so on
  — not only "question or bug". Routing is to a team's column; a person can move it.
- **Evidence a customer sends is never dropped.** Screenshots and attachments on an email reach the
  request. *Built 2026-10-28:* up to five files per message are kept on the request — pictures drawn
  in the conversation, other files offered as downloads — and a file that cannot be kept is named.
- "Tell the customer" when a fix lands is **opt-in** per team, not always on. *Built 2026-10-29:*
  `team.tell_customer` (migration 0059), off by default, set by a team owner on the Support page
  (`PUT /v1/teams/:slug/tell-customer`). It gates the "tell the customer" words on `child_done`, the
  "is done. Tell them." line in the conversation, and the draft that starts by itself on a finished fix.
- The reply screen is **redesigned**, not patched. A "who is waiting on us" view, the agent drafting
  replies a person sends, and the team lead ping are agreed as planned. *Built 2026-10-28:* the agent
  drafts the reply (`POST /v1/guides/:id/customer/draft`, `askDraft()` in reader.ts) from the
  conversation, the task's state and what finished work reported; it appears in the reply box by
  itself when the customer is waiting on us, labelled until the person changes it, and only a person
  sends it. *Built 2026-10-29:* the team lead ping — a customer waiting four hours (`CUSTOMER_WAIT_MS`)
  with no answer and nobody holding the request sends `customer_waiting` to its author and the team's
  owners, pushed and mailed, once per wait (`customersWaiting()` in claims.ts, the hourly sweep).
- Open: where customers write besides email (WhatsApp, chat, social, phone).

**Problem 2 — people create Passalongs in ChatGPT and Claude, not on Passalong.** Decided:
- *Built 2026-10-28 for support:* the reader (`apps/api/src/reader.ts`, provider-agnostic through the
  AI SDK: Anthropic, OpenAI, Google or any OpenAI-compatible provider) sorts each customer message into a task or a bug and routes it to the
  team's group by name; unsure, it files for the whole team and asks the author and owners by push
  and mail. The box on its own screen is next, on the same reader.
- *Built 2026-10-28:* the box is `/hub/new` ("Write it down here" in the New menu). The reader files
  what was written at once as a task, bug or handover for a group (`POST /v1/compose`); the page
  says what it became, with one-click move and undo. When unsure it asks there and files nothing
  until answered. The input is a WYSIWYG editor (TipTap, `components/hub/Writer.vue`): it reads as
  you type (`POST /v1/compose/preview`, nothing filed) and lists work already on the board that
  looks the same; a pasted screenshot uploads and shows in place, a pasted error or log becomes a
  code block, links stay links; `@` suggests people and `#` the team's groups. The page leads with the agent at work: "What do you need?", starter chips, and an Agent panel beside the editor that fills in as you write — what it is, where it goes and why, what it has drafted, what already looks like it — then where it was filed; the last few it filed are listed below (`GET /v1/compose/recent`).
- The box lives on **its own screen**.
- The reader runs on **strict, tested rules**.
- **It classifies on its own; there is no confirm step.** This reverses §6 item 4 below. To keep the
  intent of "a silent default is a fabrication", the guide records that the reader classified it,
  the person sees the result at once, and changing it is one click.
- When it is unsure and asks, the question is **impossible to miss** — push and email, not only the
  feed.

**Problem 3 — work handed to agents stops and nobody notices.** Decided:
- Untaken work reminds people **every day until someone acts**, not once. *Built 2026-10-28:* the
  feed and the phone hear it daily; the email goes the first time only.
- The hosted runner takes **only work guaranteed to need no person**: a task carries a mark saying
  it is safe to run alone, and the runner skips everything else.
- *Decided and built 2026-10-29:* the runner runs on any always-on machine with the repo checked out:
  `passalong work --watch [--every SECS]`. A person ticks **Safe to run alone** on a task's page
  (`PUT /v1/guides/:id/alone`, column `alone`, migration 0058; the CLI and MCP are refused); the
  runner asks the queue for marked work only, waits when there is none, and keeps going past a task
  its agent did not finish, which the sweep puts back and reports stuck the second time.

**Order, approved:** 1. the "who is waiting on us" view, as a thread · 2. the reader and its
screen · 3. the agent drafting replies · 4. the runner. Before 1: keep customer attachments, and
make the untaken reminder daily.

## 2. The lens

A bit of Freshdesk (requests come in and get answered), a bit of Linear/Trello (a board of work),
a bit of Intercom without the hosted chat widget (a conversation with the customer, and a knowledge
base answers come from). Passalong already has a piece of each:

| From | Passalong today |
| --- | --- |
| Freshdesk | Email in and webhooks turn messages into guides (`apps/api/src/inbound.ts`) |
| Linear / Trello | The team board, a column per person (`Board.vue`, `lanesOf()`) |
| Intercom | Threads with `ask`/`reply` (docs/CONVERSATION.md), folders as a knowledge base |

**The value is the seam, not the three halves.** Teams run a help desk beside an issue tracker. A
customer reports a bug, a ticket is opened, someone copies it into the tracker, development fixes
it, and nobody tells the customer. Each tool owns only its half, so the gap between them belongs to
nobody, and that gap is exactly where things are left behind.

**The guard against becoming a weak copy of three products:** a feature is built only if it closes
the loop below. Not because an incumbent has it. Skipped on purpose: macros and custom ticket fields,
customer portals, cycles, estimates and roadmaps, the chat widget, outbound campaigns.

## 3. The loop

1. A customer writes in. It becomes a guide, with the customer recorded as who asked.
2. Someone takes it — an agent or a person. If it is answerable from the knowledge base, it is
   answered; if it is a defect, a child `bug` guide goes to development with the request as its
   `parent`.
3. The child is fixed, with proof.
4. The child finishing wakes the parent: the customer gets a reply.
5. Both are Done. If anything stops on the way, a person is told; it never goes quiet.

## 4. The experience, person by person

Decided with the author 2026-10-28. One request, followed through everyone it touches: Jane writes
"the export button does nothing".

- **The customer (Jane) never sees Passalong.** She emails the team's support address, which
  forwards in. She gets an acknowledgement at once — "we've got it, we'll reply when it's sorted" —
  carrying a **tracking number**. Later she gets the real answer by email. Her replies quoting the
  tracking number join the same request rather than starting a new one.
- **The support person (Ada), non-technical, lives in the hub and on her phone.** Her board shows a
  card for Jane's request, with one line from the agent saying how it was sorted ("Looks like a bug.
  Sent to development."). If the knowledge base could answer it, she sees a drafted reply instead.
- **The agent sorts every request; a person can override it.** Question or bug, decided at once, with
  the reason in one line. Ada can move it if it is wrong.
- **A person always taps Send.** The agent drafts every reply to a customer; nothing reaches a
  customer until a person has approved it. Automatic sending waits until trust is earned.
- **Development (a person or an agent)** gets a bug guide in its column, linked to Jane's request,
  fixes it with proof, and finishing it wakes the request: "Fixed. Reply to Jane ready." Ada sends.
- **The team lead** opens the board to "nothing left behind", or a short list of what is stuck and
  who it waits on. A request nobody has touched for a set time (about four working hours) pings the
  team lead on phone and email.
- **An agent that is stuck asks** the support person on her phone. Nothing goes quiet.

**The tracking number is not the guide's id, and the customer is not in the document.** The author's
worry (2026-10-28) was that guides travel and would expose the customer. The id alone reads nothing —
`GET /v1/guides/:id` needs a credential and the right to read — but a share link reads the whole
document with no account, it is pasted into chats and handed to agents, and screenshots are public
by id. So:

- The tracking number is its own value, made for customers (a team prefix and a short code, say
  `ACME-K7Q2`), mapped to the request on the server. It opens nothing on its own.
- A customer's reply joins a request only when it carries the tracking number **and** comes from the
  address that request was opened by, so a guessed or leaked number cannot add to someone else's.
- Who the customer is (address, name) is a column on the request, never markdown — the same reason
  `guide.client` is a column: a field in the document travels with every share link and every
  agent that reads it. The document holds what the customer said, not how to reach them.
- A bug sent on to development carries the defect, not the customer.

Still to settle: whether the customer gets a page to check status, or only email.

## 5. Principles agreed along the way

- **No manager agent in the middle.** Passalong is the middle, and it runs on rules, not on a model.
  A supervising agent is one more thing that can drop work, is nondeterministic, and would be a
  second place for rules — and the codebase's rule is that a rule lives in the route.
- **Passalong is the referee, not only a player.** Its job is to guarantee every item closes,
  whoever does the work: Fin, Claude Code, Devin or a person. Outside agents already plug in through
  MCP, webhooks and email in, and are held to the same rules. Building our own worker is a second
  product; do it only if real users have no agent at all.
- **Not every user is technical.** For a support person, a product manager or a tester, nothing is
  installed and nothing is typed in a terminal. They say what they want (email, hub, phone), see who
  or what is on it in plain words, answer when asked, and see proof they understand — a screenshot,
  or the reply the customer got, never command output. Anything that runs work for them is hosted,
  or set up once by one technical teammate.
- **Setup does not grow Settings** (it is already too much); it goes on the board or in a folder.

## 6. What is missing, in order

1. **Stop the leaks, and count what drops.** *Built 2026-10-28* — stalled holds go back in the
   queue two hours after their lease lapses (`requeueStalled`), a second time mails the author
   (`stuck`); sent work nobody took stays Ready and mails its author and the team's owners after
   three days (`untaken`); `scripts/metrics.mjs` opens with "Left behind — right now". Before that,
   work could be left behind by design:
   - A stalled claim stays locked until a person releases it (`claims.ts`); nothing re-queues it.
   - Ready work nobody takes for a fortnight goes back to Draft (`backToDraft`), where it reaches
     nobody.
   - `scripts/metrics.mjs` measures PRD §14, not how much was dropped.

   The fix: stalled work goes back to the queue and a second stall tells a person; untaken work is
   escalated to a person rather than shelved; a "dropped" count in metrics. Highest value for the
   least code — every automation added before this just drops work faster.
2. **The customer as a party on a guide.** *Built 2026-10-28* — `key+support@` takes mail from
   anyone, makes a Ready task with the customer and a tracking number on the row (migration 0057),
   answers at once, joins replies that carry the number from the same address (reopening finished
   work), and a person answers on the request's page under the **Support** tab (a table of every request; a row opens the conversation beside the task it became). Not yet: an agent drafting the reply
   for the person to send, and the agent sorting a request into question or bug. Before that, email
   in accepted only senders the account had allowed, and nothing went back to whoever wrote in.
3. **A parent wakes when its child does.** *Built 2026-10-28* — when a guide made from another
   reaches Done, the parent gets a note on its thread (which its holder and next taker are handed)
   and its author and holders a `child_done` notification; a support request says "tell the
   customer", and its Support page shows what finished since the customer was last answered. It
   wakes, it does not close: the parent is done when a person has answered the customer.
4. **Filing work from the hub, without an agent of your own.** Today a guide is made by an agent
   through MCP or the CLI, or by email in. A support person, a tester or a product manager has
   neither. The hub gets one box: the person writes or pastes whatever they have — a sentence, a
   customer's message, a screenshot — and a small model on the server (Claude Haiku, or another
   small model) reads it and derives the purpose: which kind it is, the summary, and the sections
   that kind needs (Acceptance for a task, Reproduce and Verification for a bug). It is not an
   editor and the person writes no structure.

   *Reversed 2026-10-28 (§1a): it classifies on its own, with no confirm step; the guide records that
   the reader classified it and the person changes it in one click.* As first agreed:
   **The person confirms; the model never decides alone.** It shows back what it understood, in
   plain words — "Something broken. Jane can't export. Done when: the export downloads." — with
   **Looks right** and **Change**. Nothing is stored until the person says it is right, so the kind
   and the summary are still stated by the author, by confirming them; the rule that a silent
   default is a fabrication still holds. When the model cannot tell, it asks one question rather
   than guess.

   This is the same piece of work as sorting a request in the loop (§4): one reader, two doors —
   the hub box and email in. It writes through the same `PUT /v1/guides/:id` everything else uses.
   It reverses "the hub has no editor and will not get one" (docs/DESIGN_BRIEF.md), which assumed
   every guide starts where an agent already did the work; in the loop, work starts with a person
   asking. That brief and AGENTS.md are updated when it is built.
5. **Later:** a hosted runner so Ready work is picked up without a person opening a session —
   for development, a one-time-connected sandbox or a teammate's machine.

## 7. Open

- When, if ever, a reply to the customer may send without a person's tap (decided for now: never).
- Whether a long agent run can live in the Worker (time limits suggest Workflows or a Durable
  Object), if Passalong ever runs a worker itself.
- What one support request costs in model calls, if it does — and one guide filed from the hub box.
- The positioning line to test: "Every customer request closes — from inbox to fix to reply —
  whether a person or an agent did the work."
