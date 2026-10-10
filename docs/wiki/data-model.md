# Data model

One D1 database, `passalong`. Schema is `apps/api/migrations/`, applied in order; migrations are
append-only, so read them for history and this page for the current shape.

Every timestamp is an ISO-8601 string, not an epoch. Every "absent" value is `''`, not `NULL` —
the columns are `NOT NULL DEFAULT ''`, which keeps the queries free of null handling.

## account

`id`, `token_hash`, `created`, `handle`, `name`, `email`, `password_hash`

An account can exist with no email and no password: `POST /v1/accounts` mints an anonymous one for
`passalong login` and for invite links. `password_hash` is empty until someone claims it, which is
what the hub's "Add a way to sign in" card is for.

`handle` is how teammates address you — `--to team/@handle` has nothing to aim at without one, so
an account without a handle is prompted for one.

## guide

`id`, `account_id`, `share_key`, `title`, `status`, `source_context`, `tags`, `stack`, `markdown`,
`created`, `updated`, `pulls`, `team_id`, `to_account_id`, `kind`, `report_id`, `area`, `severity`

The markdown is the guide; the columns beside it are a denormalised index of its frontmatter, kept
for querying. When they disagree, the markdown is the truth.

`share_key` is the secret. The `id` is an address — 8 characters from a no-lookalike alphabet,
short enough to read aloud — and is not secret on its own. A share link is `/g/<id>/<key>`, so
knowing an id gets you nothing.

`kind` is `bug`, `task` or empty, and empty means `transfer` — every guide written before migration 0007
is one, and defaulting the other way would have turned the whole table into bug reports. The last
three are a bug's own: which report it was filed under, which product surface it is on, and how
badly it is broken (`s1` blocker to `s4` cosmetic). All four are denormalised from frontmatter like
everything else here.

`status` is `draft | published`. `consumed` and `promoted` are legacy — still accepted, because
the value lives in markdown people already published, but nothing sets them. `to_account_id` set means it was handed to
one person; `team_id` means it went to a team.

## report

`id`, `account_id`, `title`, `environment`, `team_id`, `to_account_id`, `created`, `updated`

A set of bugs filed together, and deliberately little else — everything a reader acts on lives on
the issues, because an issue is a guide and the product already knows what to do with one. It
exists for two reasons a tag could not cover: a set handed over together should arrive together,
and "6 issues across 3 areas" should survive one of them being fixed.

Product area is **not** here. It is a column on `guide`, so the grouping inside a report is derived
from its issues every time and an area with nothing left in it stops existing.

## folder, folder_document, folder_asset, folder_guide

Migrations 0046 and 0047 add project folders and nesting. `folder` has a creator, optional team id,
title, description, optional parent id and optional color. A child stays in its parent's private or
team space; the API prevents cycles. Private folders are visible only to their creator; team folders are visible to current
members. `folder_document` holds the current Markdown and version; `folder_document_revision`
holds each saved body. A write must name the version it read, so concurrent edits do not overwrite.
`folder_asset` points to private bytes in R2 under `folders/<folder>/<asset>`, independent of a
guide's screenshots and attachments. `folder_guide` only links an existing guide to project
context; removing a link or the guide leaves the folder's documents and files intact.

## shot

`id`, `account_id`, `guide_id`, `name`, `type`, `bytes`, `created`

A screenshot attached as evidence. The bytes are in R2 under `<id>.<ext>`; this row is the only
record of which extension that was, which is why a failed bucket delete must not delete the row —
nothing would ever look for the file again.

`guide_id` is written on every guide write, from the shot URLs in that guide's markdown, and is
empty until some document names it. Deleting a guide deletes its shots and their objects. An
upload nobody ever referenced is swept hourly once it is a day old — claiming happens minutes
after upload at worst, so a shorter window would race a tester who is still typing.

## upload

`hash`, `account_id`, `name`, `created`, `expires`, `used`

A one-time link that takes one screenshot without a credential, for an agent sandbox that holds the
image as a file. The token is a bearer credential, so only its SHA-256 is kept. `expires` is ten
minutes after `created`; `used` is empty until the link is spent, and spending is a single
`UPDATE … WHERE used = '' AND expires > now`. What the link creates is an ordinary `shot` owned by
`account_id`, named `name`. Spent and expired rows for an account are deleted whenever it mints a
new link, which is the only time anything reads them.

## team, membership, invite

- `team`: `id`, `slug`, `name`, `created_by`, `created`
- `membership`: `team_id`, `account_id`, `role` (`owner` or `member`), `joined`
- `invite`: `code`, `team_id`, `email`, `created_by`, `created`, `used_by`, `used`

An invite is a link. Opening it creates the account and joins the team in one step, which is what
makes "nothing to install" true for the receiving side. The email is optional and only decides
whether the link is also mailed.

## pull

`id`, `guide_id`, `account_id`, `via`, `at`

One row per fetch. `account_id` is `''` for an anonymous share-link reader — that is a real case,
not a bug, and reporting has to survive it. `via` records how it was reached (link, CLI, MCP).

`guide.pulls` is the running count, kept alongside so a list query does not have to aggregate.
The pull count is reported on the row. It used to drive a separate "worth keeping" queue and a
`promoted` status; both are gone — a counter is not a state.

## verdict

`guide_id`, `account_id`, `ok` (1 or 0), `note`, `at`

The answer to "did it actually work". `note` carries the reason when `ok` is 0, and that reason is
the highest-value thing in the system — it is what tells the author their guide was wrong, and it
reaches them the same day.

## notification

`id`, `account_id`, `kind`, `guide_id`, `actor_id`, `team_id`, `at`, `times`, `read_at`,
`emailed_at`, `note`

`kind` is one of `KINDS` in `apps/api/src/notify.ts`: the handoff events (`handoff`, `shared`,
`taken`, `declined`, `pulled`, `consumed`, `reopened`, `verified`, `failed`, `joined`) and the
task queue's (`task_claimed`, `task_finished`, `task_approved`, `task_rejected`, `task_released`). Repeated events coalesce into one row
with `times` incremented and `at` moved forward, rather than piling up — the feed is meant to be
readable after a week away.

`read_at` and `emailed_at` are separate on purpose: reading it in the hub should not stop the mail,
and being mailed should not mark it read.

## token, session, reset

- `token`: `id`, `account_id`, `name`, `hash`, `created`, `last_used`, `revoked`
- `session`: `hash` (PK), `account_id`, `created`, `expires`
- `reset`: `hash` (PK), `account_id`, `created`, `expires`, `used`

Only hashes are stored — of tokens, session ids and reset codes alike. See [auth](auth.md). A
revoked token keeps its row so the hub can show what was revoked and when.

## Deleting an account

`ON DELETE CASCADE` runs through guide, membership, pull, verdict, notification, token, session and
reset. Combined with `passalong export`, that is what "deleting your account leaves you with all of
your content" means: the user keeps the markdown, the service keeps nothing.
