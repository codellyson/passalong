# One thing: work

**Status:** being built, 2026-10-29. The design for step 1 of [LOOP.md §0](LOOP.md): guides, kinds,
sections, handovers and hand-in write-up guides go in one overhaul. This file is the contract every
part of that change is built against. When it lands, AGENTS.md and the llm-wiki are rewritten to
match and this file stays as the record of why.

## Why

Passalong had three kinds of guide (task, bug, transfer), each with required sections, templates,
headings that were refused in one kind and required in another, and a separate write-up guide for a
task's hand-in. That was the system doing the agent's reading in advance. In use, 162 of 200 guides
were tasks or bugs filed under the wrong kind, handovers went unread, and agents padded two-line
notes into six sections. A capable agent reading "the upload button does nothing, see screenshot"
knows what it is and what done means. So there is one thing to do — **work** — and the agent infers
the rest.

**Overhaul, never patch** (LOOP.md §0): what goes is removed whole — code, routes, tools, columns,
tests, docs — not kept beside the new. Installed CLIs move by publishing the new one and raising
`MIN_CLIENT`; data is migrated, never silently dropped.

## The shape of a piece of work

Stored as markdown with frontmatter (strings and string lists only, as before). Frontmatter:

| Field | |
| --- | --- |
| `title` | required |
| `summary` | required, one or two plain sentences for a person, ≤ 400 chars (`SUMMARY_MAX`) |
| `status` | `draft`, `published` (Ready), `consumed` (archived); `promoted` still parses |
| `team`, `to` | where it goes: `@handle`, `#group`, several, or the whole team |
| `id`, `url` | as before |
| `tags` | a controlled vocabulary, normalised at both ends. The agent may tag `bug`, `feature`, `question` as **description**; no rule ever turns on a tag |
| `parent` | the work this came from (a customer request, a bigger piece of work) |
| `blocked_by` | work that must be Done first |
| `target` | the repo, when known (stays a column, as today) |
| `stack_assumptions` | kept only if the parser already round-trips it; never required |

**Gone:** `kind`, and everything that turns on it: `KINDS`, `SECTIONS`, `TASK_SECTIONS`,
`BUG_SECTIONS`, `BUG_LEAD`, `REQUIRED`, `sectionsFor`, `template()` and its per-kind branches,
`bugGuide`, `AREAS`, `SEVERITIES`, the "a bug may not have Steps" refusal, the verify view
(`?view=verify`, `verifyLayout`), `guide_template`. The body is free markdown: the agent writes what
the next reader needs, in whatever shape fits. A document carrying `kind:` (old exports, old
clients) is **refused** by name, like any field the parser cannot hold — the migration below strips
it from every stored document, so nothing on the server carries it.

## Holding and finishing

- **One holder at a time** for every piece of work (what tasks had). The per-repo lock
  (`claim.place`, migration 0024) goes.
