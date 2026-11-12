# Notifications

**Rows first, delivery second.** Every loop-closing moment is a `notification` row addressed to whoever
should hear it; mail, team channels, the live stream and push are channels over the row, so the feed
works with nothing else configured. `notify()` never throws — a notification is never worth failing
the action that caused it — and drops anything addressed to whoever caused it.

- **Coalesced.** One row per (recipient, kind, work, actor): a repeat bumps `at` and `times`.
- **One sentence.** `line()` in `notify.ts` is the only place wording lives; CLI, MCP, hub, toasts and
  push all print it.
- **Actorless events.** `stalled` (a lease ran out), `requeued` (a quiet hold went back in the queue), `stuck` (it went back a second time; mailed),
  `untaken` (sent and nobody took it in three days; the author and team owners hear each piece in the
  feed and by push, and get one morning mail listing every piece not yet mailed — `mailUntaken`),
  `near_limit` and `at_limit` (the account's Ready work just
  reached 80% of the free limit, or the limit; pushed and mailed every time it is reached, and at the
  limit to the owners of its teams too, with the account as actor), `plan_ending` (a Solo or Team
  plan that won't renew ends in a week, or tomorrow; pushed and mailed to the person or the team's
  owners), `shelved`
  (old rows only: work nobody took used to go back to Draft),
  `still_draft` (work untouched in Draft for a day, once per quiet day, feed only),
  `blocked` (an agent is stuck on you), and your own agent's `task_finished` are sent without an actor,
  so they reach you even when "you" caused them.
- **Admin alerts.** Some kinds are for whoever runs Passalong, not the people using it: `alertAdmins()`
  in `alerts.ts` sends them to every super admin's feed and mails the first one. `ADMIN_ALERTS` lists
  them (today `signed_up`, `billed_twice`, and `half_set`: a group of settings half set, from the hourly sweep, names only); adding one is a kind, its sentence, an entry there and a call.

## Email in

Mail can also come **in** and become work. An account gets one key from Settings (`POST /v1/inbound`,
migration 0051), one address (2026-10-29, docs/WORK.md): **`key+new@`** for anything. A third part names the team, `key+new+khaime@`, as `?team=` does on
a webhook URL. Mail to the bare `key@` or any other `+tag` is dropped. `key+new@` goes wherever work comes from: a tool's
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
  archived) adds to `inbound_work.times`, and leaves at most one note an hour on the work's thread.

A webhook URL can also carry `?team=<slug>` (and `&to=`): what arrives is filed in that team, which
is what puts it on the team's board; without it, it is the account's own. The hub's copied URLs carry
the team in view. A team the publish refuses (a typo, a team since left) still files the work as the
account's own, with a line saying why, so an alert is never lost.

