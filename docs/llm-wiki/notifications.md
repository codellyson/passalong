# Notifications

**Rows first, delivery second.** Every loop-closing moment is a `notification` row addressed to whoever
should hear it; mail, team channels, the live stream and push are channels over the row, so the feed
works with nothing else configured. `notify()` never throws — a notification is never worth failing
the action that caused it — and drops anything addressed to whoever caused it.

- **Coalesced.** One row per (recipient, kind, guide, actor): a repeat bumps `at` and `times`.
- **One sentence.** `line()` in `notify.ts` is the only place wording lives; CLI, MCP, hub, toasts and
  push all print it.
- **Actorless events.** `stalled` (a lease ran out), `shelved` (nobody took it for a fortnight, so it went back to Draft),
  `still_draft` (a task untouched in Draft for a day, once per quiet day, feed only),
  `blocked` (an agent is stuck on you), and your own agent's `task_finished` are sent without an actor,
  so they reach you even when "you" caused them.
- **Admin alerts.** Some kinds are for whoever runs Passalong, not the people using it: `alertAdmins()`
  in `alerts.ts` sends them to every super admin's feed and mails the first one. `ADMIN_ALERTS` lists
  them (today `signed_up`); adding one is a kind, its sentence, an entry there and a call.

## Email in

Mail can also come **in** and become a guide of any kind. An account gets one key from Settings
(`POST /v1/inbound`, migration 0051), shown as three addresses: `key+task@`, `key+bug@`,
`key+transfer@`. The kind is in the address because a guide's kind is always stated, never
guessed: whoever picks the address states it, and mail to the bare `key@` is dropped. A third part
names the team, `key+bug+khaime@`, as `?team=` does on a webhook URL. The
addresses go wherever work comes from: a tool's notification settings, a BCC in the account's
own backend, a Gmail forward.

Email Routing sends `INBOUND_DOMAIN` to the Worker, and `receiveEmail()` in `index.ts` (helpers
in `inbound.ts`, hook in `apps/web/server/plugins/inbound.ts`) applies three rules, because the
email is a stranger's text that an agent will read:
- **The address picks the account and the kind, nothing else.** A sender's first message makes no
  guide: it becomes a pending `inbound_sender` row and an `email_sender` notification asking you to
  Allow or Block it. The account's own verified email is allowed from the start.
- **An allowed sender's email is published through `PUT /v1/guides/:id`** as the account, written
  by `email`, in its kind's sections. The email sits in a fence, labelled as evidence and not as
  instructions. Every kind is **Ready** at once (2026-10-17; it was a Draft until a person marked
  it, and alerts sat there unseen), so whoever it is for can pick it up. You get an `emailed` notification.
- **A task or bug that comes again** (same kind, same sender, same subject with its numbers taken
  out, guide not archived) adds to `inbound_guide.times`, and leaves at most one note an hour on
  the guide's thread. A transfer never merges.

A webhook URL can also carry `?team=<slug>` (and `&to=`): what arrives is filed in that team, which
is what puts it on the team's board; without it a guide sent in is the account's own. The hub's copied
URLs carry the team in view. A team the publish refuses (a typo, a team since left) still files the
guide as the account's own, with a line saying why, so an alert is never lost.

A task's repo is chosen where it is known. A webhook URL can carry `?repo=owner/repo` (one Sentry or
PostHog project per repo), and that becomes the task's `target_context`. Otherwise whoever marks the
task Ready picks the repo on its page (`PATCH /v1/guides/:id/status` with `target`, which the context
route offers from repos the account's tasks and agents already use). An agent's no-id `take` only
offers tasks for its own repo, so a task Ready with no repo is taken by id. Migration 0052 dropped
the one-repo-per-account `inbound.target` this replaced.

**Webhooks use the same key.** `POST /v1/in/<key>/<kind>` (public by path; the key is the
credential, and Sentry's HMAC is not checked yet) turns a webhook into a guide through the same
`intake()` as email, so the same rules hold: Ready at once, a quoted body, merged repeats.
`readHook()` in `inbound.ts` reads the sender from the request: **Sentry** by its
`Sentry-Hook-Resource` header (issue created or unresolved, alert triggered, error created,
metric alert warning or critical; everything else answers 200 and makes nothing), **PostHog** by
its default `{event, person}` body (an error tracking alert or an `$exception`), and anything
else as `{title, text, url, id}`. Repeats merge on the sender's own id when it has one (a Sentry
issue, a PostHog issue or fingerprint), else on the title. A webhook guide notifies as `hooked`.
Settings shows it on its own page, **Integrations**, one source's addresses and steps at a time.

Nothing bounces, since a bounce would confirm the address exists. Without `INBOUND_DOMAIN`, Settings
says Email in is not set up.

## Channels

| Channel | What goes | Notes |
| --- | --- | --- |
| **Feed** (Activity) | Everything | `GET /v1/notifications`, marked read by the reader. |
| **Email** | First occurrence of key events | Plain text written first, HTML from a fixed kit; `esc()` on anything typed. |
| **Team channel** | Shared, handoff, taken, passed, works, didn't work | Webhook; Google Chat gets a built card, never an unfurl, since the share key is the authorisation. |
| **Live stream** | Every notification and every change to a guide you can see | SSE, polled every 3 s from a time cursor; toasts in the hub. Progress notes refresh quietly. |
| **Push** | Only what needs you: sent to you, taken by someone, handed in, works, didn't work, sent back, went quiet, stuck on you | Web Push, per device, encrypted end to end; a device can hide titles for its lock screen. |

## Why the stream polls

`events.ts` reads D1 from a cursor that is a **time, not a row id** — notifications coalesce by bumping
`at`, so an id cursor would miss repeats. Connections end after four minutes and resume from
`Last-Event-ID`. Durable Objects would push without polling; this needed no new infrastructure.

## Push needs keys

Without `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`, Settings says push is not set up.
`node scripts/vapid-keys.mjs` makes them. iOS delivers web push only to the home-screen app.

## Sources
- `apps/api/src/notify.ts` (`notify`, `line`, `PUSHED`, `onPush`), `alerts.ts`, `inbound.ts`, `events.ts`, `webpush.ts`, `email.ts`, `mail-html.ts`
- Migrations 0003 (notifications), 0033 (event indexes), 0034 (push), 0051 (inbound)
- `apps/web/app/composables/useLive.ts`, `components/hub/Toasts.vue`, `PushSettings.vue`, `public/sw.js`
- [AGENTS.md](../../AGENTS.md): "Notifications", "Mail is written twice…", "Google Chat gets a card…", "The hub is live…", "Push reaches a device only for what needs you…"
