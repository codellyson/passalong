# One thing: work

**Status:** built, 2026-10-29 (commits 5a833a6 to the docs that followed them; migrations 0061 and
0062; CLI 0.22.0, not yet on npm). The design for step 1 of [LOOP.md §0](LOOP.md): work,
kinds, required sections, one-person write-ups and separate hand-in write-ups went in one overhaul. AGENTS.md, llms.txt and
the llm-wiki describe what is built; this file stays as the record of why. Where the build differs
from the plan below, **Deviations** at the end says so.

## Why

Passalong had three kinds of work, each with required sections, templates,
headings that were refused in one kind and required in another, and a separate write-up work for a
task's hand-in. That was the system doing the agent's reading in advance. In use, 162 of 200 pieces of work
were tasks or bugs filed under the wrong kind, one-person write-ups went unread, and agents padded two-line
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
| `status` | `draft`, `ready` (Ready), `done` (finished or archived) |
| `team`, `to` | where it goes: `@handle`, `#group`, several, or the whole team |
| `id`, `url` | as before |
| `tags` | a controlled vocabulary, normalised at both ends. The agent may tag `bug`, `feature`, `question` as **description**; no rule ever turns on a tag |
| `parent` | the work this came from (a customer request, a bigger piece of work) |
| `blocked_by` | work that must be Done first |
| `target` | the repo, when known (stays a column, as today) |
| `stack_assumptions` | kept only if the parser already round-trips it; never required |

**Gone:** `kind`, and everything that turns on it: `KINDS`, `SECTIONS`, `TASK_SECTIONS`,
`BUG_SECTIONS`, `BUG_LEAD`, `REQUIRED`, `sectionsFor`, `template()` and its per-kind branches,
`AREAS`, `SEVERITIES`, the "a bug may not have Steps" refusal, the verify view
(`?view=verify`, `verifyLayout`). The body is free markdown: the agent writes what
the next reader needs, in whatever shape fits. A document carrying `kind:` (old exports, old
clients) is **refused** by name, like any field the parser cannot hold — the migration below strips
it from every stored document, so nothing on the server carries it.

## Holding and finishing

- **One holder at a time** for every piece of work (what tasks had). The per-repo lock
  (`claim.place`, migration 0024) goes.