- `take`, `progress`, `hand_in`, `pass`, `ask`, `reply`/note, `release`, `reopen`, `assign`, the
  lease, requeue and `stuck`, `blocked_by`, `alone` (the runner's mark): unchanged in meaning, one
  code path for all work.
- **Hand-in write-up guides go**: `claim.report_id`, `guide.report_of`, the `report`/`markdown`
  arguments of `hand_in` and `finish`, `finishTask`, and the hub's "write-up" links. A hand-in
  carries its `writeup` text (≤ 500 chars) and its evidence/checks, as today.
- The proof gate (`proofProblem()`) is **not** changed here; LOOP.md step 2 replaces it with the
  agent's judgement.

## Bug report sets go

`report` (migration 0006: a parent page grouping filed bugs, with `area` and `severity` on each
guide, `/hub/report/:id`, `get_report`, the report editor) is the old way of saying "these came
together". `parent` says it now. The `report` table, `guide.report_id`, `guide.area`,
`guide.severity`, their routes, hub pages and tests go; existing reports become a parent piece of
work holding their bugs (migration below).

## Coming in

- **Email in:** one address, `key+new@` (with `+team` after it), sorted by the reader, plus
  `key+support@` for customers. The per-kind addresses `key+task@`, `key+bug@`, `key+transfer@` go.
- **Webhooks:** `POST /v1/in/<key>` (no kind in the path). Sentry/PostHog parsing stays.
- **The reader** no longer chooses a kind or writes sections: it writes the title, the summary, an
  optional tag, picks the group (and, in step 4, the project) and says why. The customer's or
  writer's own words are quoted into the body by code, as now.

## Agent tools: 17, four nouns

The same tools on both MCP servers (`packages/passalong/src/mcp.js` over stdio,
`apps/api/src/mcp-http.ts` at `/v1/mcp`), each dispatching to the server's routes.

| Tool | Does | Replaces |
| --- | --- | --- |
| `take` | Hold a piece of work and get it (no id: the next one for this repo) | `take`, `work` (HTTP) |
| `progress` | A one-line note while working | — |
| `hand_in` | Finished here, with writeup and evidence | — |
| `pass` | Not mine / stuck, with the reason | — |
| `ask` | Stop and ask the person | — |
| `create_work` | One or many pieces of work (`draft: true` for a plan a person should read first) | `publish_guide`, `file_bugs`, `plan_tasks`, `guide_template` |
| `find_work` | An id → that work (read only); words → search; nothing → the board | `get_guide`, `search_guides`, `board`, `inbox` |
| `update_work` | Status (Ready, Draft, archive), who it is for, its text | `set_guide_status`, `assign`, re-publishing by id |
| `find_projects` | List, search or open a folder (a project, from step 4) | `list_folders`, `get_folder` |
| `save_project` | Create a folder or change its name, description, place or colour | `create_folder`, `update_folder` |
| `read_document` | One document, optionally its history | `get_folder_document`, `get_folder_document_history` |
| `save_document` | Write or update a document, including rename and move | `create_folder_document`, `save_folder_document`, `rename_folder_document`, `move_folder_document` |
| `delete_document` | — | `delete_folder_document` |
| `add_file` | A picture or file onto work or a folder: a path (stdio), a file input or a one-time upload link (HTTP) | `attach_screenshot`, `attach_file`, `add_folder_asset`, `create_upload`, `create_folder_upload` |
| `read_file` | Bounded image or text content of a file | `get_folder_asset` |
| `delete_file` | — | `delete_folder_asset` |
| `accounts` | List logins here, and switch with `use` | `accounts`, `use_account` |

**Gone from agents:** `log`, `activity`, `clear_activity` (people read those in the hub),
`share_folder`, `link_folder_guide`, `unlink_folder_guide` (work will live in its project),
`get_report`, `reply` as an agent tool (people write to the agent from the hub; the route stays for
the hub and CLI). Server instructions are rewritten around the four nouns; the word "guide" does not
appear in any tool name, description or instruction.

## Names

People and agents see **work**, **project**, **document**, **file**; the hub may say "task" or
"bug" as plain English. Internal names that nobody sees stay, because renaming them buys nothing and
risks the data: the `guide` and `claim` tables, the `/v1/guides/...` route paths, share links
`/g/:id/:key`. Legacy route aliases kept only for installed CLIs (`/v1/tasks/:id/*`, `ack`,
`verdict`, `approve`, `finish`) go, since old CLIs are cut off.

## Migration 0061

1. Strip `kind:` from every stored document: `UPDATE guide SET markdown = replace(markdown,
   char(10) || 'kind: <k>' || char(10), char(10))` for `task`, `bug`, `transfer` (the serializer
   writes exactly that line).
2. Bug report sets become parent work: each `report` row becomes a `guide` row (title, account,
   team, `to`, a summary and body built from its title and environment, status `published`) and each
   guide with that `report_id` gets `parent` set to it in its markdown — or, if that cannot be done
   safely in SQL, a one-off script run before the migration, documented in docs/DEPLOY.md. Then drop
   `report`.
3. Rebuild `claim` without `place` (primary key `guide_id`) and without `report_id`, keeping one row
   per guide (the most recently updated) where several exist. Nothing references `claim`.
4. Drop indexes `guide_kind`, `guide_report`, `guide_task_queue`; drop columns `guide.kind`,
   `guide.report_of`, `guide.report_id`, `guide.area`, `guide.severity`; recreate the queue index as
   `guide(status, target, created)`.

Every step is tested against real SQLite with every migration (`apps/api/test/claims.test.mjs`
style) before it runs on production, and production gets a D1 Time Travel bookmark first.

## Cutover

Publish the new CLI to npm, deploy, then raise `MIN_CLIENT` to that version at once. Old CLIs get
the 426 with the install command. Share links keep working.
