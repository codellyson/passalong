# Passalong — agent notes

Passalong keeps a team's work and what it knows, for people and their agents, as four things:
**work** (what someone must still do), **projects** (one per product; folders in the code today),
their **documents** (what to know) and **files**. Things come in — the hub's box, email, a phone's
share sheet, webhooks, a customer — and are worked by whoever takes them; what is learned goes into
the project's documents. `docs/LOOP.md` is the direction: **read §0 before building anything new.**
Step 1 of its build order, one thing called work (`docs/WORK.md`), is built (2026-10-29); the next
steps (the agent tidying the board, onboarding, projects as the home of work) are not. `docs/PRD.md`
is the original intent and predates both.

People and agents see **work**, **project**, **document** and **file**, never "guide". Internal
names nobody sees stay, because renaming them buys nothing and risks the data: the `guide` and
`claim` tables, `/v1/guides/...` paths, `fixtures/guides/`, share links `/g/:id/:key`.

This file is the **conventions**: the rules and the sharp edges, and it is what to read first.
Reference material lives beside it — `docs/wiki/` has the schema, the `/v1` surface, the auth
model, how the web view stays safe, and how releases work. `apps/web/public/llms.txt` is the
public one, for agents *using* Passalong rather than changing it.

`docs/llm-wiki/` is the synthesis: one page per concept, how the parts connect, the decisions behind
them and what is still open — the fastest way to the whole picture. **Keep it true:** a change that
alters what one of its pages says updates that page and adds a line to its `log.md`, in the same
change. Its README says how.

## Layout

- `packages/passalong` — the `passalong` CLI and the MCP server. Plain ESM JavaScript, no build step,
  no runtime deps beyond `@modelcontextprotocol/sdk` + `zod`. Published to npm as `passalong`.
  - `src/guide.js` — the work format: frontmatter parse/serialize, validation, ids. **Work has no
    kinds, sections or templates**: the body is free markdown, and only `title` and `summary` are
    required. A document carrying `kind:` (an old export, an old client) is refused by name
    (`RETIRED`; `retiredFields()` in `apps/api/src/guide.ts` at `PUT /v1/guides/:id`, the half that
    runs for every client). Kinds were the system doing the agent's reading in advance: 162 of 200
    guides in real use were tasks and bug reports filed under the wrong kind, handovers that followed
    their template went unread, and two-line notes were padded into six sections.
    **The rule for every field whose absence means something**: either the author states it and
    the boundary normalises it, or absence is refused. What is never allowed is inventing the
    answer and writing it into the record — **a silent default is a fabrication the product commits
    on the author's behalf** — and nothing downstream may re-decide. `kind` was the field that
    taught this: it was seeded `transfer` while agents were told `task` was the default.
    `packages/passalong/test/one-place.test.js` enforces it by reading the source; add a field to
    its `GUARDED` list the day absence starts speaking for it.
    **This file defines the format.** `apps/api/src/guide.ts` mirrors its parsing rules; change both,
    and `fixtures/guides/` is what now checks you did.
    **Every piece of work has two forms, and `summary:` is the human one** (migration 0041). The
    document is the agent's: exact, dense, full of ids and paths. The summary is a sentence or two a
    person can read in the hub, 400 characters at most (`SUMMARY_MAX`), said by the author and
    refused when absent — `validate()` locally, `summaryProblem()` in `apps/api/src/guide.ts` at
    `PUT /v1/guides/:id` — because a summary written afterwards by something that was not there is
    a second voice that can say what nobody claimed. One exception, on purpose: work stored before
    summaries existed, written again by a client that has not heard of them, is let through as it
    came. New work is never let through. Code that builds work states it (`create_work` takes
    `summary` per item; `taskScaffold` says the sentence the person typed; the reader writes one for
    what it files). The hub shows it by default — first bubble of a thread, under the title on rows,
    leading the work page — and the document sits behind "Show details". The Work board's cards are
    the exception: a column of them is scanned by title, so they carry no summary.
  - `src/store.js` — `~/.passalong` (`PASSALONG_HOME` overrides): config, accounts and drafts being
    written. **No work is kept on the machine unless somebody asks.** The server holds all of it
    and is the only place it is read from: local copies used to be written by every share, pull and
    take, and did nothing but go stale — a pull served one over the author's later edit — and pile
    up, 314 on one machine. `take --save` writes `.passalong/<id>.md` in the repo, and
    `export` is the other explicit ask: it walks `GET /v1/export`, which records no pull, so it is a
    complete backup. `ready` and archiving read with `?peek=1` for the same reason. `tidy()`
    removes, once per machine (`tidied: 2`), the old copies the server confirms it holds, asking
    every login in `accounts`, and those whose `url:` is on a login's own host (the old
    kreativekorna host counts as passalong.dev) and that the server answers 404 for with `?peek=1`:
    stale copies of deleted work, 241 on one machine after the first pass. No url, localhost,
    another host or any answer but 200/404 keeps the copy; never delete on doubt. Writing work needs
    an account: an agent does not work without the network anyway.
  - `src/passalong.js` — the operations (`publish`, `createWork`, `take`, `progress`, `handIn`,
    `pass`, `ask`, `reply`, `board`, `list`, `export`, …). The CLI and the stdio MCP server both call
    these.
  - `src/mcp.js` — MCP tools. `buildServer()` builds the surface and `serve()` connects it over
    stdio, so `test/mcp-surface.test.js` can read what every tool tells a client. **Seventeen tools
    over four nouns** (`docs/WORK.md`): work — `take`, `progress`, `hand_in`, `pass`, `ask`,
    `create_work`, `find_work`, `update_work`; projects — `find_projects`, `save_project`,
    `read_document`, `save_document`, `delete_document`; files — `add_file`, `read_file`,
    `delete_file`; and `accounts`. About forty-five went: ten tools for four jobs, each pair
    described almost the same way, is a list a model misreads — which is how a session published a
    guide for work already pushed. One tool per job, one implementation each. Each carries
    `annotations` saying what it does to the world, and `progress`, `hand_in` and `pass` carry an
    `outputSchema` — pass the zod object, never its `.shape`, which advertises a closed object.
    Each answer ends with the server's `next` (`steps()` in apps/api/src/claims.ts). `take` is the
    one an agent reaches for on work it means to do; `find_work` only reads (an id), searches
    (words) or shows the board (nothing). No name, description or instruction says "guide".
    `add_file` is shaped for where it runs — a path locally, a client-passed file over HTTP
    (`openai/fileParams`, which only accepts top-level fields, so each `create_work` item names its
    files by position in a top-level `files` array) — and, because only ChatGPT fills file inputs,
    over HTTP it also mints a one-time link (`POST /v1/uploads`, spent by `PUT /v1/uploads/:token`
    without a credential) that an agent's sandbox sends the file to with curl. See
    `apps/api/src/uploads.ts`.
  - `fixtures/guides/` — the corpus: one file per shape the format has to keep working, each in
    canonical form so `serialize(parse(x))` returns it byte for byte. `test/corpus.test.js` holds
    guide.js to it and `apps/api/test/corpus.test.mjs` reads the same files to hold the two
    parsers to each other. A change that makes these drift is a change to all work already
    published: edit them deliberately, never to make a test go green. Not published to npm.
  - `src/checks.js` — runs a check's command at hand-in and records the exit code, so
    the result is the process's and not the agent's word. Local only: `mcp-http.ts` is a Worker
    with no shell, so a hand-in over HTTP keeps the prose gate. It never reads a command out of
    the work — work comes from somebody else's account, and running what it says would make every
    take remote code execution. It runs under `bash -o pipefail`, so `jest | grep Tests:` or
    `git log | head` fails when the first step does; exit 141 (a writer cut short by `head`) is
    the one non-zero it does not count as a failure.
  - `src/update.js` — the "a newer passalong is out" line. The registry is asked, not the API, and
    **nothing waits for it**: the line is read from `~/.passalong/update.json` and a detached
    `passalong refresh-update` writes it. The first version awaited the fetch on a 1.5s timeout and
    measuring it killed the design — the registry answers in six to ten seconds, so every check
    timed out and cached nothing. `PASSALONG_NO_UPDATE_CHECK=1` turns it off. **Never
    `config.json`**: it is read, patched and written whole, so a refresh landing beside a `logout`
    or `use` wrote the old accounts and default back (the flaky `accounts.test.js` CLI test).
  - `src/api.js` — client for the hosted API. Everything works with no token; sync is additive.
  - `bin/passalong` — the CLI. Few flags on purpose (see `[[command-style-atomic]]` conventions).
  - `skill/SKILL.md` — the Claude Code capture skill. `passalong setup` copies it to
    `~/.claude/skills/passalong-capture`. It hands in what the session holds, then writes what was
    learned into the project's documents (the page that covers it, and a line on its Log) — never
    a handover to one person.
