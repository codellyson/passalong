# Conversation: asking, replying, attachments

**Status:** Proposed 2026-10-01, and built locally end to end. Everything in §10 and §6 is in, plus the
items in §13. Not deployed; production needs migrations 0032 to 0035 first.

## 1. Why

A person hands work to an agent and then cannot talk to it. Today the only things an agent can say are
`progress` (a status), `pass` (give it back) and `hand_in` (done). The only way it asks a question is
a progress note that starts `BLOCKED:`, which the hub recognises by a regular expression, and the only
way a person answers is to go to the terminal where the agent was running.

Steps 1 and 2 made the record readable as a conversation: `task_event` holds what each side did and
`HubThread` renders it, with the agent's hand-in carrying a one-line `note`. The thread is still
one-directional. This step lets it go both ways:

1. An agent can **ask** a question and wait without giving up the work.
2. A person can **reply** in the hub, with an image if it helps, and the agent receives it.
3. A person can **attach a file** to a reply, and later to the task itself.

The picture to keep in mind is a chat with a colleague, not a comment section: one live exchange
between the person who asked for the work and the agent doing it, attached to that piece of work.

## 2. The decision this reopens

`docs/PRD.md` says "comments/threads" are out of scope, and AGENTS.md caps a verdict at 280 characters
so that it stays a verdict and does not become the thread the PRD rules out. This proposal puts a
thread back, so it has to be said why that is not the same thing.

What the PRD ruled out is a place where anyone discusses a guide. That is a second product: it needs
notifications, mentions, edit and delete, moderation, and it competes with the team's chat. What this
proposes is narrower on every axis:

- **Scoped to a held guide.** A message can only be written while somebody holds the guide (a claim
  exists), and it is addressed to that holder or from them. A guide nobody holds has no composer. When
  the claim ends the thread stays readable and stops accepting messages.
- **Two parties.** The author (and anyone the guide is assigned to) on one side, the holder on the
  other. Not "anyone in the team".
- **Short.** A message is plain text, capped, no markdown, no edit, no delete, no reactions.
- **It is the record of the work**, not commentary on it. The thread is already the history of what
  happened to the guide; this lets the person's side of that history be written by the person.

Amend the PRD sentence to say so when this ships: "comments/threads on a guide in general remain out of
scope; the exchange between whoever asked for work and whoever holds it is part of the work".

## 3. What exists and what this adds

Already built: `task_event` (migration 0032), `claims.thread()`, `GET /v1/guides/:id/thread`,
`HubThread`, the required `note` on `hand_in`, screenshots (`shot`, `POST /v1/shots`,
`create_upload`, claimed by the document that names them).

Added by this step:

| Piece | What |
|---|---|
| Event kinds | `asked` (agent), `replied` (person). Same table, no new one for messages. |
| `ask` | The agent's question. Keeps the claim, extends the lease, says "stop and wait". |
| `reply` | The person's message. Written while the guide is held. |
| Delivery | A reply reaches the agent on its next `progress` or `take`. |
| Cursor | `claim.replied_through` (migration 0033): the last reply the agent has been given. |
| Attachments | Phase A: images, through the existing shots. Phase B: other files. |
| Hub | A composer under the thread, and "Asking you" replacing the `BLOCKED:` group. |

## 4. Asking

### 4.1 The call

`ask(id, question, agent, fence?)` on both servers. `question` is plain text, one to a few sentences,
capped at 1000 characters (a note is 280; a question that needs context legitimately is longer).

Server side, in `claims.ts`, one function `ask()`:

- Requires a live claim for this agent (same predicate as `renew`, including the fence).
- Sets `lease_until` to `at + ASK_LEASE_MS` and `updated`, and sets `note` to the question's first line,
  so every existing surface that shows `claim.note` keeps working.
- Writes an `asked` event with the question as `body`.
- Notifies the author (`notification` kind `asked`, coalesced like the others, mail on the first).
- Answers with `steps()` for a new event `asked`: **stop, and tell the user you are waiting for an
  answer; call `take` with this id to resume.** It is the second `say`-only state after `nothing` and
  `not_held`.

### 4.2 Waiting is derived, not stored

