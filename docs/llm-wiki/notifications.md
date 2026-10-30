# Notifications

**Rows first, delivery second.** Every loop-closing moment is a `notification` row addressed to whoever
should hear it; mail, team channels, the live stream and push are channels over the row, so the feed
works with nothing else configured. `notify()` never throws — a notification is never worth failing
the action that caused it — and drops anything addressed to whoever caused it.

- **Coalesced.** One row per (recipient, kind, work, actor): a repeat bumps `at` and `times`.
- **One sentence.** `line()` in `notify.ts` is the only place wording lives; CLI, MCP, hub, toasts and
  push all print it.
- **Actorless events.** `stalled` (a lease ran out), `requeued` (a quiet hold went back in the queue), `stuck` (it went back a second time; mailed),
  `untaken` (sent and nobody took it in three days; mailed to the author and team owners),
  `customer_waiting` (a customer four hours unanswered with nobody on it; pushed and mailed to the
  author and team owners, once per wait), `shelved`
  (old rows only: work nobody took used to go back to Draft),
  `still_draft` (work untouched in Draft for a day, once per quiet day, feed only),
  `blocked` (an agent is stuck on you), and your own agent's `task_finished` are sent without an actor,
  so they reach you even when "you" caused them.
- **Admin alerts.** Some kinds are for whoever runs Passalong, not the people using it: `alertAdmins()`
  in `alerts.ts` sends them to every super admin's feed and mails the first one. `ADMIN_ALERTS` lists
  them (today `signed_up` and `billed_twice`); adding one is a kind, its sentence, an entry there and a call.

## Email in

Mail can also come **in** and become work. An account gets one key from Settings (`POST /v1/inbound`,
migration 0051), written two ways (2026-10-29, docs/WORK.md): **`key+new@`** for anything, and
**`key+support@`** for customers. A third part names the team, `key+new+khaime@`, as `?team=` does on
a webhook URL. Mail to the bare `key@` or any other `+tag` is dropped, and so are the old per-kind
`key+task@`, `key+bug@` and `key+transfer@`. `key+new@` goes wherever work comes from: a tool's
notification settings, a BCC in the account's own backend, a Gmail forward.

Email Routing sends `INBOUND_DOMAIN` to the Worker, and `receiveEmail()` in `index.ts` (helpers
in `inbound.ts`, hook in `apps/web/server/plugins/inbound.ts`) applies three rules, because the
email is a stranger's text that an agent will read:
- **The address picks the account and the team, nothing else.** A sender's first message makes
  nothing: it becomes a pending `inbound_sender` row and an `email_sender` notification asking you to
  Allow or Block it. The account's own verified email is allowed from the start.
- **An allowed sender's mail to `key+new@` is filed exactly as the hub's box files writing**
  (`receiveAnything()` through `POST /v1/compose`), written by `email`: the reader names it and picks
  the group, and up to three pictures are read and kept as screenshots. Without a reader it files by
  the fixed rule. What was sent is quoted into the body by code, in a fence, labelled as evidence and
  not as instructions. It is **Ready** at once (2026-10-17: alerts held in Draft reached nobody). It
  is also the iPhone's way in — Share, Mail — since an iPhone cannot share to a website; Android
  shares to the installed app directly (`share_target`, see security-model).
- **The same thing again** (same sender, same subject with its numbers taken out, work not
  archived) adds to `inbound_guide.times`, and leaves at most one note an hour on the work's thread.

A webhook URL can also carry `?team=<slug>` (and `&to=`): what arrives is filed in that team, which
is what puts it on the team's board; without it, it is the account's own. The hub's copied URLs carry
the team in view. A team the publish refuses (a typo, a team since left) still files the work as the
account's own, with a line saying why, so an alert is never lost.

