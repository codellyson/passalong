# Hub

The signed-in web app at `/hub`, and one of only three pages allowed to run script (with `/join` and
`/reset`). It covers everything a browser-only person needs — there is no editor by design; guides are
created by `share()`.

## Work

One page for all work, in four tabs by what it needs from you:

- **Needs you** — one list on the left of everything waiting on you, grouped by why: *Waiting for your
  review*, *Handed in*, *Sent to you*, *Stuck on you*, *Went quiet*. The picked item is on the right,
  asking its one question: a task's line-by-line review against Acceptance; a handed-in guide's
  evidence with Close it / Send back; take-or-pass, then how it went.
- **Taken** — who has what, across every kind.
- **Open** — what nobody is on: ready, blocked and draft tasks, handoffs still out.
- **Done** — folded, because it is most of what exists and none of what needs doing.

The board's buckets are defined in SQL, not the client; the hub reloads after a change rather than
moving rows itself, so the two cannot drift.

## The guide page — `/hub/g/:id`

- **The document** is the share page at `?embed=1` in a sandboxed same-origin frame with no scripts. The
  hub never renders a stranger's markdown as its own HTML (see [security-model.md](security-model.md)).
- **Progress** leads the sidebar: what happened, in order — sent, opened, taken and where, what they
  said, what they handed in and showed, follow-ups — ending on a coral *Now* line. Built from
  `GET /v1/guides/:id/context`, which records no pull.
- **Who has it** and **Tied to** (what it follows, follow-ups, report, blockers) follow.

## Live

The hub keeps itself current while open (`useLive`, `GET /v1/events`): an event refreshes what it
touches, and anything that needs you arrives as a toast. See [notifications.md](notifications.md).

## Settings

Profile, Notifications (push per device), plan, teams, connected apps, API tokens.

## Sources
- `apps/web/app/pages/hub/index.vue`, `pages/hub/g/[id].vue`, `pages/hub/settings.vue`
- `apps/web/app/components/hub/NeedsYou.vue`, `app/utils/progress.ts`, `app/composables/useHub.ts`, `useLive.ts`
- [AGENTS.md](../../AGENTS.md): "The board", "The hub shows a guide by framing it…", "The hub is live…"