There is no `waiting` claim state, for the reason migration 0021 gives for `stalled`: it is true or false
from rows that already exist, so nothing has to run to move a card. A held guide is **waiting on you**
when its latest `asked` event has no later `replied` event. `list()` and `working()` compute it with one
`NOT EXISTS`. This replaces the `BLOCKED:` regular expression in `TaskReview.vue` and `Taken.vue`; a
note that still starts `BLOCKED:` keeps working (old agents will send them for a long time) and is
treated as an ask with no event.

### 4.3 The lease

A person can take hours to answer, and an agent that has legitimately stopped is not "went quiet". So
`ask` extends the lease to `ASK_LEASE_MS` (24 hours). It is a lease, not a lock release: the claim stays,
nobody else can take the work, and after 24 hours without an answer it reads as stalled like anything
else, which is the correct thing to tell the author about a question nobody answered.

### 4.4 Why a new tool and not a flag on `progress`

`progress` says "I am still working, carry on" and its `next` says call `progress` again. `ask` says "stop".
Giving one tool two opposite endings is the shape AGENTS.md warns about for the old tool list. One tool
per job: `ask` is its own, and `pass` stays the answer to "I cannot continue", which releases the work.
That makes the agent's verbs `take`, `progress`, `ask`, `hand_in`, `pass`.

## 5. Replying

### 5.1 The call

`POST /v1/guides/:id/reply { body }`, session or token auth, like the verdict.

- **Who may reply:** the author, anyone the guide is assigned to (`for_me`), and the holder's own account
  (a person replying to their own agent is the common case). Not any team member. The route reuses
  `readableGuide` and then narrows.
- **Only while held.** No live claim answers 409: "nobody holds this, so there is no one to tell". This is
  the rule that keeps it from being a comment box.
- Plain text, trimmed, capped at 1000 characters. Stored as a `replied` event with `account_id` the
  replier and `agent_id` empty.
- Notifies the holder's account when it is not the replier (`replied`). A person replying to their own
  agent is told nothing, because nobody needs a notification of their own act.
- Does **not** extend the lease. Only the agent speaking does.

`replied` is a thread line, never a status, for the reason acks and verdicts are rows rather than guide
fields: it is a fact about the work, written by the reader.

### 5.2 A reply need not follow a question

The composer is available whenever the guide is held, not only after an `ask`. "Also add a dark-mode
test" is a perfectly good message to an agent mid-task. It is delivered the same way. This is what makes
it feel like chat; if replies were only answers it would be a form.

### 5.3 Delivery to the agent

There is no push channel to a worktree and this proposal does not build one. The agent hears at its next
call:

- `progress` and `take` answers gain `replies: [{ at, by, body }]`: replies written since
  `claim.replied_through`, oldest first, and the cursor advances in the same request.
- `take` resuming an existing hold additionally re-sends the replies since the last `asked` event even if
  the cursor has passed them. That covers a response lost on the wire and a session restarted after the
  agent stopped, and it costs nothing, because a resume is rare and replies are short.
- `steps()` puts a line in `say` when `replies` is non-empty: "The person replied. Read it, and carry on
  from what they said."

Two honest limits, to be stated in the hub and not hidden:

1. If the agent has stopped (it was told to after `ask`), **nothing wakes it**. The hub shows, beside a
   delivered reply, the command that resumes it in its worktree (`passalong work` in the shown path),
   exactly as the stuck state does today. The SessionStart hook (`passalong now`) already prints what a
   worktree holds; it gains "a reply is waiting".
2. The Stop hook currently refuses to end a session that holds a claim without `hand_in` or `pass`. An
   agent that has asked must be allowed to stop, so the hook has to treat a held claim whose latest event
   is an unanswered `asked` as stoppable. This is a change in `src/hooks.js` and has to ship with `ask`,
   or the first agent that follows the instruction to stop is stopped from stopping.

## 6. Attachments

The first request was attachments, so this is its own section, but it is deliberately phased because the
two halves are different sizes.

### Phase A: images on a reply (ships with replies)

Screenshots already exist end to end: `POST /v1/shots` (5 MB, PNG/JPEG/WebP/GIF), served from
`/v1/shots/:id` with `default-src 'none'; sandbox` and `nosniff`, claimed by the document that names the
URL (`shotIds()`, `claimEvidenceShots`), swept hourly if never claimed, with `account_id` in the claim's
`WHERE` so nobody can claim somebody else's image by naming its id.