- `apps/api` — Hono + D1: the sync API (`/v1/*`), `/health`, and the two machine routes on a share
  link (`/g/:id/:key.md`, `/g/:id/:key/og.png`). **Not a deployed Worker.** apps/web mounts it, so
  there is one Worker, one origin and one deploy. It has no `public/` and no pages: everything a
  person looks at is apps/web's. Its `wrangler.jsonc` survives only because
  `wrangler d1 migrations` reads it.
  - `src/guide.ts` mirrors the format defined in `packages/passalong/src/guide.js` — change both.
    apps/web aliases this file and `analytics.ts` as `#api/*`.
  - `src/og.ts` reads its fonts through the `ASSETS` binding, which is **apps/web's** assets now.
  - `src/claims.ts` — the task queue (`docs/V2.md`): claim, lease, gate, `blocked_by`. Imports no
    sibling so `test/claims.test.mjs` can run it against real SQLite with every migration. The lock
    is `claim`'s primary key; a lapsed lease is `stalled`, derived on read and still locked — until
    the hourly sweep puts it back in the queue `REQUEUE_AFTER_MS` (two hours) later
    (`requeueStalled()`), unless its agent is waiting on a person's answer. The author hears the
    first time; the second time for the same work is `stuck`, mailed (`alertPeople()` in
    alerts.ts), because whoever picks it up is not getting it done (docs/LOOP.md). Each
    claim also carries a generation from `claim_fence` (migration 0029): `take` hands it out, the
    CLI keeps it in `.passalong/held.json`, and `progress`, `hand_in` and `pass` send it back, so
    the same agent's write from a claim that was since released and re-taken is refused. It is
    optional on the way in and checked when present — an older CLI has none to send.
    **One holder at a time** for all work: `claim`'s primary key is `guide_id` (migration 0061
    dropped the per-repo `place`). `release()` takes it back from whoever holds it, at
    `POST /v1/guides/:id/release`. The old aliases under `/v1/tasks/:id/*` went with the CLIs that
    called them; only `/v1/tasks/next` and the hub's `person-*` routes remain there.
  - `task_event` (migration 0037) is the thread: an append-only line per `take`, `progress` note,
    hand-in, pass, release, reopen, question and reply, written by `event()` in `claims.ts` *after*
    the transition it describes and never throwing. `claim` is only the present — `note` is
    overwritten by every progress call and the row is deleted on release, pass and finishing — so
    without this nothing says an agent ever held the work. **`thread()` reads this table alone**:
    migration 0062 moved the old verdicts and acks in as hand-ins, takes, passes and reopens, and
    renamed the kinds nobody writes any more (`sent_back` to `reopened`, `approved` and `closed` to
    `handed_in`), so the hub renders only kinds still written. A decline ("not for me") writes its
    `passed` line as well as its `ack` row. `GET /v1/guides/:id/thread` serves it and `HubThread`
    renders it as chat. A missing row costs a bubble, never a lock.
    **`ask` and `reply` (migration 0038, `docs/CONVERSATION.md`) make it two-way.** `ask` keeps the
    claim, extends the lease to a day and tells the agent to stop; `reply` is a person writing to
    whoever holds it, refused when nobody does and from anyone but the author, the assignee or the
    holder — that is what keeps it from being a comment box, which the PRD rules out. Waiting is
    derived (`ASKING` in claims.ts: the latest `asked` no `replied` has followed), never a claim
    state. Nothing wakes an agent: `deliver()` hands it what was said on its next `progress`/`take`,
    and a `take` resume re-sends everything since the question. The Stop hook lets an agent that
    asked stop, or the instruction and the hook would contradict each other.
    `asked` and `replied` are notification kinds. `asked` is the one kind exempt from the self-drop in
    `notify()`: your own agent asking you is the commonest case, and the drop would have made it
    silent. Both are unread again on every repeat (the row coalesces; read_at is cleared), and mailed
    only the first time per piece of work.
    A reply may carry up to three pictures, as `![name](…/v1/shots/<id>)` lines in its body: uploaded
    to `POST /v1/shots` first, claimed by the work through `claimEvidenceShots`, and carried by
    `conversationOn()` beside evidence so the author's next edit does not release them. Only our own
    screenshots are drawn (`evidenceParts`); a stranger's image address is text. The composer refuses
    a reply that would be cut at 1000 characters, because a picture's address cut in half is a broken
    image nobody can fix.
    **Files that are not pictures are `attachment` (migration 0039, `src/attachments.ts`), not a wider
    `shot`.** The risk runs the other way — a shot is served to be drawn, a file to be saved — so the
    type is decided by the bytes (`sniffAttachment`), HTML and SVG are filed as plain text, and
    `GET /v1/attachments/:id` always answers `content-disposition: attachment`, `nosniff` and a
    sandbox policy, behind a credential and the right to read the work, with 404 and never 403 so a
    refusal does not confirm an id. Claimed, carried and swept exactly as shots are (`claimFiles`,
    `carriedFiles`, `sweepAttachments` beside `sweepOrphans`); the hub downloads with `fetch` and the
    token because a link carries neither.
    `reply` on work nobody holds is a **note** (`noted`): the author or assignee only, handed to
    every taker, which is how a file reaches work before it is taken. An upload link has a `kind`
    (image or file) and checks the bytes against it; a refused file does not spend the link.
    The hub shows who holds what as cards on the team board (`Board.vue`, held-by from `stage` and
    `held_by` on each row); the separate Taken tab and its health pills went with the
    per-viewer tabs. `plain()` (`utils/taken.ts`) still turns a message into one quoted line.
    `conversationOn()` must match every pattern a body can carry a stored thing by (`/v1/shots/` and
    `/v1/attachments/`), or the author's next edit releases whatever the missing one named.
  - `src/folders.ts` — project folders (migrations 0046 and 0047; **projects** to people and
    agents), nestable at any depth within one private or team space, with optional grouping colors
    and the repo a project is built from (`folder.repo`, migration 0067):
    Markdown documents, private R2 assets, and links to work. A folder's files belong to the folder,
    never to linked work; removing work must not remove a tutorial's script or screens. Personal
    folders belong to their creator; every current team member may read and edit a team folder, and
    its creator or a team owner may delete it. Moving a folder refuses cycles and cross-space
    parents; deleting a parent removes its descendants and their R2 files. Every document save
    carries the version read and refuses a stale one, so a person's edit and an agent's edit cannot
    silently replace each other. Linked work comes back with its `tags`, so the hub shows its label.
    Linking, unlinking and sharing a folder are the hub's: agents have no tool for them (work will
    live in its project, LOOP.md step 4). `read_file` returns only bounded image or text content.
    **A project is a place, its documents are what to know, work is what to do**: anything someone
    must still act on is work, never only a document, which has no owner or state and tells nobody.
    Both servers lead with that rule and say a project's `space`; `test/folder-rule.test.js` keeps
    them and llms.txt in step. In the hub a folder is a **project** (`/hub/projects`, `/hub/projects/:id`
    with Documents, Work and History tabs; the hub never says "folder"), and its Work and History are
    one read, `GET /v1/folders/:id/project` (`src/project.ts`, imports no sibling, tested against
    SQLite). Each document version records what saved it (`client`, migration 0063): `hub` is a
    person, `mcp`/`cli@…` an agent, `api` and '' unknown. A document's change mark is
    `folder_document_seen` (migration 0064), written when the hub opens it (`PUT
    …/documents/:id/seen`, never on an agent's read), on a save for the saver, and by "Mark all seen". The hub leads creation with an agent prompt
    and keeps a plain form and its editor for corrections. A document is edited in TipTap
    (`components/hub/DocEditor.vue`, configured as Writer.vue is) and stays Markdown on the server:
    `utils/doc-markdown.ts` converts through TipTap's JSON both ways, `test/doc-markdown.test.mjs`
    holds the round trip, and a document holding what the editor cannot keep (a table, a task list,
    HTML, an alert) opens as Markdown instead of being converted. It fetches private images with its credential and draws blob URLs, which is why the
    hub CSP permits `img-src blob:`.
  - `packages/passalong/test/task-flow.e2e.test.js` drives the CLI's operations against a running
    local server (`npm run test:e2e`, skipped by `npm test`). It puts its accounts on a plan in the
    *local* D1 with `wrangler d1 execute --local`, so it refuses any API that is not localhost.
- `apps/web` — Nuxt 4 on a Cloudflare Worker. **This is the deployed Worker**: every page (`/`,
  `/g/:id/:key`, `/hub`, `/join/:code`, `/reset`, and the 404 in `app/error.vue`), the static
  assets, and — mounted — the whole of `apps/api`. It owns the three custom domains and is what CI
  deploys from master. `passalong-web.codellyson.workers.dev` stays reachable for checking a deploy
  before anyone hits it on the real host.
  - `server/middleware/1.api.ts` — the mount. Hands `/v1/*`, `/health` and the two `/g/**` machine
    routes to the Hono app and lets everything else fall through to Nuxt. The match is written out
    rather than delegated to Hono's router, because a miss has to fall through here instead of
    becoming Hono's 404. `0.canonical.ts` is the `www` → apex redirect, which had to leave Hono for
    the same reason: a page request to www would never reach the mount.
  - `nitro.experimental.wasm` is required, not optional. Without it the bundler tries to parse
    `workers-og`'s `.wasm` as JavaScript and the build dies on the first byte.
  - `public/fonts/onest-{400,600}.woff` look unused and are not: `src/og.ts` reads them
    through `ASSETS`. Satori cannot read woff2, and the stylesheet loads the variable woff2, so
    nothing else references the pair. Deleting them returns 500 on every unfurl card — which is
    exactly what happened once during the port.
  - `shared/csp.ts` — `VIEW_HEADERS` and the scripted-page policy, moved out of `index.ts`.
    `server/plugins/csp.ts` stamps a per-request nonce on every inline `<script>` the renderer
    emits and writes the matching header. **This is why the scripted pages need a nonce and
    apps/api did not:** apps/api loaded one external file and had no inline script anywhere (the
    reason Preact was vendored), while Nuxt emits a `window.__NUXT__.config` bootstrap that
    `script-src 'self'` refuses — the page renders and then hydration dies. `'unsafe-inline'`
    would allow any injected script, which is the thing the header exists to prevent.
    `experimental.entryImportMap: false` removes the other inline script, the import map.
    `shared/worker-env.d.ts` is where `@cloudflare/workers-types` is referenced — it has to be in
    `shared/`, because `tsconfig.server.json` includes `../shared/**/*.d.ts` and *not* the project
    root, and the server config is where the mounted app is checked.
  - `app/composables/useHub.ts` — the hub's state and every mutation, which `App()` in the old
    `hub.js` held in closures. Components read it directly rather than having `api` and `reload`
    threaded three levels down. Status changes still **reload rather than patch state by hand**:
    the board's buckets are defined in SQL, and guessing them on the client is how the two drift.
  - `app/utils/form.ts` — `field(form, name)` reads a named input through `form.elements`.
    **Never `form.fieldName`**: `name`, `action`, `method` and friends are properties of
    HTMLFormElement itself, so a field called any of those silently reads the form's own property.
    The join form was submitting an empty name until the typecheck caught it.
  - The hub's `<noscript>` goes in through `useHead`, not the template. A browser with script
    *enabled* parses the contents of `<noscript>` as plain text while Vue's server render emits it
    as markup, so hydration finds a text node where it expected a `<p>` — a real mismatch, and one
    that only shows up in the dev console.
  - `#api/*` is an alias to `apps/api/src`, for the two leaf modules both halves need:
    `guide.ts` (the format) and `analytics.ts`. Aliased rather than copied — the format is already
    defined twice, in `packages/passalong/src/guide.js` and mirrored in `apps/api/src/guide.ts`,
    and a third copy is one more place to forget.
  - `scripts/probe.sh` — the port's load-bearing assumption, asserted against a deployed `/`:
    that a route can be served with no script at all (`noScripts`) and with the stylesheet as a
    `<link>` rather than an inline `<style>` (`features.inlineStyles: false`). Share pages render
    markdown a stranger wrote and that CSP is the product's one real security property — if this
    stops passing, `/g/**` cannot move. `nuxt dev` cannot answer it; only a built, deployed
    response can.

## Contracts

- **What wrote work is a column, not a field (migration 0035).** `guide.client` is
  `cli@<version>` (from `x-passalong-version`), `mcp`, `hub`, `api` or `email` (work from email, see inbound.ts), decided by `writtenBy()`
  in `clients.ts` from the credential the middleware already checked, and replaced on every
  `PUT /v1/guides/:id` because the last write produced the markdown stored now. Never frontmatter:
  a field in the document travels with it and is re-published by whichever client pulls it next,
  naming the wrong writer. `""` is every row from before it — unknown, not guessed.
  `pnpm metrics` prints it. Frontmatter the parser cannot hold (a nested map, a `|` block, a list
  under a field that is not a list) is refused by name through `unheldFields()` in both parsers,
  never emptied.
- **Work is plain markdown.** Never introduce a field the frontmatter parser can't round-trip
  (strings and string lists only). `passalong export` must always be a complete backup.
- **The MCP server is served two ways and implemented once.** `packages/passalong/src/mcp.js` is
  stdio, for anything that can run a process; `apps/api/src/mcp-http.ts` is the same tools at
  `POST /v1/mcp`, for assistants that add remote servers. The HTTP one owns no logic — each tool
  dispatches back through the app's own routes with the caller's bearer token, so a rule lives in
  the route and nowhere else. Stateless on purpose: nothing subscribes, so nothing needs a session.
- **Work is one thing, and the agent reads it (docs/WORK.md, 2026-10-29).** No kinds, no required
  sections, no templates, no headings refused in one place and required in another: a title, a
  summary, and whatever text, pictures and files the next reader needs. A writer may say "done
  when"; nothing requires it. `tags` may describe it (`bug`, `feature`, `question`) and the hub
  shows the first as its label (`HubWorkTag`), but **no rule ever turns on a tag**. `parent:` says
  what it came out of — a customer request, a bigger piece of work, the old bug report sets
  (migration 0061 turned each `report` into parent work and dropped the table). `blocked_by:` is
  work that must be Done first; the parser defaults `stack_assumptions` and `tags` and nothing
  else, because defaulting `blocked_by` would write `blocked_by: []` into everything re-sent.
  Migration 0061 stripped `kind:` from every stored document and dropped `guide.kind`, `report_of`,
  `report_id`, `area` and `severity`. Handovers went with kinds: what an agent learned goes into
  the project's documents, where everyone finds it, not into a one-off document for one person.
- **Every piece of work moves the same way.** Draft, Ready, In progress, Done. **New work is Ready
  unless whoever wrote it says `status: draft`** (2026-10-15): Draft-first was tried, and addressed
  work sat forgotten in it — every draft in production was a task sent to somebody, untouched for
  over a day. Draft is for what a person should read first: a plan (`create_work` with
  `draft: true`), or anything an agent is unsure of. `publishProblem()` in `guide.ts` refuses new
  work that starts archived, and an edit that changes status. Whoever it is addressed to is told
  when it is Ready — at creation, or when a person marks a draft Ready on the status route
  (`announceGuide()`) — never while it is a draft. Marking it Ready may also say which repo it is
  for. Anyone in the team moves work between Draft and Ready; nothing held moves to Draft until it
  is taken back; only its author or an admin archives it; and archived work comes back to Draft,
  never straight to Ready (`unarchiveProblem()`), because archived includes finished. Email and
  webhooks file Ready (2026-10-17: alerts held in Draft reached nobody; who may send is already
  gated by the allowed senders and the key), and the day-old Draft reminder covers everything.
  **Done says how it got there**: `outcome` (migration 0054) is `finished` (a hand-in), `archived`
  (the status route, closing with nothing handed in) or, on work closed before 0061, `approved`;
  it is cleared when work leaves Done. **Ready work nobody took stays Ready, and a person is told**
  (2026-10-28, docs/LOOP.md): after `UNTAKEN_MS` (three days) the author and the team's owners are
  reminded every day until someone acts (`untaken()`, kind `untaken`; mailed the first time, feed
  and push each day after). It used to go back to Draft after a fortnight, and a draft reaches
  nobody — the product shelving work itself. Work for nobody in particular is a backlog and is not
  counted. **Not for me** is `pass` on work you do not hold: the sender is told why, it leaves your
  list (an `ack` row with `taken = 0`), and the thread gets a `passed` line.
- **A CLI too old for the server's rules is refused, not warned.** Every CLI call carries
  `x-passalong-version` (`VERSION` in `src/api.js`), and the token branch of the auth middleware
  answers **426** below `MIN_CLIENT` (`apps/api/src/clients.ts`) with the install command and the
  restart only a person can do. Rules deploy on merge while the text telling agents how to follow
  them ships with a reinstall, and for two weeks agents on 0.9.0 were refused by one and misled by
  the other. `passalong mcp` prints no update notice and an agent never reads stderr, so the
  refusal on the call it just made is the one text it is sure to see. CLIs up to 0.11.0 send no
  header and are known by Node's own `user-agent: node`; browsers, curl, SDKs and `/v1/mcp` are
  never gated. The floor is 0.20.0 until 0.22.0 — the CLI and tools that speak work — is published;
  then it is raised to 0.22.0 at once (docs/DEPLOY.md, the cutover). **Raise `MIN_CLIENT` only
  after that version is `latest` on npm** — a floor above what npm hands out refuses every agent
  with nothing it can install.
- **A team's board is one board, and anyone on it moves the work.** Everything in a team is seen by
  everyone in it, in the same place: `/hub/work` is four columns (Draft, To do, In progress, Done)
  and a card's column is the server's `stage` (`boardPlace()` in index.ts), never re-derived per
  viewer — four per-viewer tabs put one piece of work in different places for different teammates, which
  is what this replaced. Anyone in the team marks work Ready or Draft, stops an agent, gives it to
  someone else ("Give to…" on a card, `POST /v1/guides/:id/assign`) and reopens finished work
  (`MAY_MOVE` in claims.ts). Archiving and deleting stay with the author or a team admin
  (`MAY_DECIDE`). **Four columns, people inside (2026-10-30, the author's decision):** the four
  columns always fit the page and never scroll sideways; inside To do, work is grouped under who it
  is for — you first, then each teammate, each group, then Anyone (nobody in particular) — from
  `lanes` (`lanesOf()` in index.ts: a person, `#group`, or each of several named people, shown once
  under each, never copies). Dragging between To do's groups gives it there (the assign route);
  while a To do card is dragged every teammate and group shows as somewhere to drop it. Dragging
  between columns is only ever an act the work page offers (Ready, Move to Draft, Stop this agent,
  Archive, Reopen, Unarchive); nothing is dropped into In progress, because taking is "I'll do
  this" or an agent's `take`. Every drag has a card-menu item, which is the keyboard's way. A moved
  card fades until the board reloads from the server. A project filter (`?project=`, the
  `project` on each row) and Only mine (`?mine=1`) narrow the cards and never move one. A column
  per person with By person on by default (`?by=stage` to turn it off) was tried first (2026-10-16)
  and scrolled sideways once a team had more than a few people; it is gone. Ticking cards brings
  up a bulk bar (Give to…, Move to…, Archive…, each asked in place) that sends the single acts'
  routes four at a time and reloads once (`onBulk` in useHub.ts).
- **Finishing is final, and needs proof; there is no review stage (2026-10-15, docs/REVIEW.md).**
  In production 64% of hand-ins were archived with nobody answering them and none was ever sent
  back, so the stage cost more than it caught. `hand_in` ends the work: `claims.handIn()` then
  `complete()` keeps what was shown as a standing verdict (the work page leads with it as
  "Finished with"), lets go of the claim, and puts the work in Done with `outcome = finished`. A
  hand-in carries its `writeup` (capped at 500 characters, `WRITEUP_CAP`) and its evidence or
  checks — there are no write-up guides any more (`report_of` went in 0061). It is refused without
  proof a person can look at (`proofProblem()`): a screenshot, or a command and its line of
  output; checks answer for themselves, each run or shown. LOOP.md step 2 replaces that gate with
  the agent's judgement; it is unchanged until then. What could go wrong after is **Reopen**
  (`POST /v1/guides/:id/reopen`, for anyone in the team): back to To do with the reason at the
  top, a `reopened` thread line, and whoever finished it is told. Wanting another person's eyes is
  a request, not a stage: **Ask someone to check** on the work page makes more work for them, with
  this as its `parent`. Approve, send-back, verdicts, acks, mark-done and the In review column are
  gone, routes and all.
- **A customer is a column, never a field (migration 0057, docs/LOOP.md).** `key+support@` takes
  mail from anyone and makes a task (`receiveSupport()` in index.ts); who wrote it — address, name,
  and the tracking number `ref` they were sent — is stored on the `guide` row, because a field in the
  document would travel with every share link and every agent. The tracking number is its own value,
  not the work's id, and a reply joins a request only from the address that opened it, **and** with
  the number in its subject or a Message-ID of theirs in its References. Mail to a customer answers
  the subject they wrote under (`customerSubject()`, number at the end) and names their messages in
  `In-Reply-To`/`References` (`customer_subject`, `customer_mids`, migration 0060), so it is one
  conversation in their inbox. The reply box says where Send goes before it is pressed — "To <name>
  <address> · <subject>", the subject from `customer.subject` on `GET /v1/guides/:id/context` (built
  by `customerSubject()`, so it is exactly what is sent) — and after a send says "Sent to <name> ·
  <time>" in the same place, with the next request waiting on us. Mail to a customer goes out only from `POST /v1/guides/:id/customer`, which has no CLI command
  or MCP tool and refuses the remote MCP server: nothing reaches a customer until a person presses
  Send. It is the deliberate exception to every answer existing in all three places.
  A customer writing again on a request that is Done puts it straight back in Ready
  (`reopenForCustomer()`), even when it was archived: the one exception to archived work
  coming back to Draft, because a Draft reaches nobody and a waiting customer must not be left
  behind. Their first message is a `customer` thread line too, so the panel starts where they did.
  A customer left `CUSTOMER_WAIT_MS` (four hours) with no answer and nobody holding the request is
  `customer_waiting` to the author and the team's owners, pushed and mailed, once per wait
  (`customersWaiting()`, hourly sweep). Being reminded to tell the customer a fix is done is opt-in
  per team (`team.tell_customer`, migration 0059), set by an owner on the Support page and never in
  Settings; off, a finished fix wakes the request without those words, line or automatic draft.
  The Support page (`/hub/support`) is a register read in one call, `GET /v1/support`
  (`supportRequests()` in needs.ts, beside `supportState()`): state, the customer's latest words,
  `late` (past `CUSTOMER_WAIT_MS`), project and the change mark come from the server, never derived
  in the browser. A request's page is the conversation with the reply box pinned and the agent's
  draft in it, beside a facts panel; Mark solved archives, so its Reopen goes back through Draft
  straight to Ready for the same reason `reopenForCustomer()` does.
- **The reader is provider-agnostic, and only fills fields (reader.ts, docs/LOOP.md §1a).** It names
  what comes in — a title, a summary, an optional tag, the team group it is for, and its reason —
  and writes no sections. It calls the model through the AI SDK (`ai`) and each provider's own
  package: `READER_PROVIDER` (`anthropic`, `openai`, `google`, or `openai-compatible` for
  OpenRouter, Groq, Ollama and the like, which also needs `READER_URL`), `READER_KEY` (a secret)
  and `READER_MODEL` on the web Worker; without them, intake keeps its fixed rule (the subject or
  title as it came). A raw fetch to one vendor's API shape was the first version, and only OpenAI
  spoke it natively. It is shown the pictures as well as the words (`readerImages()`: up to three,
  PNG/JPEG/GIF/WebP, 4 MB each; from the box, only shots the writer uploaded), because a screenshot
  of an error is often the whole report and a reader that cannot see it asks the person to type out
  what the picture already says. Every answer passes `readVerdict()` or is thrown away whole — a
  tag from the list, a group that exists, lengths capped, no contact details — never patched.
  What was sent — a customer's words, an email, a webhook — is quoted into the body by code, not
  by the model, and when it arrived is said as a person reads it ("28 Oct 2026, 20:21 UTC",
  `arrived()` in inbound.ts), never the stored ISO string; documents filed before keep theirs. Its reason goes on the thread as a note; when it is unsure, the author and team
  owners get `reader_unsure`, pushed and mailed, with its one question. The same reader is the
  hub's box (`/hub/new`, `POST /v1/compose`): a teammate's own words become work, filed at once as
  theirs with no confirm step, and into one of the team's projects when the reader picks one
  (`projects` in `ReaderInput`: a top-level folder's id from the list, or none; `?project=` wins and
  the reader is not asked), linked through `POST /v1/folders/:id/guides` so who may link what stays
  in that route; the page offers Move (project, and `assign` for group or person) and Undo
  (delete, the words put back in the editor), and when the
  reader is unsure it files its best reading anyway, with its question on the thread and on the
  page as "Worth checking" (2026-10-29: asking first made people fill in a form for work the agent
  was there to shape). Its input is TipTap
  directly (`components/hub/Writer.vue`), not Nuxt UI, so it keeps the hub's look and policy:
  TipTap's injected stylesheet is off (`injectCSS: false`; the hub allows styles from its own
  stylesheet only) and its rules are `.writer` in styles.css; it renders inside `<ClientOnly>`.
  The same reader drafts replies to customers (`askDraft()`, `POST /v1/guides/:id/customer/draft`):
  written into the reply box for a person to edit and send, never sent and never stored, and checked
  by `readDraft()` (length, no contact details, no tracking number of its own). This reverses "the
  hub has no editor" for writing from scratch, by the author's decision (docs/LOOP.md §1a).
