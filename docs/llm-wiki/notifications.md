# Notifications

**Rows first, delivery second.** Every loop-closing moment is a `notification` row addressed to whoever
should hear it; mail, team channels, the live stream and push are channels over the row, so the feed
works with nothing else configured. `notify()` never throws — a notification is never worth failing
the action that caused it — and drops anything addressed to whoever caused it.

- **Coalesced.** One row per (recipient, kind, guide, actor): a repeat bumps `at` and `times`.
- **One sentence.** `line()` in `notify.ts` is the only place wording lives; CLI, MCP, hub, toasts and
  push all print it.
- **Actorless events.** `stalled` (a lease ran out), `shelved` (nobody opened it for a fortnight),
  `blocked` (an agent is stuck on you), and your own agent's `task_finished` are sent without an actor,
  so they reach you even when "you" caused them.

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
- `apps/api/src/notify.ts` (`notify`, `line`, `PUSHED`, `onPush`), `events.ts`, `webpush.ts`, `email.ts`, `mail-html.ts`
- Migrations 0003 (notifications), 0033 (event indexes), 0034 (push)
- `apps/web/app/composables/useLive.ts`, `components/hub/Toasts.vue`, `PushSettings.vue`, `public/sw.js`
- [AGENTS.md](../../AGENTS.md): "Notifications", "Mail is written twice…", "Google Chat gets a card…", "The hub is live…", "Push reaches a device only for what needs you…"