A reply's body may contain `/v1/shots/<id>` lines. The route runs `claimEvidenceShots` over it, which
needs a small generalisation: it currently claims into a guide; it must accept an event. Simplest is to
keep `shot.guide_id` as the guide the event belongs to, since a reply belongs to that guide's lifetime and
is deleted with it (`ON DELETE CASCADE` already reaches `task_event`; shots are removed by the existing
guide-deletion path). `HubThread` draws those lines as images through `evidenceParts()`, the renderer that
already refuses to fetch from any origin but this one. The composer gets an image button that uploads to
`/v1/shots` and inserts the line.

Nothing new is stored. This is the cheapest thing that answers "attach something to a reply".

### Phase B: other files (separate, after A)

PDFs, CSV, logs, a zip of the failing input. This needs a real attachment model, so it is its own change
and not folded into replies:

- `attachment` table: `id`, `account_id`, `guide_id`, `name`, `type`, `bytes`, `created`; same ownership
  and claim-by-document rule as `shot`, and the same hourly sweep. Do not widen `shot`: its name, its
  `SHOT_TYPES` allow-list and every place that assumes "a shot is an image" would stop being true.
- Stored in the existing R2 bucket under a different key prefix.
- **Never rendered inline.** Served with `content-disposition: attachment`, `x-content-type-options:
  nosniff`, `content-security-policy: default-src 'none'; sandbox`, and a generic
  `application/octet-stream` for anything outside an allow-list. A file written by a stranger must not
  be able to run on our origin. The `/g/**` CSP is untouched because attachments are linked, never
  embedded.
- Allow-list of types (PDF, plain text, CSV, JSON, zip) and a size cap (start at 10 MB). Refused by
  magic number where there is one, as `uploads.ts` does for images, because the `content-type` header is
  the sender's claim.
- Upload by `POST /v1/attachments` from the hub and by an upload link for an agent in a sandbox, reusing
  `create_upload`'s one-time-link design.
- Attachments on the task itself (at creation), not only on replies, is the second half of the original
  request and rides on this table.

Open question for phase B: whether an agent can *read* an attachment. A person's PDF is only useful to
an agent that can fetch it, so `get_guide` / `take` would list attachment URLs and the agent's own tools
fetch them. That is more reasonable than inlining bytes into a tool result, and needs no new tool.

## 7. Data

Migration `0033_conversation.sql`:

```sql
ALTER TABLE claim ADD COLUMN replied_through INTEGER NOT NULL DEFAULT 0;
```

