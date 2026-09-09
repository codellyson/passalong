# Passalong — agent notes

Passalong hands a finished implementation from one context (repo, machine, agent session, person)
to another as a **transfer guide**: markdown with frontmatter that an agent can act on directly.
The product is the baton pass, not a knowledge base. `docs/PRD.md` is the source of intent.

This file is the **conventions**: the rules and the sharp edges, and it is what to read first.
Reference material lives beside it — `docs/wiki/` has the schema, the `/v1` surface, the auth
model, how the web view stays safe, and how releases work. `apps/web/public/llms.txt` is the
public one, for agents *using* Passalong rather than changing it.

## Layout

- `packages/passalong` — the `passalong` CLI and the MCP server. Plain ESM JavaScript, no build step,
  no runtime deps beyond `@modelcontextprotocol/sdk` + `zod`. Published to npm as `passalong`.
  - `src/guide.js` — the guide format: frontmatter parse/serialize, validation, ids, template.
    **This file defines the format.** `apps/api/src/guide.ts` mirrors its parsing rules; change both.
  - `src/store.js` — local store at `~/.passalong` (`PASSALONG_HOME` overrides). One `.md` per guide.
  - `src/passalong.js` — the operations (share, pull, list, status, export). Both surfaces call these.
  - `src/mcp.js` — MCP tools: `search_guides`, `inbox`, `board`, `activity`, `get_guide`,
    `publish_guide`, `guide_template`, `set_guide_status`.
  - `src/api.js` — client for the hosted API. Everything works with no token; sync is additive.
  - `bin/passalong` — the CLI. Few flags on purpose (see `[[command-style-atomic]]` conventions).
  - `skill/SKILL.md` — the Claude Code capture skill. `passalong setup` copies it to
    `~/.claude/skills/passalong-capture`.
- `apps/api` — Hono + D1: the sync API (`/v1/*`), `/health`, and the two machine routes on a share
  link (`/g/:id/:key.md`, `/g/:id/:key/og.png`). **Not a deployed Worker.** apps/web mounts it, so
  there is one Worker, one origin and one deploy. It has no `public/` and no pages: everything a
  person looks at is apps/web's. Its `wrangler.jsonc` survives only because
  `wrangler d1 migrations` reads it.
  - `src/guide.ts` mirrors the format defined in `packages/passalong/src/guide.js` — change both.
    apps/web aliases this file and `analytics.ts` as `#api/*`.
  - `src/og.ts` reads its fonts through the `ASSETS` binding, which is **apps/web's** assets now.
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
  - `public/fonts/instrument-sans-{400,600}.ttf` look unused and are not: `src/og.ts` reads them
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
    `<link>` rather than an inline `<style>` (`features.inlineStyles: false`). Guide pages render
    markdown a stranger wrote and that CSP is the product's one real security property — if this
    stops passing, `/g/**` cannot move. `nuxt dev` cannot answer it; only a built, deployed
    response can.

## Contracts

- **Guides are plain markdown.** Never introduce a field the frontmatter parser can't round-trip
  (strings and string lists only). `passalong export` must always be a complete backup.
- **The MCP server is served two ways and implemented once.** `packages/passalong/src/mcp.js` is
  stdio, for anything that can run a process; `apps/api/src/mcp-http.ts` is the same tools at
  `POST /v1/mcp`, for assistants that add remote servers. The HTTP one owns no logic — each tool
  dispatches back through the app's own routes with the caller's bearer token, so a rule lives in
  the route and nowhere else. Stateless on purpose: nothing subscribes, so nothing needs a session.
- **A guide has a kind, and the two ask opposite things of whoever receives one.** `transfer`
  (or absent — every guide written before migration 0007 is one) is finished work to repeat:
  follow its `Steps`. `bug` is a defect to fix where it is. A bug's repro goes under `## Reproduce`
  and **never** `## Steps`, because `Steps` is the heading the MCP server tells every agent to
  follow — a repro under it means an agent reproduces the defect, checks the Verification, finds it
  false because the bug is real, and reports the guide as broken. `validate()` refuses a bug with a
  Steps section, and the document itself carries a line saying what it is, because the route
  serving a share link cannot add one: `api.byLink` pulls through that route and re-serialises what
  it gets, so anything decorated on there would be written to disk and published back.
- **An issue is a guide; a report is only a parent.** Six bugs handed over are six things three
  people can take and answer for separately — one document holding six has one verdict, and "four
  of these are fixed" has no way to be said. Product area is a column, not a table: the grouping is
  a `GROUP BY`, so a sixth surface costs a value rather than a migration.