- **The runner takes only what a person marked (migration 0058, docs/LOOP.md §1a).** `passalong work
  --watch` on an always-on machine asks `/v1/tasks/next` with `alone: true`, so `next()` hands out only
  work with `guide.alone = 1`; it waits when there is none and keeps going past unfinished work
  (the requeue and `stuck` handle that one). The mark is a column a person sets from the work page
  (in its More menu, as **Let an always-on agent take this on its own**)
  (`PUT /v1/guides/:id/alone`), never frontmatter, and the route refuses the CLI and both MCP servers
  by name: work marking itself safe for the agent about to run it is what the mark exists to stop.
  Plain `passalong work` is unchanged — a person running it takes any ready work.
- **A finished child wakes its parent, from one place (docs/LOOP.md step 3).** A middleware after
  every write to `/v1/guides/:id/*` and `/v1/tasks/:id/*` calls `wakeFrom()`: when that work is now
  Done and its `parent:` is not, the parent gets a `noted` thread line (handed to its holder and next
  taker by `deliver()`) and its author and holders a `child_done` notification. One place, not six
  routes, because a new way to finish would otherwise be a parent that never hears; `wakeParent()`
  writes once per child (the child's id is in the line). It wakes and never closes: what the parent
  still needs is someone's call.
- **An issue is a piece of work; a set of them is only a parent.** Six bugs handed over are six
  things three people can take and finish separately — one document holding six has one answer,
  and "four of these are fixed" has no way to be said. `create_work` takes several in one call, each
  its own piece of work.
- **Screenshots are claimed by the document that names them.** A shot is uploaded before the work
  exists, so `shot.guide_id` is written on every write from the URLs in the markdown
  (`shotIds()`), never by the client. The `account_id` in that WHERE is load-bearing: without it,
  naming someone else's shot id in your markdown would claim their image, and deleting your work
  would delete it. Deleting work takes its shots; an hourly cron sweeps uploads nothing ever
  claimed.
- **Spacing comes from the scale, and the relationship decides the step.** `--s-1`..`--s-9` are a
  4px base and Tailwind's numbers are the same unit, so use them: `gap-2` for a label and its
  control, `gap-3` for rows inside a block, `gap-4` for blocks in a column, `px-4 py-3` for a card,
  `mt-8` between sections. Half-steps are off the scale — `-1.5`, `-2.5` and `-3.5` were all in use
  and one relationship had four different values, which is what made the interface look unfinished
  before anyone could say why. `-0.5` is the one exception: 2px inside a chip is a sub-unit.
- **Coral is active, ink is changed (the hub, 2026-10-29; active since 2026-10-30).** The palette is kept — cream ground,
  ink, coral — and the signed-in hub draws it like a drawing set. Its tokens are `.hub-app` in
  styles.css, put on `<body>` by `HubShell` so teleported menus and drawers inherit them; the
  landing and the share pages keep the `:root` tokens. In the hub: corners are 2, 3 and 4px
  (`--r-1`..`--r-3`, and `--r-pill` is 4px too, so no button or chip is a pill — only a dot is
  round); there is no serif (`--font-serif` is the grotesque; the share page in its iframe keeps
  its own); counts and ages are tabular figures. **Coral means active in the hub**: the current place on the
  rail and the phone dock (coral text), New (a coral fill), the primary action (`.btn.primary`
  reads `--primary`, which `.hub-app` sets to `--accent` with `--accent-fg` text), a chosen chip
  (`--primary` too), a checked control (`--chosen`) and the current tab's 2px bar. White as the
  active state in dark mode said nothing (2026-10-30, the author's call). **A change since you last
  looked is ink** (`--changed`, `bg-changed`/`text-changed`; on-rail cream on the rail): a 3px bar
  at a row's left edge with a "Changed" line naming what changed, and a dot on a project in the
  rail. It is held until the work is opened (`markSeen` in useHub posts `/v1/notifications/read`
  with `{ guide }`), and "changed" is an unread notification on that work. Focus stays a 2px ink
  ring (`--focus`/`--focus-halo`): coral is too light against the ground to be a keyboard user's
  only edge. `--link-hover` and `--emphasis` (`.linkish`, a toneless tonal/outline button) are ink
  in the hub and coral on the landing; a selected card keeps an ink ring. The "Changed · what"
  words sit on the title's line, after the title, and every notification kind has its words
  (`CHANGE_WORDS` in needs.ts, held to `KINDS` by its test). `--coral` is 2.6:1 on the canvas, so
  on cream it is a bar or a fill under dark text, never small text; `--accent` is the readable
  5:1, and it is the one fill for a primary everywhere, the rail's and dock's New included (light
  coral stays only as text and a bar on the ink rail). Settings marks what needs you with the ink
  change dot; amber is never a "needs you" mark. The rail is solid ink (`--rail`) in both themes. Each project owns one line
  colour from six (`--project-*`, `toneOf()` in `app/utils/projects.ts`): the folder's own colour,
  a folder coloured coral drawn stone (nothing near coral or blue), and one derived from its id when it has
  none. A project's colour is drawn as a line (a 3px bar), in the rail and in the register alike.
- **A surface's edge is a one-pixel rule.** In the hub `--edge-shadow` is a 1px ring of
  `--line-strong` and a raised surface keeps the deeper cream (`--surface-raised`) against the pale
  ground, so cards, lists and panels read as ruled sheets, not soft cards. A register is not a pile
  of cards: unboxed cells in columns across rows, the column labels stated once above it, a 1px rule
  between rows and nothing around each cell (Needs you). Prefer a real
  `border` / `border-b border-line` on new work; a heading's rule is `border-fg`. Only what floats
  (a menu, a toast, the thread drawer) keeps a lift shadow. A row inside a list sits flush, so it
  rounds its ends to the list's own radius; nested surfaces nest their radii. Every `.btn` presses
  to `scale(0.96)`; `.static` opts out. A button in the same row as an input or a code well is a
  full-height `.btn`, not `.btn sm`: the field is `--control-h`, and a small button beside it sits
  off its line.
- **Long values are shortened by unit, never by pixel.** `shorten()` (`app/utils/shorten.ts`) drops
  whole words, then whole path segments, so what is left is a repo name or a host and not
  `techchak-backend (https://g…`. Do not reach for `truncate` on a value a person has to read, and
  do not put the rest in a `title` tooltip: it is delayed, unstyled and unreachable on a phone.
  `<AppShorten>` renders the shortened value and opens it in place; a link needs no disclosure,
  because the whole thing is at the other end of it.
- **A row's action says what kind of act it is, not just how urgent.** One slot on a card can hold
  five different things, and position and size alone told the reader they were the same control.
  The mark carries the kind — `copy` for the clipboard, `open` for going somewhere, `reveal` for a
  control that opens something in place (with `aria-expanded` and a chevron that turns over) — and
  the tone (`primary`, `outline danger`, `outline warn`) goes on carrying urgency. A control that
  opens a form is labelled with the same words as the menu item that opens it. Any button that
  wears an icon **and** calls `copy()` needs `<span data-label>` around its text: `copy()` swaps
  that element, and swapping the button's own `textContent` would eat the icon for good.
- **Tags are a controlled vocabulary, so they are normalised at both ends.** `tag()`/`tagList()`
  (in `apps/api/src/guide.ts`, mirrored in `packages/passalong/src/guide.js`) lowercase a tag and
  join its words with a hyphen. `parseMeta`/`parseFrontmatter` normalise what they read and the
  publish path writes the result back into the document with `setList`, so work written before
  there was a rule reads as one style everywhere immediately and stores as one style the next time
  its author publishes it. That two-ended shape is deliberate: re-spelling the markdown is the
  author's to do, and there is no SQL migration that can rewrite frontmatter inside a document.
- **Every row in a list has the same anatomy.** A fact only some rows carry goes on the line of
  pills above the title or after it — a work label (`HubWorkTag`) sits after the title — never in
  front of it: a chip that only some rows have moves where their titles start, and the list stops
  scanning as a column. Titles share one left edge.
- **The checkout is hosted, the mode is read off the key, and the webhook is what writes a plan.**
  Payments go through **Bachs** (docs.bachs.io), a merchant of record — not Stripe, not Paystack,
  both of which were removed. Bachs hands back a page of its own for checkout and another for
  billing (`POST /v1/billing/portal`, a fresh link per click, the customer read off the
  subscription), because the alternative is this product handling card details. Both products are
  **flat**: Team is $20 a month for up to `TEAM_SEATS` (10) people and Solo is $5, so there is no
  seat count to change and no seat route; `POST /v1/teams/:slug/subscribe` is **owner only** and
  refuses a team already over ten, which is set up by hand until a recurring quantity has been
  proven in the sandbox. `modeOf()` derives test-versus-live — and the host — from the key itself
  (`sk_sandbox_` against `sk_live_`) rather than a setting beside it: a flag somebody has to
  remember to flip is how a product spends three weeks taking payments that were never real, and
  the hub badges every plan block when the key is a sandbox one. Every key is an optional binding:
  without them the tier is unavailable and the hub says so, rather than offering a button that
  cannot work.
- **A billing webhook is the only write in the product that no person authenticates**, so the
  signature over the **raw** body is the entire credential. The route reads it with `c.req.text()`
  and `verifyWebhook()` checks it before anything parses: parse first and you verify a different set
  of bytes than the one that was signed, which is the classic way this is got wrong. `billing.ts`
  **imports no sibling `.ts` on purpose** — it has to be unit-testable and a value import of a
  sibling is what Node's type stripping cannot resolve, so `eq()` is a local copy of
  `timingSafeEqual` rather than an import (the same reason `chatCard` lives inside notify.ts). Bachs
  signs `${t}.${body}` with HMAC-SHA256 in `X-Bachs-Signature-V2: t=…,v1=…`, repeating `v1` once per
  valid secret during a rotation (any match counts), and **the timestamp is checked**, because
  without a tolerance a captured "subscription is active" replays forever. Delivery is at-least-once
  and out of order, so an event older than the one that set the stored plan for the same
  subscription is dropped (`plan_since` holds Bachs's `created_at`). An event from a *different*
  subscription than the stored one never ends it — a late lapse is an old subscription ending — and
  never replaces one still paying: that is a second checkout completed for the same plan, so the
  stored one stays bound and admins get `billed_twice` to refund the other. Renewing a lapsed plan
  with a new subscription is applied. Bachs cancels at the end of the period already paid for, so a
  cancelled plan stays paid and the webhook stores when it stops in `plan_ends` (migration 0055, on
  account and team; cleared when resumed or lapsed), which the hub states beside the plan — never
  `plan_until`, which is a gift's end and is enforced by the hourly sweep. Three rules in the mapping, each
  of which was a way to get this wrong: `past_due` is **not** lapsed, since downgrading on the first
  failed attempt makes an overnight bank decline look like a cancellation; an event that grants no
  seats leaves seats **untouched**, since writing zero would unseat the whole team on a lapse; and an
  event nobody mapped answers **200**, because an endpoint that errors on what it does not care
  about is one the provider retries all day and then disables, taking the events that do matter
  with it. The webhook path is public by **prefix**, not by the exact route: a webhook aimed at the
  wrong URL is a real thing that happens during setup, and the middleware answering it with "not
  signed in — sign in at /hub" sends whoever is reading the provider's delivery log to a screen with
  nothing to do with the problem.
- **A plan belongs to a team, and an account's ceiling is derived from it — never copied onto the
  account.** §11 sells the team, so the decision that follows is that a *free* member of a paid team
  publishes without a ceiling: the seat lifts whoever sits in it, paid for or not. `quota()` asks
  "is this account in a team on `plan = 'team'`?" on every read and `ceilingFor()` answers. Writing
  the answer onto `account.sync_limit` instead would mean rewriting a row per member on every plan
  change, membership change and failed payment — and the row that gets missed is an account still
  unlimited after the team stopped paying. **`UNLIMITED` is `0`, not `Infinity`**: the number crosses
  a wire, `JSON.stringify(Infinity)` is `null`, and the hub already read a falsy limit as no limit.
  `plan` is **one column with three values** (`free`, `team`, `lapsed`) rather than a plan beside a
  status, because `free` + `lapsed` is not a state a team can be in and two columns can store it.
  **Lapsed is read-only, and read-only is narrower than it sounds**: what stops is work flowing *in*
  — new work addressed to the team, a new member joining, a change to its folders. What must never
  stop is work already in flight closing, so taking, handing in and passing still go through: they
  belong to whoever does the work, who is not the person who missed the payment. Reading, export and
  share links are untouched, because
  §10 promises no lock-in and withholding a team's own work to collect a debt is the thing that
  principle forbids. Refusals are **402, not 403** — nobody lacks permission, and the two are fixed
  in completely different places. **Seats are counted where somebody joins**, not at checkout: a
  count taken when a seat is bought drifts the first time a member leaves, and stays wrong
  invisibly. An existing member re-opening their invite link is never refused, since they already
  occupy the seat the check protects.
- **The same capability is sold twice, and the column says which was bought.** A seat on a paid
  team and a Solo subscription both remove an account's ceiling; `account.plan` (migration 0017,
  `free`/`solo`/`lapsed`) is shaped exactly like `team.plan` and holds the personal one. `solo`
  rather than reusing `team` as the value, because a column that cannot say which was bought cannot
  answer "why does this account have no ceiling" without going and looking at four other tables.
  **Lapsing falls back rather than down**: a lapsed plan lands on whatever that account would have
  had without one, which for somebody who predates the cutover is their grandfathered ceiling and
  never zero by surprise. `POST /v1/subscribe` is the personal checkout and takes no seat count —
  the plan is one person by definition, and a quantity field would be a way to ask a question with
  one answer. The webhook resolves an account the same two ways it resolves a team, by
  `subscription_id` and then by the metadata key, because a first subscription has an id nothing has
  stored yet; checkout writes exactly one of `team` or `account` into that metadata, so the two
  subjects can never both match.
- **What an account may sync is a name, not a number, and existing accounts keep what they had.**
  `Ceiling` is `{ plan, limit }` with three plans — `unlimited` (a seat on a paid team), `free` (a
  ceiling, and `limit` is the only case where that number means anything), `none` (no plan, nothing
  syncs). It was one integer where `0` meant "no ceiling", which worked for two answers and cannot
  survive a third: removing the free tier adds "may sync nothing", whose obvious encoding is also
  zero, and **every consumer tested `me.limit` for truthiness** — so both zeroes read as unlimited
  and the account that may sync nothing would be told it may sync everything. The hub, the CLI and
  `isFull()` all switch on the name now. `account.grandfathered` (migration 0016) is set on every
  row that existed when it ran: withdrawing the free tier is a decision about people who have not
  arrived yet, and applying it to accounts that have been syncing for months under a different
  promise is §10 with extra steps. A column rather than a created-before date, because a magic
  timestamp is wrong everywhere at once the day the cutover moves. **`FREE_SIGNUP` defaults to
  open in code and is `"1"` in production again (reopened 2026-10-08; it was `"0"` from 2026-09-11)** — it is the cutover switch: it defaults open so a deployment that forgets the var keeps the old
  behaviour rather than locking people out by omission. The publish
  refusal is two messages, because the two states are fixed in different places — over a ceiling is
  solved by archiving, no plan is solved by buying one, and "archive some" to somebody with nothing
  synced is nonsense.
- **The free tier is counted in one place.** `apps/api/src/quota.ts` holds `COUNTED` (the statuses
  that occupy room), `limitFor()` (per-account `sync_limit` beats `FREE_SYNC_LIMIT`, zero means
  unset) and `isFull()`; `quota()` in index.ts is the only query, and both `/v1/me` and the publish
  refusal read it. They were separate before and disagreed — the banner counted all the work the
  account had and warned people at a number the server was not enforcing.
- **`consumed` means archived or Done, never "I implemented it".** It is the shelf: off the board,
  out of the free tier's count, reversible, and hidden from every cut on the work page except
  `archived`; `outcome` says which way it got there. Whether it works is the hand-in's evidence,
  not a status.
- **Not for me is a row, and it says why.** `pass` on work you do not hold (`recordDecline()`)
  writes an `ack` row with `taken = 0` and a required note — "not me" without "why" leaves the
  sender exactly where the silence did — which takes it off the decliner's list, tells the author,
  reaches the team channel, and writes a `passed` thread line. The `ack` table is otherwise history:
  readers no longer answer "I'll do it" (that is `take`), and nothing writes `taken = 1` any more.
- **Being named outranks being in the room.** The inbox orders `to_account_id = you` before
  everything else, then by age: someone writing your handle chose you, while work sent to a team
  you happen to be in chose nobody, and sorting both by age alone buried the one addressed to you
  under whatever the team sent that day. Every surface showing that lane says how it reached you,
  because the order is only honest if the reason for it is visible.
- **Nothing a non-author does to work happens in silence.** Taking, passing and handing in tell
  the author (`taskEvent()`), and so do archiving and un-archiving. `reopened` exists because archiving told them
  and un-archiving did not, so work could move off somebody's board on another person's say-so without a word;
  the pinning test in `apps/api/test/guide.test.mjs` walks the routes a non-owner can reach and
  fails if one stops telling them.
- **Three addresses, and the inbox ranks them.** `to:` inside a `team:` is `@handle` (one person),
  `#group` (the people who do a thing, `team_group` + `group_member`), or absent (the whole team).
  The lane orders handle, then group, then team drop — and every surface showing it says which of
  the three reached you, because the order is only honest if the reason for it is visible. Two rules
  follow from a group being more than one person: the team-wide clause must exclude both narrower
  addresses (or work for `#frontend` lands on everyone anyway), and one member taking it clears it
  from the others' lanes — never from the lane of someone named by handle, who was asked
  personally and whose ask nobody else can answer. A group is an address, not a permission: it
  holds only people already in the team, and it has no roles.
- **Mail is written twice, and the plain-text half is written first.** `sendMail` takes lines and
  an optional HTML string; `mail-html.ts` builds the second from a fixed kit (`shell`, `button`,
  `command`, `quote`, `p`, `mono`) — tables, inline styles, a system font stack, no flexbox, no
  media queries, no SVG, and every colour stated, because Gmail on Android inverts a light mail
  rather than reading `prefers-color-scheme`. The masthead's mark is an absolute PNG with the
  wordmark beside it as text: images are blocked by default for a sender nobody has replied to.
  Anything a person typed — a title, a reason — goes through `esc()` on the way in.
- **Every answer exists in all three places.** The hub, the MCP tools and the CLI: `take`,
  `progress`, `hand_in`, `pass` and `ask` for whoever does the work, reopen for finished work that
  is not right, Ready and Move to Draft, archive. A signal that exists in only two of them is one a
  third of the product's users cannot send, and the mail that tells someone what to do next can
  only name commands that exist. The reader's old answers — the ack and the verdict — went with
  their routes (`ack`, `verdict`, `approve`, `finish`, `mark_done`); `/hub/answer/:id` still
  forwards an old mail's link to the work's page.
  The hub says each in plain words rather than the command's name, and says them the same way on
  every surface of the hub: `take` is **I'll do this**, `release` is **Stop this agent**, archiving
  is **Archive** and **Unarchive to Draft**, finishing is **Finish**, and finished work comes back
  with **Reopen**; recalling work you sent is **Make it private again**, `pass` on work you do not
  hold is **Not for me**, and the take command is **Copy the command for an agent**. The work page
  leads with one act for the work's state, at most one beside it, and keeps the rest under **More**.
  A button whose name cannot say
  what it does gets a line of visible text beside it, never a `title` tooltip.
- **Google Chat gets a card; nothing else does.** Chat cannot unfurl a link — previews there come
  from a Chat app registering URL patterns, and a team connects an incoming webhook — so `chatCard()`
  in `notify.ts` builds the preview from what we already know. It must stay built rather than
  scraped: the share key in a share link is its authorisation, `robots.txt` disallows `/g/` for
  that reason, and an unfurl hands the key to somebody else's fetcher to cache. No image on the
  card for the same reason. Only bedrock `cardsV2` fields, and only for `chat.googleapis.com` —
  Google refuses a payload carrying a field it does not know, and a refused post is a silent one.
  The card lives in `notify.ts` beside `line()`, and has to: two test files import that module, and
  a value import of a sibling `.ts` is what Node's type stripping cannot resolve.
- **Ids** are 8 chars from a no-lookalike alphabet; they are addresses, not secrets. The
  **share key** in the link is the secret. Owner access needs the bearer token.
- **Accounts are not tokens any more (migration 0005).** Identity is email + password (PBKDF2-
  HMAC-SHA256 via WebCrypto — a Worker has no bcrypt). The hub authenticates with an HttpOnly
  session cookie; the CLI and MCP servers send a bearer token from the `token` table, which is
  named, revocable and records `last_used`. One middleware accepts either, so routes never care
  which. `POST /v1/accounts` still mints an **anonymous** account for invite links — an account
  nobody has claimed yet (`passalong login` is browser approval or `--with-token` on stdin, and
  never mints one); `POST /v1/auth/password` claims it. Everything secret
  is stored as a SHA-256: tokens, session ids and reset codes are all bearer credentials.
- **Analytics are sent from the Worker, never the browser** (`src/analytics.ts`). A share link is
  `/g/:id/:key` where the key is the secret, and every web analytics SDK reports the page URL — the
  obvious integration would have posted users' share keys to a third party. Share pages also run no
  script, and that CSP is the product's one real security property. So: **event names and
  categorical props only**. Never an id, handle, email, team name, title or URL fragment. The
  session id is the current hour, so nothing points back at a person. `count()` in `index.ts` fires
  events through `waitUntil`; with `APTABASE_KEY` unset nothing is sent, which is the state in dev.
- **Aptabase's ingest answers 200 to almost anything** — a bogus key, a malformed key, no key at
  all — so a successful response proves nothing and the dashboard is the only evidence an event
  landed. Two traps cost an afternoon: the endpoint is `/api/v0/event` (**singular**, one object),
  because the `/api/v0/events` batch form in their wiki silently dropped everything; and
  `sessionId` is read as a timestamp, so anything that parses as old is rejected with "Session is
  too old". Both are pinned by tests in `test/analytics.test.mjs`.
- **Password strength does the work the KDF cannot.** The Workers runtime caps PBKDF2 at 100,000
  iterations (above that: `NotSupportedError`, and only on the real edge — local workerd allows it,
  which is how a broken sign-in shipped once). That is below current OWASP guidance, so the
  compensating controls are a 12-character minimum and a Have I Been Pwned range check on every
  password set. The check sends five hex characters of the password's SHA-1 and matches suffixes
  locally, and **fails open**: someone else's outage must not block a sign-up. Verify anything
  runtime-policed with `wrangler dev --remote` — but note it writes to *production* D1.
- **`account.token_hash` is retired, not gone.** Dropping it needs a table rebuild (SQLite refuses
  DROP COLUMN on a UNIQUE column), and that rebuild is unsafe here: every child table references
  `account(id)`, mostly `ON DELETE CASCADE`, so `DROP TABLE account` either deletes all work and
  membership or fails on `team.created_by`, which has no cascade. `PRAGMA defer_foreign_keys` does
  not save it — D1 rolls the whole migration back. Both were tested. Inserts write a `retired:`
  marker that can never equal a SHA-256; nothing reads the column.
- **Status lifecycle**: draft → published, with `consumed` as the author's shelf. **What is
  accepted and what may be set are two different lists**, and `guide.ts` holds both: `STATUSES` is
  what parses, `SETTABLE` is what a write may choose. `promoted` is in the first and not the second
  — work carrying it keeps it and still re-sends, and nothing can acquire it. Shrinking
  `STATUSES` instead would have been the obvious move and the wrong one: the value lives in
  frontmatter inside markdown in other people's repositories, and `validate()` refuses a status it
  does not know, so work exported a month ago would stop re-sending today. Both write paths
  enforce it and they enforce it differently, because they are asked different things: `PATCH
  /v1/guides/:id/status` refuses `promoted` **by name**, since an installed CLI still calls it and
  "must be one of …" reads as a typo rather than as a retirement; `PUT /v1/guides/:id` silently
  keeps `promoted` when the stored row already had it and downgrades to `published` when it did
  not, checked against the row rather than the markdown somebody just sent. That second check is
  also what keeps the free tier honest — `quota.ts` counts `published` and `promoted` as the
  statuses occupying room, so a settable `promoted` was an unlimited free tier for anyone who
  noticed. The server stores status both in the `guide.status` column and inside the markdown
  (`setField`) so a fetched `.md` is truthful.
- **Teams (M2).** `team`/`membership`/`invite`/`pull` tables (migration 0002). Work's `team_id`
  makes it readable by members; `to_account_id` addresses one member. Only the author or a team
  admin archives or deletes. Every fetch by id is a `pull` row; the sender sees them as
  `pulled_by`. Handles are global and unique.
- **Proof does not outlive the work.** A hand-in's screenshots are claimed for the work, and
  `evidenceOn` reads the standing verdict's `detail` as well as claim evidence so an author's edit
  cannot release them. `sweepProof` (hourly, `shots.ts`) deletes closed work's proof `PROOF_DAYS`
  (5) after it closed — anything the work holds that its own markdown does not name — and rewrites
  the text that pointed at it to say it was removed rather than leave a broken image. It is a fixed
  rule for every account: the Settings switch that turned it off (`keep_forever`, migration 0044)
  was removed on 2026-10-30 and its column dropped (0065), so nothing can re-decide it per account.
- **The share page is the document, once.** `/g/:id/:key` renders the markdown in its author's
  order, with the work it came from and the work made from it as links, and nothing about who
  answered it: the key in the URL is the whole authorisation, so the page is public to whoever
  holds it. There is one view; `?view=verify` and its layout went with kinds. It runs no script.
- **Joining is web-first.** `/join/:code` mints an account, claims a handle and accepts the
  invite in the browser (`public/join.js`), because the person opening an invite is often the one
  who has never used the tool — a tester, a designer. The hub covers the rest of what used to need
  a terminal: claiming or editing a handle, and creating a team. Nothing here is a new endpoint;
  `POST /v1/accounts`, `PATCH /v1/me`, `POST /v1/invites/:code/accept` and `POST /v1/teams` already
  existed. Keep it that way — a browser-only path that needs its own API is a second product.
- **Setting up is a page, run once by whoever starts the team (`/hub/start`, docs/LOOP.md §0
  step 3).** Seven steps — team, who's on it, who does what, projects, what to know, where work
  comes in, agents — each skippable, each writing through the routes that already exist (teams,
  invites, groups, folders, documents, inbound, connectors). The one thing added is where the person
  got to: `account.setup` (migration 0066), JSON of steps done and skipped and whether it was put
  away, read and written only by `apps/api/src/setup.ts` (`PUT /v1/me/setup`, `setup` on
  `/v1/me`), so it resumes on any device. Accounts already in a team when 0066 ran start with it put
  away, and someone only invited is never offered it: setup is for a team's starter. Invite by email
  says "Not emailed" when the server has no mailer, with that person's own link to copy, rather than
  pretending. A project's repo is `folder.repo` (migration 0067, `repoOf()` in folder-tree.ts), set
  by POST and PATCH `/v1/folders` and carried by both MCP servers' `save_project`/`find_projects`
  through those routes; the README prompt names it for the person's own agent, which Passalong never
  runs. `/hub` sends a teamless, never-started account to setup from its route middleware — on the
  server, with the session cookie, on a first load — so Needs you never renders on the way.
- **Needs you (`GET /v1/needs`, `apps/api/src/needs.ts`) is the hub's first screen, ranked on the
  server.** What waits on the signed-in person, each piece of work once under its most pressing
  reason, in this order: a customer waiting on us (no `answered` since they last wrote; longest
  first), an agent asking (the holder's account or the author), a hold gone quiet (lease run out),
  work sent to you or a group you are in that nobody took, and your work whose last act was
  someone else passing it back or reopening it. Beside it, open customer requests (ours first) and
  work finished in the last seven days with Reopen. Each row carries its project (the top folder
  above the folder it is linked into, one this account can see) and `changed`, the latest unread
  notification on it in a few words. It owns no table and imports no sibling, so
  `test/needs.test.mjs` runs it against real SQLite. The rank is the server's; the hub never
  re-sorts it. `GET /v1/folders` carries `open` and `changed` per folder for the rail's projects.
  Open requests from the same customer under the same title fold into one row at the older one's
  place, the others' ids in `also` (needs.ts), so one person writing twice is one thing to answer.
  The hub leads with the first row as **Next** and groups the rest by reason without re-sorting;
  `/hub/next` walks the same rank one at a time (j/k), with no route of its own.
- **The board (`GET /v1/board`) is the old home queues, defined in SQL.** Waiting = work sent to
  you (or your teams, by others) that you have not opened, ordered as the next contracts say. In
  flight = yours, addressed to a person or team, with `NOT EXISTS` a pull by anyone but you
  (`stale` past 7 days). Landed = yours that someone else has opened. "Someone else pulled it" is
  the test — your own fetch from another machine is not the work landing. The hub reloads after a
  status change rather than moving rows itself; re-deriving buckets in JS is how the two drift
  apart. `passalong board` and `find_work` with nothing read `/v1/tasks` and `/v1/working` instead:
  what needs you, who is on what, and what is ready.
- **The log (`GET /v1/log`) is the only surface ordered by time, and it owns no table.** Everything
  else is ordered by state — the board's queues, the work page's rank — so nothing could answer
  "what did I get done in September", and the one thing the product recorded everywhere and showed
  nowhere was your own work. `log.ts` is a `UNION ALL` over rows that already exist: `guide.created`
  for a publish, and the `pull`, `verdict` and `ack` rows for the rest. **Never give it a table.**
  The moment it has its own rows it can disagree with the board, and the whole reason it cannot
  today is that there is nothing to keep in step. Two rules follow from what it is. It renders
  **no counts** — no totals, no streak, no per-month number: a count of work sent is a metric of
  the wrong thing, and it is the shape this becomes if allowed to summarise (PRD §9). And every
  surface printing it **must say it is what went through Passalong, not everything you did** —
  work never written down has no row, so an empty month is indistinguishable from a quiet one, and
  a page that does not say so lies about the exact thing people open it to check. The pull arm is
  `GROUP BY guide_id` on purpose: `recordPull` writes a row per fetch of `/v1/guides/:id` and the
  CLI resolves an id by fetching, so one `take` can leave two rows seconds apart. The board wants
  both; a log rendering both says you opened the same thing twice in a minute. Nothing in the hub
  shows it now (Activities went with Needs you, 2026-10-29); agents have no tool for it.
- **Product-wide numbers come from `scripts/metrics.mjs`, never from a route and never from
  Aptabase.** PRD §14's figures are about every account at once, and the API has no reader above an
  account: an endpoint for them would have to invent an admin credential — a new way into everyone's
  data, added so one person can read four numbers. Aptabase cannot answer them either, and that is
  by design rather than by omission: two of the four need sequences joined on who did what, while
  `analytics.ts` sends categorical props and never an id, because a share key in a page URL must not
  reach a third party. So the joins happen against D1, on the operator's machine, and nothing
  leaves it. Note which database: `--dev` reads the one Nitro manages under `.wrangler/state`, found
  by scanning rather than hardcoded because the file is named for the `database_id`. Two of the four
  metrics also cannot be computed as §14 originally worded them, and the script **prints the caveat
  beside the number every run** — activation undercounts for CLIs older than 2026-10-14, whose
  `pull` served a local copy without calling the API unless the work had a team, and the quality proxy asked for
  `consumed`, which changed meaning. A report that quietly substitutes a near-miss is worse than
  one that says so.
- **The hub is live, and the stream owns no table.** `GET /v1/events` (`src/events.ts`) is
  Server-Sent Events for the signed-in account: `note` for each notification addressed to it (a
  toast in the hub, `HubToasts`) and `change` for any work it can see whose hold, progress note
  or standing verdict moved (a quiet refresh — progress notes never toast). It polls D1 every 3 seconds
  from a cursor that is a **time, not a row id**, because notifications coalesce by bumping `at` on
  an existing row; migration 0033 indexes the three times it reads. Each connection ends after four
  minutes and the client resumes from `Last-Event-ID`. The hub reads it with fetch
  (`useLive`), not EventSource, because EventSource cannot send the bearer token a token sign-in
  uses, and it disconnects while the tab is hidden and catches up — a few toasts and a count —
  when it is shown. Durable Objects would push without polling; this needed no new infrastructure.
- **Push reaches a device only for what needs you, and says nothing it should not.** Web Push
  (`src/webpush.ts`: VAPID and RFC 8291 encryption on WebCrypto, no library — `web-push` needs
  Node's crypto) goes out from `notify()` through a hook the app sets (`onPush`), for `PUSHED`
  kinds only: sent to you, taken, finished, reopened, went quiet, stuck on you. A
  phone that buzzes for every open gets muted. Devices are `push_subscription` rows (migration
  0034), one per browser, turned on from Settings — permission is asked on the button, never on
  load, because a refused prompt cannot be asked again. `private` is per device, since a lock screen
  is. A 404/410 from the push service deletes the row. `public/sw.js` answers **one request only**,
  the `POST /hub/share` a phone's Share menu sends (`share_target` in `site.webmanifest`), and leaves
  every other request unanswered, so the pages it controls, share pages included, load exactly as
  without it. A share carries no credential, so the worker uploads nothing: it keeps the pictures and
  words in the browser's cache and sends the page to `/hub/new?shared=1`, where the signed-in box
  uploads them as a paste. The hub registers the worker on load (registering asks nothing; push
  permission is still asked only on its button). iPhones cannot share to a website, so they use mail:
  `key+new@` (`ANYTHING` in inbound.ts) files through `POST /v1/compose` as the box does, reader and
  pictures included, from allowed senders only, written by `email`. Two events had no way to
  reach you and now do: `blocked` (a progress note starting `BLOCKED:`, first time only) and your
  own agent's `task_finished`, both sent without an actor so `notify()` does not drop them as
  self-inflicted. Keys: `node scripts/vapid-keys.mjs`; without `VAPID_*` the hub says push is not
  set up. iOS delivers web push only to the home-screen app.
- **Admin alerts are notifications for whoever runs Passalong** (`src/alerts.ts`). `alertAdmins()`
  sends one to every `role = 'super'` account and everyone in `ADMIN_ACCOUNTS`: a feed row through
  `notify()`, mailed the first time. Adding one is a kind in `KINDS`, its sentence in `line()`, an
  entry in `ADMIN_ALERTS` (with its mail subject) and a call where it happens. Today there are two:
  `signed_up`, on a password signup and on an invite account's first password, and `billed_twice`,
  when a second subscription starts paying for a plan another already pays for.
- **Email verification records, it does not gate** (migration 0050). Every signup and every change
  of address sends a single-use link (`email_verify`, sha256 only, a week long, tied to the address
  it was sent to); opening `GET /v1/auth/verify/:code` sets `account.email_verified` and redirects to
  `/hub?verified=1` or `?verified=expired`. A used reset link also counts, since it reached them.
  `POST /v1/auth/verify` sends another. The hub (`Shell.vue`) reads `?verified=` once and clears it,
  and shows a "Confirm your email" callout with a resend while it is unproven. Nothing is refused to an unverified account; accounts that
  had an email before 0050 were marked verified as of their creation.
- **Notifications (migration 0003).** Every loop-closing moment is a `notification` row addressed
  to whoever should hear it: `handoff` (work sent to you), `task_claimed`, `task_finished`,
  `sent_back` (reopened), `declined`, `asked`, `joined` and the rest in `KINDS`. Rows first,
  delivery second — mail is a channel over the row, so the feed works with no mailer configured.
  A unique index on `(account_id, kind, guide_id, actor_id)` coalesces repeats (bumping `at` and
  `times`), and mail goes out only on the first occurrence. `notify()` never throws: a
  notification must not fail the action that caused it. `line()` in `notify.ts` is the single
  place the wording lives — CLI, MCP and hub all print the server's `text`.
- **Server-first.** All work lives on the server; with no token, writing and reading by id
  refuse with the login command. Nothing about work is written locally unless asked
  (`take --save`, `export`).
- **CSP on the web view** (`default-src 'none'; style-src 'self'; font-src 'self'`) is what makes
  rendering owner markdown for other viewers safe. Don't loosen it to add scripts or inline
  styles; put styles in `public/styles.css`. `font-src` is same-origin only: fonts are served
  from `public/fonts`, never a CDN, for the same reason Preact is vendored.
- **Share pages are `noindex`** and `robots.txt` disallows `/g/`. The share key is the secret, so
  the page must never end up in a search index. Everything under `/g/` also sends
  `x-robots-tag: noindex, nofollow, noarchive` (route rule in `nuxt.config.ts`, and `VIEW_HEADERS`
  in `apps/api/src/index.ts` for the raw `.md`): a disallowed page's meta is never read, and the
  `.md` has no `<head>`. No canonical link on a noindex page either.
- **The hub shows work by framing it, never by rendering it.** `/hub/g/:id` is the work's
  signed-in page: who holds it, the thread, what it was finished with, and all the work it is tied
  to, from `GET /v1/guides/:id/context`, which records no pull. The document itself is the share
  page at `?embed=1` in a sandboxed same-origin iframe with no `allow-scripts`, which is why the
  hub's policy carries `frame-src 'self'` and nothing wider. Turning its markdown into the hub's own
  HTML would put a stranger's document on the one page that runs script and holds the token. Row
  titles open this page; the share link stays one click away on it. Its sidebar leads with
  **Progress** (`utils/progress.ts`): what happened to it in order, built from that same context —
  claims, hand-ins with their screenshots, follow-ups — and ending on where it stands. It owns no
  table, for the reason the log owns none, so a hold that was released is gone from it with its
  claim row; receipts written by a retired verdict or an archive are not "opened".
- **The blog is markdown in the repo, bundled into the Worker.** Posts are
  `apps/web/content/blog/<slug>.md` with `title`, `date`, `description`, `author` and `draft`.
  A Worker has no filesystem, so they are Nitro server assets (`nitro.serverAssets` in
  nuxt.config.ts) read through `useStorage("assets:blog")` in `server/utils/blog.ts`. `/blog` and
  `/blog/**` are `noScripts` with `VIEW_HEADERS` like docs. A draft renders at its address, noindex,
  and is left out of the index, `/blog/rss.xml` and the sitemap. `/blog` itself is a draft in
  shared/pages.ts until its first post goes out: publishing is `draft: false` on the post, on
  `/blog`, and a line in public/llms.txt (test/public-pages.test.mjs insists).
  `/learn/:slug` is the same reader over `content/learn` (`postBySlug(slug, "learn")`) for topic
  guides rather than dated posts. Its one publish switch is the page's entry in shared/pages.ts:
  unlisted or draft there, it renders noindex with no canonical or JSON-LD, whatever its frontmatter says.
- **The landing's JSON-LD is a data block, not script.** `server/plugins/csp.ts` skips
  `application/ld+json` when deciding whether a page runs script; without that the landing would
  get the hub's nonce policy.

## Workflow

```sh
pnpm install
pnpm -C packages/passalong test         # the work format, the CLI and the stdio MCP server
pnpm -C apps/api lint                   # tsc over the mounted app
pnpm -C apps/web lint                   # vue-tsc over the pages, and apps/api through the mount
pnpm -C apps/api db:migrate             # local D1 (re-run if wrangler.jsonc's database_id changes)
pnpm dev                                # the whole thing on :3000 — pages and API
PASSALONG_API=http://localhost:3000 PASSALONG_HOME=/tmp/rh packages/passalong/bin/passalong login   # opens /device: approve it in the signed-in hub
pnpm -C apps/api db:migrate:remote && pnpm -C apps/web run deploy
pnpm metrics --dev                      # PRD §14, read straight from D1 (--remote for production)
```

`pnpm dev` is `nuxt dev`, and it emulates the bindings — so the mounted API answers on the same
port as the pages, against a **local** D1 that Nitro manages. That database is not the one
`wrangler d1 ... --local` writes to, so migrate before expecting a schema. To exercise the real
production build instead of the dev one, `pnpm -C apps/web build` then
`npx wrangler dev` in `apps/web`: that is the only way to see the real CSP, since a dev build
ships scripts and inlines styles whatever the config says.

## Sharp edges

- Local D1 state is keyed by `database_id`; migrations applied under a placeholder id vanish when
  the real id is set. Symptom: `no such table: account`.
- `node --test test/` treats the directory as a file; use bare `node --test`.
- The stylesheet is `apps/web/app/assets/css/styles.css` and goes through the build, so it is
  content-hashed and immutably cached. The old hand-bumped `?v=` on it is gone; nothing to
  remember after a CSS change.
- The stylesheet is lint-clean under `biome check`, including `noDescendingSpecificity`. Leaf
  overrides live in the section at the bottom; a new `.x h2`-shaped rule added mid-file will
  usually trip that rule, and the fix is ordering, not `!important`.
- `src/og.ts` renders each share link's unfurl card (`/g/:id/:key/og.png`). `workers-og` is ~1.7MB of
  JS and wasm, so it is behind a dynamic `import()`: every other route would otherwise pay for it
  on a cold start. Satori's parser does not decode HTML entities — write literal characters.
  A drawn card is kept in the edge cache (`cached()`), keyed by a hash of its markup, because the
  CDN never caches a Worker's own response whatever its `cache-control` says. The markup is the
  card, so an edit is a new key and nothing needs purging; bump `DRAWN_WITH` when a change to the
  renderer (fonts, size, format) would draw the same markup differently.
- `/hub`, `/join/:code` and `/reset` are the only pages allowed to run script. Their header is
  written per response by `apps/web/server/plugins/csp.ts` with a nonce; `/` and `/g/**` are
  `noScripts` with no `script-src` at all (`shared/csp.ts`). Share pages render markdown someone
  else wrote and that CSP is the only thing making it safe — never relax it to add a feature.
  `passalong hub` passes the token in the URL fragment, which the page stores and scrubs on load.
- Saved work carries its own **share URL** in the frontmatter, and that URL needs no account
  to read. `take --save` therefore drops a self-ignoring `.gitignore` (`*`) in `./.passalong/`:
  committing that directory would publish the work to anyone who can see the repo. Don't
  "helpfully" remove it.
- **An account is not the product; a team is.** A self-serve account with no team has an empty
  hub: its box files work, but nobody else is there to take it. The sign-in therefore offers two doors beside signing in: paste an invite link (the only
  one that leads anywhere immediately), and create an account,
  whose copy says outright that it will be empty until someone hands you something. A new account
  with no team lands on setup (`/hub/start`), whose first step makes the team and offers the invite
  paste beside it; the empty Needs you repeats the invite paste for the same reason. Don't add a signup flow that dead-ends. There is no
  token box: the CLI never shows a token, and `passalong hub` signs the page in through the link.
- **Prefilled inputs are uncontrolled**: bound with `:value`, read back through
  `field()` on submit. Reading the form into locals before touching state was forced in the Preact
  original — a re-render snapped a controlled input back and silently swallowed a handle on the
  join form — and it stays the honest order. The search box is the one genuine `v-model`.
- `passalong new` opens `$EDITOR` only at a TTY. Agents and scripts pass a file or a sentence and
  get no editor.
- The CLI prints the work's id (and taken markdown) on **stdout** and everything else on stderr,
  so `ID=$(passalong new draft.md)` works.

## Deploying

`docs/DEPLOY.md` is the runbook: preflight, Worker, then the npm package. **The Worker is
`apps/web`** — `pnpm -C apps/api db:migrate:remote` then `pnpm -C apps/web run deploy` (plain
`pnpm deploy` is a pnpm built-in). apps/api is not deployed; it is mounted. Production host is
`passalong.dev`, with `passalong.kreativekorna.com` still routed for share links already in
circulation (custom-domain routes in `apps/web/wrangler.jsonc`). The old host serves but no longer
*names* anything: `PUBLIC_ORIGIN` fixes every link the app mints — share, invite, reset, screenshot
— to the apex, so one piece of work has one link whichever host it was sent from. `DEFAULT_API` in
`packages/passalong/src/api.js` and `homepage` in its `package.json` must match it.
`APTABASE_KEY` is a secret on the **web** Worker now; without it `track()` returns early and every
event is silently dropped. Account creation is throttled by the `ACCOUNT_LIMIT` rate-limit
binding (5/min per IP); the binding is optional in code so a config without it still runs.
