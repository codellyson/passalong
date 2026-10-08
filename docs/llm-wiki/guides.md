# Guides

A guide is the unit of everything: **markdown with frontmatter**, strings and string lists only, so
it round-trips through the parser byte for byte and `passalong export` is always a complete backup.

## Three kinds, always stated

`kind:` says what the guide asks of whoever receives it, and there is **no default** — a guide
without one is refused, by the CLI's `validate()` and by `PUT /v1/guides/:id` for every client.

| Kind | Asks for | Sections |
| --- | --- | --- |
| `task` | Work nobody has done yet. How is the taker's to work out. | Goal, Context, Constraints, **Acceptance** (required — it is what the work is approved against), Out of scope. No Steps. |
| `transfer` | Context the next agent needs so it does not start cold, or finished work to repeat. | None required. Context has no fixed shape. |
| `bug` | A defect to fix where it is. | Problem, **Reproduce** (never `Steps` — agents are told to follow Steps, and following a repro reproduces the bug), Verification. |

**Why no default:** it used to default to `transfer` while the MCP server told agents "task is the
default". For thirteen days 162 of 200 real guides were stored as transfers while their titles were
tasks and bugs — nothing showed as in progress, short notes got padded into six sections, and there
was nowhere to report into one. *A silent default is a fabrication the product commits on the
author's behalf.* The rule since: a field whose absence means something is either stated or refused.

## Other fields that matter

- `blocked_by:` — tasks only. A blocker counts as finished when a **person approved it**, never when
  an agent finished it.
- `to:` / `team:` — the address: `@handle`, `#group` or the whole team (see
  [teams-and-plans.md](teams-and-plans.md)).
- `parent:` — lineage. A follow-up is more context for its parent; whoever opens either gets both.
- `status:` — the author's lifecycle: draft, published, and `consumed` (the author's shelf:
  archived, reversible, out of the free-tier count). `promoted` still parses and can no longer be set.
- `tags:` — a controlled vocabulary, lowercased and hyphenated at both ends.

## Where the format is defined

Twice, on purpose kept in step: `packages/passalong/src/guide.js` defines it; `apps/api/src/guide.ts`
mirrors its parsing. `packages/passalong/fixtures/guides/` is the corpus that holds the two parsers
to each other — edit it deliberately, never to make a test pass.

## How big, and read in parts

Six of 123 guides held 72% of the stored text, so the lever is size, not prose. Over 20,000 characters
(`GUIDE_WARN`) a guide's author is warned and `get_guide` returns an outline (headings and their
sizes) unless asked for a `section` or `full`; `take` still returns the whole document, because that
is the one an agent acts on. A new guide over 60,000 (`GUIDE_MAX`) is refused with 413; one stored
larger before keeps its size. The outline and section logic is in `guide.js`, `apps/api/src/sections.ts`
and a copy in `mcp-http.ts` (which takes no sibling import); `apps/api/test/sections.test.mjs` holds
the three to the same answers.

## Sources
- [AGENTS.md](../../AGENTS.md): "src/guide.js", "A guide has a kind…", "Status lifecycle", "Tags are a controlled vocabulary"
- `packages/passalong/src/guide.js`, `apps/api/src/guide.ts`, `packages/passalong/test/one-place.test.js`
- [docs/V2.md](../V2.md) §4 (the task card)
- `/docs/guide-format` on the site
