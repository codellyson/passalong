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

`id`, `account_id`, `share_key`, `title`, `summary`, `status`, `outcome`, `source_context`,
`target`, `tags`, `stack`, `markdown`, `created`, `updated`, `pulls`, `team_id`, `to_account_id`,
`to_group_id`, `parent_id`, `client`, `alone`, and a support request's `customer`, `customer_name`,
`ref`, `customer_subject`, `customer_mids`

A row is one piece of **work** — the table keeps its old name because renaming it buys nothing and
risks the data. The markdown is the work; the columns beside it are a denormalised index of its
frontmatter, kept for querying. When they disagree, the markdown is the truth. The exceptions are
the columns that are deliberately never frontmatter: `client` (what wrote it), `alone` (a person
marked it safe for the runner), `outcome` and the customer columns.

`share_key` is the secret. The `id` is an address — 8 characters from a no-lookalike alphabet,
short enough to read aloud — and is not secret on its own. A share link is `/g/<id>/<key>`, so
knowing an id gets you nothing.

Work has no kinds (docs/WORK.md). Migration 0061 stripped `kind:` from every stored document and
dropped `kind`, `report_id`, `report_of`, `area` and `severity`; `tags` may describe work and
nothing turns on them.

`status` is `draft | published | consumed` (Draft, Ready, archived or Done); `promoted` is legacy —
still accepted, because the value lives in markdown people already published, but nothing sets it.
`outcome` says how Done was reached: `finished`, `archived`, or `approved` on work closed before
0061. `to_account_id` set means it was handed to one person, `to_group_id` to a group; `team_id`
means it went to a team.

## claim, claim_fence, task_event

- `claim`: who holds a piece of work now — `guide_id` (primary key: one holder), `account_id`,
  `agent_id`, `host`, `repo`, `worktree`, `state`, `lease_until`, `note`, and what a hand-in carried
  (`evidence`, `checks`, `writeup`, `risk`, `pr`), `fence`, `replied_through`. Deleted on release,
  pass and finishing.
- `claim_fence`: `guide_id`, `held` — the generation `take` hands out, so a write from a hold since
  released and re-taken is refused (migration 0029; one per piece of work since 0061).
- `task_event`: `id`, `guide_id`, `kind`, `account_id`, `agent_id`, `host`, `body`, `at` — the
  thread, append-only. Kinds: `taken`, `progress`, `handed_in`, `passed`, `released`, `reopened`,
  `asked`, `replied`, `noted`, `customer`, `answered`. Migration 0062 moved old verdicts and acks
  in and renamed the retired kinds, so this table alone is the thread.

## folder, folder_document, folder_asset, folder_guide

Migrations 0046 and 0047 add project folders and nesting. `folder` has a creator, optional team id,
title, description, optional parent id and optional color. A child stays in its parent's private or
team space; the API prevents cycles. Private folders are visible only to their creator; team folders are visible to current
members. `folder_document` holds the current Markdown and version; `folder_document_revision`
holds each saved body. A write must name the version it read, so concurrent edits do not overwrite.
`folder_asset` points to private bytes in R2 under `folders/<folder>/<asset>`, independent of
work's screenshots and attachments. `folder_guide` only links existing work to project context;
removing a link or the work leaves the folder's documents and files intact.

## shot

`id`, `account_id`, `guide_id`, `name`, `type`, `bytes`, `created`

A screenshot attached as evidence. The bytes are in R2 under `<id>.<ext>`; this row is the only
record of which extension that was, which is why a failed bucket delete must not delete the row —
nothing would ever look for the file again.

`guide_id` is written on every write of work, from the shot URLs in its markdown, and is
empty until some document names it. Deleting work deletes its shots and their objects. An
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

## verdict, ack

- `verdict`: `guide_id`, `account_id`, `ok`, `note`, `detail`, `checks`, `writeup`, `at` — what a
  hand-in showed, kept by `complete()` after its claim is gone: the work page leads with it as
  "Finished with". One row per (work, account). Nothing else writes it any more; rows with
  `ok = 0` are from the retired review.
- `ack`: `guide_id`, `account_id`, `taken`, `note`, `at` — a "not for me" (`taken = 0`, with why),
  which keeps work off the decliner's list. Rows with `taken = 1` are from the retired "I'll do it".

## notification

`id`, `account_id`, `kind`, `guide_id`, `actor_id`, `team_id`, `at`, `times`, `read_at`,
`emailed_at`, `note`

`kind` is one of `KINDS` in `apps/api/src/notify.ts`: work sent and moved (`handoff`, `shared`,
`declined`, `pulled`, `consumed`, `reopened`, `reassigned`, `joined`), the queue's
(`task_claimed`, `task_finished`, `task_released`, `sent_back` for a reopen, `stalled`, `requeued`,
`stuck`, `untaken`, `still_draft`, `child_done`), the conversation's (`asked`, `replied`), a
customer's (`customer_wrote`, `customer_waiting`, `reader_unsure`) and the admins'. Repeated events
coalesce into one row
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

`ON DELETE CASCADE` runs through guide, claim, task_event, membership, pull, verdict, ack, notification, token, session and
reset. Combined with `passalong export`, that is what "deleting your account leaves you with all of
your content" means: the user keeps the markdown, the service keeps nothing.