`task_event.kind` gains `asked` and `replied`; it is a free `TEXT` column so there is nothing to alter.
`claims.EventKind` and `ThreadItem.kind` gain the two values; `messageOf()` gains their voices ("Asking:
…" on the agent side, the person's words verbatim on yours).

Phase B adds migration `0034_attachment.sql`.

Both are additive, as V2.md requires, and a client that has never heard of either keeps working: an old
CLI ignores `replies`, an old agent never calls `ask`.

## 8. Surfaces

The rule in AGENTS.md is that every answer a person can give exists in the hub, MCP and CLI.

- **Hub:** composer under `HubThread` when the guide is held and you may reply; the "Stuck on you" group
  becomes "Asking you" and is driven by §4.2; a delivered reply shows its resume command when the agent
  has stopped.
- **MCP:** `ask` on both servers (agent side). `reply` on both (person side, for someone driving their
  work from an assistant), plain text plus optional shot lines. The HTTP server owns no logic; each
  dispatches to the route, as before.
- **CLI:** `passalong reply <id> <text>` and `passalong ask` is not needed, the agent uses MCP. The
  stdio server and the CLI call the same `passalong.js` operations.

Tool count goes from four agent verbs to five, plus `reply` for people. That is two names more than
today and each is a distinct job; the alternative, flags on `progress`, was rejected in §4.4.

## 9. Safety

- Message bodies are plain text rendered with `white-space: pre-line`, never markdown and never HTML. The
  web view's CSP and the hub's nonce policy are untouched.
- A reply is readable only by people who can read the guide and is written only by the people in §5.1. A
  guide shared by link exposes none of it: `/g/:id/:key` renders the document, not the thread.
- Analytics stay categorical: `guide_asked`, `guide_replied`, with no ids, bodies or titles.
- Both caps are enforced on the server whatever the client sends. A flood is bounded by the existing
  `LIMIT 500` on `thread()` and should get a per-claim cap on events (start at 200) so one runaway agent
  cannot fill a thread.
- Phase B's file serving is the new attack surface and is why it is split out: the headers in §6 are the
  design, not an afterthought.

## 10. Build order

1. **Ask and reply, text only.** Migration 0033, `ask()`, the reply route, delivery on `progress`/`take`,
   the derived waiting state, `steps()` events, the Stop-hook change, the composer, thread voices. Tests
   against real SQLite beside `claims.test.mjs`: a reply is delivered once, a lost response is re-sent on
   resume, a stale fence is refused, a reply to an unheld guide is refused, `waiting` clears on reply.
2. **Notifications** for `asked` and `replied`, and the mail copy.
3. **Images on a reply** (§6 Phase A).
4. **CLI `reply`, MCP `reply`**, and the SessionStart line.
5. **Attachments** (§6 Phase B) as its own change.

Steps 1 and 2 are the point of this work. 3 to 5 each stand alone.

## 11. Open questions

1. **Who may reply.** Proposed: the author, the assignee, and the holder's account. Narrower would be
   author-only; wider is anyone who can read the guide, which is the comment box §2 argues against.
2. **`ASK_LEASE_MS`.** Proposed 24 hours. A weekend question would read as stalled by Monday, which seems
   right, but it is a judgement.
3. **Two new tools or one.** `ask` for agents is clear. `reply` over MCP is optional: it exists so the
   rule "every answer exists in all three places" holds, and could wait for demand.
4. **Phase B now or later.** The original request was attachments. Phase A answers "a screenshot with my
   answer" and nothing else. If the real need is "attach a PDF or CSV to the task", Phase B is the
   priority and should not wait behind the rest.
5. **Can an agent ask with no one assigned and no team** (a solo author)? Yes: the author is always a
   party. The question is only whether the hub should ring (mail) a solo user about their own agent, and
   the proposal says no, only show it.

## 12. As built: phase B

Differences from §6, so the section above is not read as a description of what shipped.

- **Private.** `GET /v1/attachments/:id` needs a credential, and answers 404 to anybody who may not
  read the guide it is on (or did not upload it, while unclaimed). A screenshot is public by id because
  it is evidence in a document that travels by link; a file is somebody's PDF or CSV. The hub therefore
  downloads with `fetch` and the bearer token, not a link, since a link carries no token.
- **Allow-list by bytes.** PDF and zip by signature, text by being valid UTF-8 with no NUL, filed as
  CSV, JSON, Markdown or plain text by what the sender said or the name's extension. HTML and SVG are
  kept as plain text, never as what they look like. 10 MB, and at most 20 unclaimed per account.
- **Where it can go.** On a reply, three attachments of any mix with pictures. A file named in a
  guide's markdown, or in evidence, is claimed by that guide too, so an agent that publishes one is
  covered, but nothing yet lets an agent *upload* a file: `create_upload` is still pictures only. A
  person cannot attach to a task before anyone holds it, because the hub has no editor by design and
  the composer exists only while somebody holds the guide.
- **The agent reads it** with its own token (`curl`, noted under the reply). No tool was added.

## 13. As built: the four that were left

- **A note on a task nobody holds.** `reply` on an unheld guide, from its author or whoever it is
  assigned to, is stored as `noted` and not `replied`. It is the task's own, so every taker is handed
  all of a task's notes at `take` (first take or resume), while a reply to the previous agent is not
  handed to the next one. Refused when the guide is done. This is how a person attaches a file to a
  task before it is taken: the composer appears on Open rows as "Add a note or a file for whoever
  takes this". The "only while held" rule in §2 becomes "while held, or as a note on the task".
- **An agent can upload a file.** `create_upload` takes `kind: "file"` (migration 0035 puts `kind` on
  `upload`); the link then accepts only what a file is, checked by the bytes, and a refused upload
  leaves the link usable. The stdio server has `attach_file` for a path. Both return the markdown line,
  which belongs in a guide body or a bug report (claimed on publish). It is **not** accepted as
  evidence in a check: a check is run or shown, and a file is neither.
- **Reply from the CLI and MCP.** `passalong reply <id> <text> [--file PATH ...]`, and a `reply` tool
  on both servers. Over HTTP it takes the markdown lines `create_upload` returns, since a hosted
  assistant has no path. `passalong attach` now takes any file.
- **The session-start line.** `/v1/working` carries `replies`, the count of what a person wrote that
  the agent has not been told, and the hook says so and names `take` as the way to read it.