- **Screenshots are claimed by the document that names them.** A shot is uploaded before the guide
  exists, so `shot.guide_id` is written on every guide write from the URLs in the markdown
  (`shotIds()`), never by the client. The `account_id` in that WHERE is load-bearing: without it,
  naming someone else's shot id in your markdown would claim their image, and deleting your guide
  would delete it. Deleting a guide takes its shots; a nightly cron sweeps uploads no guide ever
  claimed.
- **Spacing comes from the scale, and the relationship decides the step.** `--s-1`..`--s-9` are a
  4px base and Tailwind's numbers are the same unit, so use them: `gap-2` for a label and its
  control, `gap-3` for rows inside a block, `gap-4` for blocks in a column, `px-4 py-3` for a card,
  `mt-8` between sections. Half-steps are off the scale — `-1.5`, `-2.5` and `-3.5` were all in use
  and one relationship had four different values, which is what made the interface look unfinished
  before anyone could say why. `-0.5` is the one exception: 2px inside a chip is a sub-unit.
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
  publish path writes the result back into the document with `setList`, so a guide written before
  there was a rule reads as one style everywhere immediately and stores as one style the next time
  its author publishes it. That two-ended shape is deliberate: re-spelling the markdown is the
  author's to do, and there is no SQL migration that can rewrite frontmatter inside a document.
- **Every row in a list has the same anatomy.** A fact only some rows carry — a bug's severity —
  goes on the line of pills above the title, never in front of it: a chip that only some rows have
  moves where their titles start, and the list stops scanning as a column. Titles share one left
  edge. Severity is named (`Blocker`, `Minor`) rather than coded (`s1`, `s3`) wherever it is shown
  to a reader, in the list and in the report editor both, and `severityTone()`/`severityLabel()`
  in `app/utils/report.ts` are the only copies of that lookup.
- **The free tier is counted in one place.** `apps/api/src/quota.ts` holds `COUNTED` (the statuses
  that occupy room), `limitFor()` (per-account `sync_limit` beats `FREE_SYNC_LIMIT`, zero means
  unset) and `isFull()`; `quota()` in index.ts is the only query, and both `/v1/me` and the publish
  refusal read it. They were separate before and disagreed — the banner counted every guide the
  account had and warned people at a number the server was not enforcing.
- **`consumed` means archived, not implemented.** It left the hub once for meaning "I implemented
  it", which is the reader's judgement and belongs to the verdict. It is the author's shelf: off
  the board, out of the free tier's count, reversible, and hidden from every cut on the guides page
  except `archived`. The hub offers it to the author only — a non-owner marking a guide consumed
  still sends the author a "someone shipped this" receipt, and putting that in the same menu item
  is what conflated the two meanings the first time.
- **An ack is the reader's first word back, and it is a row.** `PUT /v1/guides/:id/ack` takes
  `{ taken, note }` — the same shape and the same reasoning as a verdict (migration `0004`): it
  belongs to the reader, it can be negative, several people can each answer, and it is never in the
  markdown, because the document is the author's while this is a fact about a transfer of it. The
  author gets a 403: answering your own handoff tells you nothing. A decline **requires a note** —
  "not me" without "why" leaves the sender exactly where the silence did — and takes the guide off
  the decliner's inbox and back onto its author's board as `passed`. Taking it does not: you still
  owe the work, so it stays where you will see it. Both reach the team channel, because a guide
  nobody has taken is work that has stopped moving.
- **Being named outranks being in the room.** The inbox orders `to_account_id = you` before
  everything else, then by age: someone writing your handle chose you, while a guide shared with a
  team you happen to be in chose nobody, and sorting both by age alone buried the one addressed to
  you under whatever the team published that day. Every surface showing that lane says which kind a
  guide is, because the order is only honest if the reason for it is visible.
- **Nothing a non-author does to a guide happens in silence.** Pull, verdict, ack, archive and
  un-archive each notify the author. `reopened` exists because archiving told them and un-archiving
  did not, so a guide could move off somebody's board on another person's say-so without a word;
  the pinning test in `apps/api/test/guide.test.mjs` walks the routes a non-owner can reach and
  fails if one stops telling them.
- **Ids** are 8 chars from a no-lookalike alphabet; they are addresses, not secrets. The
  **share key** in the link is the secret. Owner access needs the bearer token.
- **Accounts are not tokens any more (migration 0005).** Identity is email + password (PBKDF2-
  HMAC-SHA256 via WebCrypto — a Worker has no bcrypt). The hub authenticates with an HttpOnly
  session cookie; the CLI and MCP servers send a bearer token from the `token` table, which is
  named, revocable and records `last_used`. One middleware accepts either, so routes never care
  which. `POST /v1/accounts` still mints an **anonymous** account for `passalong login` and invite
  links — an account nobody has claimed yet; `POST /v1/auth/password` claims it. Everything secret
  is stored as a SHA-256: tokens, session ids and reset codes are all bearer credentials.
