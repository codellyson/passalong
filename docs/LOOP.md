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
2. **The customer as a party on a guide.** Email in today accepts only senders the account has
   allowed, and nothing goes back to whoever wrote in. The loop needs who asked to be recorded and a
   reply to reach them by email.
3. **A parent closes when its child does.** `parent:` links exist; nothing yet wakes a parent when
   its child is Done.
4. **Filing work from the hub, without an agent of your own.** Today a guide is made by an agent
   through MCP or the CLI, or by email in. A support person, a tester or a product manager has
   neither. The hub gets one box: the person writes or pastes whatever they have — a sentence, a
   customer's message, a screenshot — and a small model on the server (Claude Haiku, or another
   small model) reads it and derives the purpose: which kind it is, the summary, and the sections
   that kind needs (Acceptance for a task, Reproduce and Verification for a bug). It is not an
   editor and the person writes no structure.

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