- `take`, `progress`, `hand_in`, `pass`, `ask`, `reply`/note, `release`, `reopen`, `assign`, the
  lease, requeue and `stuck`, `blocked_by`, `alone` (the runner's mark): unchanged in meaning, one
  code path for all work.
- **Hand-in write-up work go**: `claim.report_id`, `work.report_of`, the `report`/`markdown`
  arguments of `hand_in` and `finish`, `finishTask`, and the hub's "write-up" links. A hand-in
  carries its `writeup` text (≤ 500 chars) and its evidence/checks, as today.
- The proof gate (`proofProblem()`) is **not** changed here; LOOP.md step 2 replaces it with the
  agent's judgement.

## Bug report sets go

`report` (migration 0006: a parent page grouping filed bugs, with `area` and `severity` on each
work, `/hub/report/:id`, `get_report`, the report editor) is the old way of saying "these came
together". `parent` says it now. The `report` table, `work.report_id`, `work.area`,
`work.severity`, their routes, hub pages and tests go; existing reports become a parent piece of
work holding their bugs (migration below).

## Coming in

- **Email in:** one address, `key+new@` (with `+team` after it), sorted by the reader, plus
  `key+support@` for customers. The per-kind addresses `key+task@` and `key+bug@` go.
- **Webhooks:** `POST /v1/in/<key>` (no kind in the path). Sentry/PostHog parsing stays.
- **The reader** no longer chooses a kind or writes sections: it writes the title, the summary, an
  optional tag, picks the group (and, in step 4, the project) and says why. The customer's or
  writer's own words are quoted into the body by code, as now.

## Agent tools: 17, four nouns

The same tools on both MCP servers (`packages/passalong/src/mcp.js` over stdio,
`apps/api/src/mcp-http.ts` at `/v1/mcp`), each dispatching to the server's routes.

| Tool | Does |
| --- | --- |
| `take` | Hold a piece of work and get it (no id: the next one for this repo) |
| `progress` | A one-line note while working |
| `hand_in` | Finished here, with writeup and evidence |
| `pass` | Not mine / stuck, with the reason |
| `ask` | Stop and ask the person |
| `create_work` | One or many pieces of work (`draft: true` for a plan a person should read first) |
| `find_work` | An id → that work (read only); words → search; nothing → the board |
| `update_work` | Status (Ready, Draft, archive), who it is for, its text |
| `find_projects` | List, search or open a project |
| `save_project` | Create a project or change its name, description, place or colour |
| `read_document` | One document, optionally its history |
| `save_document` | Write or update a document, including rename and move |
| `delete_document` | — |
| `add_file` | A picture or file onto work or a project: a path (stdio), a file input or a one-time upload link (HTTP) |
| `read_file` | Bounded image or text content of a file |
| `delete_file` | — |
| `accounts` | List logins here, and switch with `use` |

**Gone from agents:** `log`, `activity`, `clear_activity` (people read those in the hub),
sharing a project and linking work to it (work will live in its project),
`get_report`, `reply` as an agent tool (people write to the agent from the hub; the route stays for
the hub and CLI). Server instructions are rewritten around the four nouns; they speak only of work,
projects, documents and files.

## Names

People and agents see **work**, **project**, **document**, **file**; the hub may say "task" or
"bug" as plain English. The code, tables and routes use the same words (migration 0068): the `work`
and `claim` tables, `/v1/work/...`, share links `/w/:id/:key`. Route aliases kept for installed CLIs
(`/v1/tasks/:id/*`, `approve`, `finish`) go, since old CLIs are cut off.

## Migration 0061

1. Strip `kind:` from every stored document: `UPDATE work SET markdown = replace(markdown,
   char(10) || 'kind: <k>' || char(10), char(10))` for each of the three kinds (the serializer
   writes exactly that line).
2. Bug report sets become parent work: each `report` row becomes a `work` row (title, account,
   team, `to`, a summary and body built from its title and environment, status `ready`) and each
   work with that `report_id` gets `parent` set to it in its markdown — or, if that cannot be done
   safely in SQL, a one-off script run before the migration, documented in docs/DEPLOY.md. Then drop
   `report`.
3. Rebuild `claim` without `place` (primary key `work_id`) and without `report_id`, keeping one row
   per work (the most recently updated) where several exist. Nothing references `claim`.
4. Drop the kind, report and queue indexes; drop columns `work.kind`,
   `work.report_of`, `work.report_id`, `work.area`, `work.severity`; recreate the queue index as
   `work(status, target, created)`.

Every step is tested against real SQLite with every migration (`apps/api/test/claims.test.mjs`
style) before it runs on production, and production gets a D1 Time Travel bookmark first.

## Cutover

Publish the new CLI to npm, deploy, then raise `MIN_CLIENT` to that version at once. Old CLIs get
the 426 with the install command. Migration 0068 then renames tables and statuses; share links
minted before it stop working.

## Deviations

- **16 tools over HTTP.** `/v1/mcp` has every tool but `accounts`: there the bearer token is the
  account, so there is nothing to list or switch. Stdio has all 17.
- **`key+new@` without a reader** files by the fixed rule: titled by its subject, the mail quoted as
  it came, sent to the team without a group. The reader is a deployment's configuration
  (`READER_*`), not something every install has.
- **Report sets.** A set whose bugs were all Done became Done parent work (`outcome = finished`), so
  the untaken reminder does not chase it; every other set became Ready parent work.
- **Existing write-ups** were not moved into documents: 0061 strips `kind:` and they
  stay as work in whatever state they were — mostly Done or archived. A write-up that was hidden
  from the board by `report_of` is now an ordinary Done piece of work. Moving knowledge into
  project documents waits for projects (LOOP.md step 4).
- **The thread.** Migration 0062 (not in the plan) moved old proofs into `task_event`
  and renamed the kinds nobody writes any more, so the thread reads one table. The `proof` table
  stays as a hand-in's standing record ("Finished with"); a `passed` thread line is what keeps work
  off the passer's list. `/v1/inbox`, `/v1/work/:id/children` and `/v1/work/:id/mark_done`
  went with nothing calling them; `/v1/board`, `/v1/log`, `/v1/notifications`, recall and the
  project link, unlink and share routes stay because the hub calls them.
- **CLI 0.22.0** has `new` (replacing `share` and `task`), `board`, `take [--save]`, `progress`,
  `hand-in`, `pass`, `ask`, `reply`, `assign`, `release`, `reopen`, `ready`, `archive`, `rm`,
  `attach`, `work`; `inbox`, `activity`, `log`, `pull`, `start`, `tasks`, `recall`, `approve`,
  `reject` and `done` went. `MIN_CLIENT` is raised to 0.22.0 at the cutover (docs/DEPLOY.md).
- **Public pages.** `/docs/work-format` became `/docs/work-format` (the old path redirects). The
  `/learn` articles still teach kinds and are next.