- **Analytics are sent from the Worker, never the browser** (`src/analytics.ts`). A share link is
  `/g/:id/:key` where the key is the secret, and every web analytics SDK reports the page URL — the
  obvious integration would have posted users' share keys to a third party. Guide pages also run no
  script, and that CSP is the product's one real security property. So: **event names and
  categorical props only**. Never an id, handle, email, team name, guide title or URL fragment. The
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
  `account(id)`, mostly `ON DELETE CASCADE`, so `DROP TABLE account` either deletes every guide and
  membership or fails on `team.created_by`, which has no cascade. `PRAGMA defer_foreign_keys` does
  not save it — D1 rolls the whole migration back. Both were tested. Inserts write a `retired:`
  marker that can never equal a SHA-256; nothing reads the column.
- **Status lifecycle**: draft → published. `consumed` and `promoted` are legacy — accepted on
  guides that already carry them, never set: the verdict says whether work landed, and the pull
  count says how travelled it is. The server stores status both in
  the `guide.status` column and inside the markdown (`setField`) so a pulled `.md` is truthful.
- **Teams (M2).** `team`/`membership`/`invite`/`pull` tables (migration 0002). A guide's
  `team_id` makes it readable and consumable by members; `to_account_id` addresses one member.
  Only the author can promote or delete. `GET /v1/inbox` = handed to me (or my teams, by others),
  not yet pulled by me. Every pull is a `pull` row; the sender sees them as `pulled_by`. Handles
  are global and unique.
- **Receipt is not only `pull`.** A browser-only receiver never runs `pull`, so a verdict or a
  non-author `consumed` also writes a `pull` row (`via` = "verdict"/"web"), deduped per
  (guide, account) and without the "pulled" notification — the verdict is the news. Without this a
  guide that was read and verified still showed as never delivered on both sides: the receiver's
  inbox never cleared and the sender's board said "not picked up".
- **Verdicts (migration 0004).** `PUT /v1/guides/:id/verdict {ok, note}` is the reader's answer to
  "does this work?", and the only way an author learns a handoff did not land. Deliberately **not**
  a status: `status` is the author's lifecycle, holds one value and lives inside the markdown, none
  of which fits a judgement that belongs to the reader, can be negative, and can come from several
  people. One row per (guide, account), so re-testing replaces your answer. A failing verdict must
  carry a note — "it doesn't work" without a reason helps nobody — capped at 280 chars because this
  is a verdict, not the comment thread the PRD rules out. `done` still means *implemented*;
  `works`/`broken` mean *it actually runs*.
- **Two views of one guide.** `/g/:id/:key` renders the author's order; `?view=verify` leads with
  Problem, Verification and Gotchas and folds the rest into a `<details>`. What leads and what
  folds lives in `verifyLayout()` in `guide.ts`, not in the page — it is a statement about the
  guide model, and keeping it there is what makes it testable without a renderer.
  `apps/web/server/utils/guide-html.ts` only turns that decision into HTML.
  **No view may drop part of a guide**: everything not
  led with is folded, including the preamble and any section nobody planned for. It is a link, not
  a toggle, because guide pages run no script.
- **Joining is web-first.** `/join/:code` mints an account, claims a handle and accepts the
  invite in the browser (`public/join.js`), because the person opening an invite is often the one
  who has never used the tool — a tester, a designer. The hub covers the rest of what used to need
  a terminal: claiming or editing a handle, and creating a team. Nothing here is a new endpoint;
  `POST /v1/accounts`, `PATCH /v1/me`, `POST /v1/invites/:code/accept` and `POST /v1/teams` already
  existed. Keep it that way — a browser-only path that needs its own API is a second product.
- **The board (`GET /v1/board`).** The hub's home, `passalong board`, and the MCP `board` tool are
  one endpoint: four queues defined in SQL, not in the client. Waiting = the inbox query. In
  flight = mine, addressed to a person or team, with `NOT EXISTS` a pull by anyone but me (`stale`
  past 7 days). Not working = mine with a standing failing verdict, and it is excluded from landed
  and worth-keeping so one guide never occupies two cards. Landed = the same `EXISTS` with
  `pulls < 3`. Worth keeping = `pulls >= 3`, which
  is why landed excludes it: one guide, one card. "Someone else pulled it" is the test everywhere
  — your own pull from another machine is not the transfer landing. The hub reloads after a status
  change rather than moving rows itself; re-deriving buckets in JS is how the two drift apart.