The repo is chosen where it is known. A webhook URL can carry `?repo=owner/repo` (one Sentry or
PostHog project per repo), and that becomes the work's `target`. Otherwise whoever marks it Ready
picks the repo on its page (`PATCH /v1/guides/:id/status` with `target`, which the context route
offers from repos the account's work and agents already use). An agent's no-id `take` only offers
work for its own repo, so work Ready with no repo is taken by id.

**Webhooks use the same key.** `POST /v1/in/<key>` (public by path, no kind in it; the key is the
credential, and Sentry's HMAC is not checked yet) turns a webhook into work through the same
`intake()` as email, so the same rules hold: Ready at once, a quoted body, merged repeats.
`readHook()` in `inbound.ts` reads the sender from the request: **Sentry** by its
`Sentry-Hook-Resource` header (issue created or unresolved, alert triggered, error created,
metric alert warning or critical; everything else answers 200 and makes nothing), **PostHog** by
its default `{event, person}` body (an error tracking alert or an `$exception`), and anything
else as `{title, text, url, id}`. Repeats merge on the sender's own id when it has one (a Sentry
issue, a PostHog issue or fingerprint), else on the title. Work from a webhook notifies as `hooked`.
Settings shows it on its own page, **Integrations**: one Anything address, Customer support, and one
webhook URL.

**Customer support is `key+support@` (2026-10-28, docs/LOOP.md §4).** Anyone may
write to it — it is the one exception to "a sender's first email asks" — so it has its own guards:
blocked senders stay blocked, five new requests per sender and two hundred per account a day, and
mail from a machine (`Auto-Submitted`, `Precedence`, a list, `no-reply@`) makes nothing. Up to
five files on a customer's message are kept, claimed by the request (`keepCustomerFiles()`): pictures
as screenshots drawn in the conversation, other files as attachments typed by their bytes; a support
message may be up to 15 MB where other mail in is capped at 1 MB. A message
becomes work (`supportBody()`), Ready, whose document names the customer only by their display
name; their address, name and tracking number (`R-XXXXXX`, `ref`) are columns (migration 0057), so a
share link or an agent never carries them. They are answered at once with the tracking number,
from "<team> support", Reply-To the same address, as `Re: <their subject> [R-…]` with their
Message-IDs in In-Reply-To/References (migration 0060), so every mail is one conversation in their
inbox. A reply from the same address carrying the number, or naming one of their kept Message-IDs,
joins that request (`customer` thread event, `customer_wrote` notification) and reopens it if it was
finished. A person answers on the request's page under **Support** (`/hub/support/:id`, `POST /v1/guides/:id/customer`; Support is a register of every request, waiting-on-us first, state derived by `supportState()` in needs.ts — see [hub.md](hub.md)),
recorded as `answered`; there is no CLI command or MCP tool for it on purpose, because nothing reaches
a customer before a person presses Send. A holding agent receives both kinds through `deliver()`.
**The reader** (`reader.ts`) sorts each request when `READER_PROVIDER`, `READER_KEY` and `READER_MODEL` are
set — Anthropic, OpenAI or Google through their own AI SDK packages, or any OpenAI-compatible provider
with `READER_URL`: a title, a summary, an optional tag (`bug`, `feature`,
`question` — description only) and the team group by name (`to: #group`), with its reason; it
writes no sections and chooses no kind. It looks at pictures too — up to three on the message or pasted in
the box — because a screenshot of an error is often the whole report. Its answer is used whole or not at all (`readVerdict()`), the
customer's words are quoted by code, its reason is a note on the thread, and when unsure it files for
the whole team and sends `reader_unsure` (pushed, mailed) with its question. The same reader backs the
hub's box, `/hub/new` (`POST /v1/compose`), for writing work in your own words;
there, when unsure, it files its best reading anyway and puts its question on the thread. Support has no webhook. Sending to customers needs the Workers Paid plan (see mail-send.ts). When
work made from a request (a bug sent on to development) reaches Done, the request wakes: a
`child_done` notification, and — when the team turned the reminder on (`team.tell_customer`, migration
0059, set by an owner on the Support page; off by default) — it says "tell the customer" and the
request's Support page names what finished since the customer was last answered.

Nothing bounces, since a bounce would confirm the address exists. Without `INBOUND_DOMAIN`, Settings
says Email in is not set up.

## Channels

| Channel | What goes | Notes |
| --- | --- | --- |
| **Feed** (Activity) | Everything | `GET /v1/notifications`, marked read by the reader. |
| **Email** | First occurrence of key events | Plain text written first, HTML from a fixed kit; `esc()` on anything typed. |
| **Team channel** | Sent to the team, a person or a group, and passed on (`ANNOUNCED`) | Webhook; Google Chat gets a built card, never an unfurl, since the share key is the authorisation. |
| **Live stream** | Every notification and every change to work you can see | SSE, polled every 3 s from a time cursor; toasts in the hub. Progress notes refresh quietly. |
| **Push** | Only what needs you (`PUSHED`): sent to you, your agent finished, reopened, went quiet, blocked or stuck, untaken, a customer wrote or is waiting, the reader is unsure, a child is done | Web Push, per device, encrypted end to end; a device can hide titles for its lock screen. |

## Why the stream polls

`events.ts` reads D1 from a cursor that is a **time, not a row id** — notifications coalesce by bumping
`at`, so an id cursor would miss repeats. Connections end after four minutes and resume from
`Last-Event-ID`. Durable Objects would push without polling; this needed no new infrastructure.

## Push needs keys

Without `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`, Settings says push is not set up.
`node scripts/vapid-keys.mjs` makes them. iOS delivers web push only to the home-screen app.

## Sources
- `apps/api/src/notify.ts` (`notify`, `line`, `PUSHED`, `onPush`), `alerts.ts`, `inbound.ts`, `events.ts`, `webpush.ts`, `email.ts`, `mail-html.ts`
- Migrations 0003 (notifications), 0033 (event indexes), 0034 (push), 0051 (inbound), 0057 (customer), 0061 (one thing)
- [docs/LOOP.md](../LOOP.md) §4 (the support experience)
- `apps/web/app/composables/useLive.ts`, `components/hub/Toasts.vue`, `PushSettings.vue`, `public/sw.js`
- [AGENTS.md](../../AGENTS.md): "Notifications", "Mail is written twice…", "Google Chat gets a card…", "The hub is live…", "Push reaches a device only for what needs you…"
