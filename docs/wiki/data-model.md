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
`created`, `updated`, `pulls`, `team_id`, `to_account_id`

The markdown is the guide; the columns beside it are a denormalised index of its frontmatter, kept
for querying. When they disagree, the markdown is the truth.

`share_key` is the secret. The `id` is an address — 8 characters from a no-lookalike alphabet,
short enough to read aloud — and is not secret on its own. A share link is `/g/<id>/<key>`, so
knowing an id gets you nothing.

`status` is `draft | published`. `consumed` and `promoted` are legacy — still accepted, because
the value lives in markdown people already published, but nothing sets them. `to_account_id` set means it was handed to
one person; `team_id` means it went to a team.

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

`kind` is `handoff | shared | pulled | consumed | joined`. Repeated events coalesce into one row
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