- **Notifications (migration 0003).** Every loop-closing moment is a `notification` row addressed
  to whoever should hear it: `handoff`, `shared`, `pulled`, `consumed`, `joined`. Rows first,
  delivery second — mail is a channel over the row, so the feed works with no mailer configured.
  A unique index on `(account_id, kind, guide_id, actor_id)` coalesces repeats (bumping `at` and
  `times`), and mail goes out only on the first occurrence. `notify()` never throws: a
  notification must not fail the action that caused it. `line()` in `notify.ts` is the single
  place the wording lives — CLI, MCP and hub all print the server's `text`.
- **Local-first.** With no token every command works offline. Sync failures on `list` degrade to
  a warning, never an error.
- **CSP on the web view** (`default-src 'none'; style-src 'self'; font-src 'self'`) is what makes
  rendering owner markdown for other viewers safe. Don't loosen it to add scripts or inline
  styles; put styles in `public/styles.css`. `font-src` is same-origin only: fonts are served
  from `public/fonts`, never a CDN, for the same reason Preact is vendored.
- **Guide pages are `noindex`** and `robots.txt` disallows `/g/`. The share key is the secret, so
  the page must never end up in a search index.

## Workflow

```sh
pnpm install
pnpm -C packages/passalong test         # guide format unit tests
pnpm -C apps/api lint                   # tsc over the mounted app
pnpm -C apps/web lint                   # vue-tsc over the pages, and apps/api through the mount
pnpm -C apps/api db:migrate             # local D1 (re-run if wrangler.jsonc's database_id changes)
pnpm dev                                # the whole thing on :3000 — pages and API
PASSALONG_API=http://localhost:3000 PASSALONG_HOME=/tmp/rh packages/passalong/bin/passalong login
pnpm -C apps/api db:migrate:remote && pnpm -C apps/web run deploy
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
- `src/og.ts` renders each guide's unfurl card (`/g/:id/:key/og.png`). `workers-og` is ~1.7MB of
  JS and wasm, so it is behind a dynamic `import()`: every other route would otherwise pay for it
  on a cold start. Satori's parser does not decode HTML entities — write literal characters.
- `/hub`, `/join/:code` and `/reset` are the only pages allowed to run script. Their header is
  written per response by `apps/web/server/plugins/csp.ts` with a nonce; `/` and `/g/**` are
  `noScripts` with no `script-src` at all (`shared/csp.ts`). Guide pages render markdown someone
  else wrote and that CSP is the only thing making it safe — never relax it to add a feature.
  `passalong hub` passes the token in the URL fragment, which the page stores and scrubs on load.
- A pulled guide carries its own **share URL** in the frontmatter, and that URL needs no account
  to read. `pull` therefore drops a self-ignoring `.gitignore` (`*`) in `./.passalong/`: committing
  that directory would publish the guide to anyone who can see the repo. Don't "helpfully" remove it.
- **An account is not the product; a team is.** Guides are only created by `share()`, which needs
  a session — the hub has no editor by design — so a self-serve account with no team has an empty
  hub. The sign-in therefore offers three doors in deliberate order: paste a token (CLI users),
  paste an invite link (the only one that leads anywhere immediately), and create an account,
  whose copy says outright that it will be empty until someone hands you something. The empty hub
  repeats the invite paste for the same reason. Don't add a signup flow that dead-ends.
- **Prefilled inputs are uncontrolled**: bound with `:value`, read back through
  `field()` on submit. Reading the form into locals before touching state was forced in the Preact
  original — a re-render snapped a controlled input back and silently swallowed a handle on the
  join form — and it stays the honest order. The search box is the one genuine `v-model`.
- `passalong share` opens `$EDITOR` only at a TTY. Agents and scripts pass a file and get no editor.
- The CLI prints the guide id (and pulled markdown) on **stdout** and everything else on stderr,
  so `ID=$(passalong share draft.md)` works.

## Deploying

`docs/DEPLOY.md` is the runbook: preflight, Worker, then the npm package. **The Worker is
`apps/web`** — `pnpm -C apps/api db:migrate:remote` then `pnpm -C apps/web run deploy` (plain
`pnpm deploy` is a pnpm built-in). apps/api is not deployed; it is mounted. Production host is
`passalong.dev`, with `passalong.kreativekorna.com` still routed for share links already in
circulation (custom-domain routes in `apps/web/wrangler.jsonc`). The old host serves but no longer
*names* anything: `PUBLIC_ORIGIN` fixes every link the app mints — share, invite, reset, screenshot
— to the apex, so one guide has one link whichever host it was shared from. `DEFAULT_API` in
`packages/passalong/src/api.js` and `homepage` in its `package.json` must match it.
`APTABASE_KEY` is a secret on the **web** Worker now; without it `track()` returns early and every
event is silently dropped. Account creation is throttled by the `ACCOUNT_LIMIT` rate-limit
binding (5/min per IP); the binding is optional in code so a config without it still runs.
