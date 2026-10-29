# Work

A piece of work is the unit of everything (built 2026-10-29, [docs/WORK.md](../WORK.md)): what
someone must still do, as **markdown with frontmatter**, strings and string lists only, so it
round-trips through the parser byte for byte and `passalong export` is always a complete backup.
People and agents see "work"; the table is still `guide`, the routes `/v1/guides/...` and share links
`/g/:id/:key`, because renaming what nobody sees buys nothing and risks the data.

## One thing, no kinds

There is no `kind:`, no required section, no template and no heading that is refused. The body is
free markdown: whatever the next reader needs, in whatever shape fits, and the agent reads it and
works out what done means. A writer may say "done when"; nothing requires it.

**Why:** there were three kinds (task, bug, transfer), each with its own sections. In use 162 of 200
guides were tasks and bugs filed under the wrong kind, handovers that followed their template went
unread, and agents padded two-line notes into six sections. Splitting work into kinds was the system
doing the agent's reading in advance. A document still carrying `kind:` (an old export, an old
client) is refused by name, like any field the parser cannot hold; migration 0061 stripped it from
every stored document.

## Fields

- `title`, and `summary:` — both required. The summary is the human form: one or two plain
  sentences, 400 characters at most (`SUMMARY_MAX`), said by the author and refused when absent,
  because a summary written later by something that was not there can say what nobody claimed.
- `tags:` — a controlled vocabulary, lowercased and hyphenated at both ends. An agent may tag `bug`,
  `feature` or `question` as **description**; the hub shows the first as the work's label, and no
  rule ever turns on a tag.
- `to:` / `team:` — the address: `@handle`, `#group`, several, or the whole team (see
  [teams-and-plans.md](teams-and-plans.md)).
- `parent:` — the work this came from (a customer request, a bigger piece of work). It replaced bug
  report sets: migration 0061 made each `report` row a parent piece of work its bugs name, and
  dropped `report`, `area` and `severity`.
- `blocked_by:` — work that must be Done first.
- `status:` — draft, published (Ready), and `consumed` (archived, reversible, out of the free-tier
  count). `promoted` still parses and can no longer be set.
- `target` — the repo, when known, is a column, not frontmatter.

## Where the format is defined

Twice, kept in step on purpose: `packages/passalong/src/guide.js` defines it; `apps/api/src/guide.ts`
mirrors its parsing. `packages/passalong/fixtures/guides/` is the corpus that holds the two parsers
to each other — edit it deliberately, never to make a test pass.

## How big, and read in parts

Six of 123 documents held 72% of the stored text, so the lever is size, not prose. Over 20,000
characters (`GUIDE_WARN`) the author is warned and `find_work` with an id returns an outline (headings
and their sizes) unless asked for a `section` or `full`; `take` still returns the whole document,
because that is the one an agent acts on. New work over 60,000 (`GUIDE_MAX`) is refused with 413; one
stored larger before keeps its size. The outline and section logic is in `guide.js`,
`apps/api/src/sections.ts` and a copy in `mcp-http.ts` (which takes no sibling import);
`apps/api/test/sections.test.mjs` holds the three to the same answers.

## What goes away by itself

One clock tidies, swept hourly (`apps/web/server/plugins/sweep.ts`): the proof screenshots on closed
work are **deleted** 5 days after it closed (`PROOF_DAYS`); the work and its own document stay. Work
sent and taken by nobody stays Ready, and after three days (`UNTAKEN_MS`) a person is told
(2026-10-28, docs/LOOP.md); it used to go back to Draft after 14 days, where it reached nobody.
Clean-up is on by default and stops for an account that sets `account.keep_forever` (migration 0044,
`PATCH /v1/me`, Settings → Clean-up). `quota.ts`'s `mayKeep` is the one place a plan will gate
turning it off; it says yes to everybody today.

The deadline is shown, not just enforced: list rows and the work page carry `proof_expires`,
computed by `shots.proofExpiry` from the same conditions the sweep deletes on, so a date on screen is
a date that happens.

## Sources
- [docs/WORK.md](../WORK.md), [docs/LOOP.md](../LOOP.md) §0
- [AGENTS.md](../../AGENTS.md): "src/guide.js", "Status lifecycle", "Tags are a controlled vocabulary"
- `packages/passalong/src/guide.js`, `apps/api/src/guide.ts`, `packages/passalong/test/one-place.test.js`
- `apps/api/migrations/0061_one_thing.sql`
- `/docs/work-format` on the site