The repo is chosen where it is known. A webhook URL can carry `?repo=owner/repo` (one Sentry or
PostHog project per repo), and that becomes the work's `target`. Otherwise whoever marks it Ready
picks the repo on its page (`PATCH /v1/work/:id/status` with `target`, which the context route
offers from repos the account's work and agents already use). An agent's no-id `take` only offers
work for its own repo, so work Ready with no repo is taken by id.

**Webhooks use the same key.** `POST /v1/in/<key>` (public by path, no kind in it; the key is the
credential, and Sentry's HMAC is not checked yet) turns a webhook into work through the same
`intake()` as email, so the same rules hold: Ready at once, a quoted body, merged repeats.
`readHook()` in `inbound.ts` reads the sender from the request: **Sentry** by its
`Sentry-Hook-Resource` header (issue created or unresolved, alert triggered, error created,
metric alert warning or critical; everything else answers 200 and makes nothing), **PostHog** by
its default `{event, person}` body (an error tracking alert or an `$exception`), **GitHub
Actions** by its `X-GitHub-Event: workflow_run` header (a run that failed, timed out or could not
start on the default branch, from the repo itself — never a pull request's branch or a fork; the
repo comes from the payload, so its URL needs no `?repo=`), and anything else as
`{title, text, url, id}`. Repeats merge on the sender's own id when it has one (a Sentry issue, a
PostHog issue or fingerprint, a GitHub workflow and branch), else on the title. URLs in the quoted
body are links on the work page (`linked()` in work-html.ts), though the fence keeps them text in
the markdown. Work from a webhook notifies as `hooked`.
Settings shows it on its own page, **Integrations**: one Anything address and one
webhook URL.

**The reader** (`reader.ts`) sorts what comes in when `READER_PROVIDER`, `READER_KEY` and `READER_MODEL` are
set — Anthropic, OpenAI or Google through their own AI SDK packages, or any OpenAI-compatible provider
with `READER_URL`: a title, a summary, an optional tag (`bug`, `feature`,
`question` — description only), the team group by name (`to: #group`) with its reason, and — in
the box — one of the team's projects (its top-level projects) by id, judged by name and description,
or none; `?project=` wins over its choice and the work is linked through the project route; it
writes no sections and chooses no kind. It looks at pictures too — up to three on the message or pasted in
the box — because a screenshot of an error is often the whole report. Its answer is used whole or not at all (`checkReading()`), the
words sent are quoted by code, its reason is a note on the thread, and when unsure it files for
the whole team and sends `reader_unsure` (pushed, mailed) with its question. The same reader backs the
hub's box, `/hub/new` (`POST /v1/compose`), for writing work in your own words;
there, when unsure, it files its best reading anyway and puts its question on the thread. Deleting
any work removes its unread notification rows (`forgetWork()`); mail and push already sent stay
sent, and the delete answers `told` so the box's Undo can say so. Mail to any other `+tag`, the retired `key+support@` included, is dropped.

Nothing bounces, since a bounce would confirm the address exists. Without `INBOUND_DOMAIN`, Settings
says Email in is not set up.

## Channels

| Channel | What goes | Notes |
| --- | --- | --- |
| **Feed** (Activity) | Everything | `GET /v1/notifications`, marked read by the reader. |
| **Email** | First occurrence of key events | Plain text written first, HTML from a fixed kit; `esc()` on anything typed. |
| **Team channel** | Sent to the team, a person or a group, and passed on (`ANNOUNCED`) | Webhook; Google Chat gets a built card, never an unfurl, since the share key is the authorisation. |
| **Live stream** | Every notification and every change to work you can see | SSE, polled every 3 s from a time cursor; toasts in the hub. Progress notes refresh quietly. |
| **Product news** | What's new in Passalong, written and sent from /admin to every proven address that hasn't said no (`announcements.ts`) | Not a notification: one mail to everybody, sent in batches, each with its own stop link (page /news/off, and one-click `List-Unsubscribe` headers). Settings → Product news turns it on or off; work mail never depends on it. The owner's admin hub can write and send one too (a "campaign", `/v1/admin-hub/campaigns`): the same audience and mail, but its recipients are queued when it is sent (0087) and the once-a-minute cron mails 40 a tick, so nobody who signs up later gets it. |
| **Push** | Only what needs you (`PUSHED`): sent to you, your agent finished, reopened, went quiet, blocked or stuck, untaken, the reader is unsure, a child is done | Web Push, per device, encrypted end to end; a device can hide titles for its lock screen. |

## Why the stream polls

`events.ts` reads D1 from a cursor that is a **time, not a row id** — notifications coalesce by bumping
`at`, so an id cursor would miss repeats. Connections end after four minutes and resume from
`Last-Event-ID`. Durable Objects would push without polling; this needed no new infrastructure.

## Push needs keys

Without `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`, Settings says push is not set up.
`node scripts/vapid-keys.mjs` makes them. iOS delivers web push only to the home-screen app.

## Sources
- `apps/api/src/notify.ts` (`notify`, `line`, `PUSHED`, `onPush`), `alerts.ts`, `inbound.ts`, `events.ts`, `webpush.ts`, `email.ts`, `mail-html.ts`
- Migrations 0003 (notifications), 0033 (event indexes), 0034 (push), 0051 (inbound), 0061 (one thing), 0084 (no customer)
- [docs/LOOP.md](../LOOP.md) §4 (the support experience)
- `apps/web/app/composables/useLive.ts`, `components/hub/Toasts.vue`, `PushSettings.vue`, `public/sw.js`
- [AGENTS.md](../../AGENTS.md): "Notifications", "Mail is written twice…", "Google Chat gets a card…", "The hub is live…", "Push reaches a device only for what needs you…"
