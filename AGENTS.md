# Passalong — agent notes

Passalong hands a finished implementation from one context (repo, machine, agent session, person)
to another as a **transfer guide**: markdown with frontmatter that an agent can act on directly.
The product is the baton pass, not a knowledge base. `docs/PRD.md` is the source of intent.

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
  - `src/guide.js` — the guide format: frontmatter parse/serialize, validation, ids, template.
    **`kind` is stated by its author or the guide is refused.** `parseFrontmatter` normalises it
    and seeds nothing; `validate()` refuses an absent one by name; `serializeFrontmatter` omits it
    rather than writing `kind: ""`, because a stated empty and an absent one are different things
    and the refusal turns on the difference. `PUT /v1/guides/:id` refuses it too — that is the
    half that matters, because it runs for every client whatever version it is on.

    It used to seed `transfer`, while `publish_guide` told every agent "kind: task (the default)".
    The two disagreed for thirteen days: 162 of 200 guides in real use were stored as transfers
    while their titles were tasks and bug reports. A transfer has no states, so nothing showed as
    in progress; it required Problem and Steps, so two-line corrections were padded into six
    sections; and there is nowhere to report into one, so agents published a second guide to carry
    what they found. **A silent default is a fabrication the product commits on the author's
    behalf** — it puts an answer in the record that nobody gave.

    Code that *builds* a guide states the kind it is building: a task's report is a transfer, said
    where it is made. That is not a default, it is the caller knowing what it is constructing.

    **The rule for every field whose absence means something**: either the author states it and
    the boundary normalises it, or absence is refused. What is never allowed is inventing the
    answer and writing it into the record, and nothing downstream may re-decide — six places used
    to, and one of them guessed `task`. `packages/passalong/test/one-place.test.js` enforces it by reading
    the source, and `Meta.kind` in `apps/api/src/guide.ts` is non-optional so the type says it too.
    A fallback that is really a caller's invariant rather than a default — the task queue only ever
    hands out tasks — is written as the constant it is, where it is relied on. Add a field to that
    test's `GUARDED` list the day absence starts speaking for it.
    **This file defines the format.** `apps/api/src/guide.ts` mirrors its parsing rules; change both,
    and `fixtures/guides/` is what now checks you did.
  - `src/store.js` — local store at `~/.passalong` (`PASSALONG_HOME` overrides). One `.md` per guide.
  - `src/passalong.js` — the operations (share, pull, list, status, export). Both surfaces call these.
  - `src/mcp.js` — MCP tools. `buildServer()` builds the surface and `serve()` connects it over
    stdio, so `test/mcp-surface.test.js` can read what every tool tells a client. Each one carries
    `annotations` saying what it does to the world, and `progress`, `hand_in` and `pass` carry an
    `outputSchema` — pass the zod object, never its `.shape`, which advertises a closed object. `take`, `progress`, `hand_in` and `pass` work every kind of guide
    (docs/V2.md §11); each answer ends with the server's `next` (`steps()` in
    apps/api/src/claims.ts). `start_guide`, `ack_guide`, `verify_guide`, `next_task`,
    `task_progress` and `finish_task` are gone: ten tools for four jobs, each pair described
    almost the same way, is a list a model misreads — which is how a session published a guide
    for work already pushed. One tool per job, one implementation each. Also `search_guides`, `inbox`,
    `board`, `activity` and `clear_activity` — reading the feed and marking it seen are two tools,
    because one tool that did both had to declare itself a write on every call to be honest about
    the one call that was,
    `log`, `get_guide`, `publish_guide`, `guide_template`, `set_guide_status`, `file_bugs`,
    `attach_screenshot`, `plan_tasks`. `take` is the one an agent should reach for on work it means
    to do. `get_guide` only reads. `attach_screenshot` is on both servers, shaped for where it runs — a path locally, a
    client-passed file over HTTP (`openai/fileParams`). Over HTTP, `publish_guide` and `file_bugs`
    also take a top-level `attachments` file array. `openai/fileParams` only accepts top-level
    fields, so a `file_bugs` issue names its files by position rather than holding them. Only
    ChatGPT fills file inputs, so the HTTP server also has `create_upload`: a one-time link
    (`POST /v1/uploads`, spent by `PUT /v1/uploads/:token` without a credential) that an agent's
    sandbox sends the file to with curl. See `apps/api/src/uploads.ts`.
  - `fixtures/guides/` — the corpus: one file per shape the format has to keep working, each in
    canonical form so `serialize(parse(x))` returns it byte for byte. `test/corpus.test.js` holds
    guide.js to it and `apps/api/test/corpus.test.mjs` reads the same files to hold the two
    parsers to each other. A change that makes these drift is a change to every guide already
    published: edit them deliberately, never to make a test go green. Not published to npm.
  - `src/checks.js` — runs a check's command at hand-in and records the exit code, so
    a verdict is the process's and not the agent's. `checks` answer `## Acceptance` on a task and
    `## Verification` on a handoff or a bug — the same field either way, because the response to a
    guide is evidence against what it asked for. Local only: `mcp-http.ts` is a Worker
    with no shell, so a hand-in over HTTP keeps the prose gate. It never reads a command out of a
    guide — a guide comes from somebody else's account, and running what it says would make every
    pull remote code execution.
  - `src/update.js` — the "a newer passalong is out" line. The registry is asked, not the API, and
    **nothing waits for it**: the line is read from `~/.passalong/config.json` and a detached
    `passalong refresh-update` writes it. The first version awaited the fetch on a 1.5s timeout and
    measuring it killed the design — the registry answers in six to ten seconds, so every check
    timed out and cached nothing. `PASSALONG_NO_UPDATE_CHECK=1` turns it off.
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
  - `src/claims.ts` — the task queue (`docs/V2.md`): claim, lease, gate, `blocked_by`. Imports no
    sibling so `test/claims.test.mjs` can run it against real SQLite with every migration. The lock
    is `claim`'s primary key; a lapsed lease is `stalled`, derived on read and still locked. Each
    claim also carries a generation from `claim_fence` (migration 0029): `take` hands it out, the
    CLI keeps it in `.passalong/held.json`, and `progress`, `hand_in` and `pass` send it back, so
    the same agent's write from a claim that was since released and re-taken is refused. It is
    optional on the way in and checked when present — an older CLI has none to send.
    `release()` is the author's take-back for **any** kind, and drops every live claim: a handoff
    has one per repo, and taking it back means from whoever has it. `POST /v1/guides/:id/release`
    is the path; `/v1/tasks/:id/release` is the same handler under its old name, because an
    installed CLI still calls it.
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
    `<link>` rather than an inline `<style>` (`features.inlineStyles: false`). Guide pages render
    markdown a stranger wrote and that CSP is the product's one real security property — if this
    stops passing, `/g/**` cannot move. `nuxt dev` cannot answer it; only a built, deployed
    response can.

## Contracts

- **What wrote a guide is a column, not a field (migration 0035).** `guide.client` is
  `cli@<version>` (from `x-passalong-version`), `mcp`, `hub` or `api`, decided by `writtenBy()`
  in `clients.ts` from the credential the middleware already checked, and replaced on every
  `PUT /v1/guides/:id` because the last write produced the markdown stored now. Never frontmatter:
  a field in the document travels with it and is re-published by whichever client pulls it next,
  naming the wrong writer. `""` is every row from before it — unknown, not guessed.
  `pnpm metrics` prints it. Frontmatter the parser cannot hold (a nested map, a `|` block, a list
  under a field that is not a list) is refused by name through `unheldFields()` in both parsers,
  never emptied.
- **Guides are plain markdown.** Never introduce a field the frontmatter parser can't round-trip
  (strings and string lists only). `passalong export` must always be a complete backup.
- **The MCP server is served two ways and implemented once.** `packages/passalong/src/mcp.js` is
  stdio, for anything that can run a process; `apps/api/src/mcp-http.ts` is the same tools at
  `POST /v1/mcp`, for assistants that add remote servers. The HTTP one owns no logic — each tool
  dispatches back through the app's own routes with the caller's bearer token, so a rule lives in
  the route and nowhere else. Stateless on purpose: nothing subscribes, so nothing needs a session.
- **A guide has a kind, it is always stated, and each asks something different of whoever receives
  one.** `transfer` is context exchange — whatever the next agent needs in order not to start cold.
  It **requires no sections**: context has no fixed shape, and demanding `## Problem` and `## Steps`
  is what padded short notes into documents (of 56 follow-ups in real use, the ones filling that
  template average 599 words and ten of sixteen were never opened; the ones ignoring it average 137
  and every one was opened). `bug` is a defect to fix where it is. A bug's repro goes under `## Reproduce`
  and **never** `## Steps`, because `Steps` is the heading the MCP server tells every agent to
  follow — a repro under it means an agent reproduces the defect, checks the Verification, finds it
  false because the bug is real, and reports the guide as broken. `validate()` refuses a bug with a
  Steps section, and the document itself carries a line saying what it is, because the route
  serving a share link cannot add one: `api.byLink` pulls through that route and re-serialises what
  it gets, so anything decorated on there would be written to disk and published back.
  `task` is work nobody has done yet (`docs/V2.md`): `Goal`, `Context`, `Constraints`,
  `Acceptance`, `Out of scope`, and no `Steps` — how is the taker's to work out, and what they did
  comes back as a transfer guide. `Acceptance` is required because it is what the work is approved
  against. `blocked_by:` is the one list field only tasks have, so the parser defaults
  `stack_assumptions` and `tags` and nothing else — defaulting it would write `blocked_by: []` into
  every guide anybody re-shares. A blocker counts as finished when a person approved it, never when
  an agent finished it.
- **A CLI too old for the server's rules is refused, not warned.** Every CLI call carries
  `x-passalong-version` (`VERSION` in `src/api.js`), and the token branch of the auth middleware
  answers **426** below `MIN_CLIENT` (`apps/api/src/clients.ts`) with the install command and the
  restart only a person can do. Rules deploy on merge while the text telling agents how to follow
  them ships with a reinstall, and for two weeks agents on 0.9.0 were refused by one and misled by
  the other. `passalong mcp` prints no update notice and an agent never reads stderr, so the
  refusal on the call it just made is the one text it is sure to see. CLIs up to 0.11.0 send no
  header and are known by Node's own `user-agent: node`; browsers, curl, SDKs and `/v1/mcp` are
  never gated. The floor is 0.12.0. **Raise `MIN_CLIENT` only after that version is `latest` on npm** — a floor above
  what npm hands out refuses every agent with nothing it can install.
- **A hand-in answers the PR template, minus the boxes.** What changed is `writeup`, how it was
  verified and the evidence are `checks` (run or shown, never ticked), and what it could break is
  `risk` (migration 0032, on the claim, for the reviewer only) — one line, optional, because a
  required risk field says "low risk" every time. Ownership is the reviewer's, not the agent's:
  close and approve on a hub row stay disabled until the evidence has been opened
  (`HubHandIn`'s `read`). An agent ticking "I verified it" is the self-attestation `checks`
  exists to replace.
- **Handed in means the actor's turn is over.** `PUT /v1/guides/:id` refuses a *new* guide whose
  `parent:` the publisher has handed in and that is waiting on its author (409). Every follow-up
  nobody asked for came from there: an agent handed in, then published a second guide to carry
  what it found. What the actor did and found goes on the hand-in, in `checks` and `writeup`.
  The note on every `take` used to say the opposite ("what you found doing it — publish that"),
  and an agent follows the text it read last. The author is never refused, and the rule ends when
  the author answers: send-back and close delete the claim, and an approved task is `consumed`.
- **An issue is a guide; a report is only a parent.** Six bugs handed over are six things three
  people can take and answer for separately — one document holding six has one verdict, and "four
  of these are fixed" has no way to be said. Product area is a column, not a table: the grouping is
  a `GROUP BY`, so a sixth surface costs a value rather than a migration.
- **Screenshots are claimed by the document that names them.** A shot is uploaded before the guide
  exists, so `shot.guide_id` is written on every guide write from the URLs in the markdown
  (`shotIds()`), never by the client. The `account_id` in that WHERE is load-bearing: without it,
  naming someone else's shot id in your markdown would claim their image, and deleting your guide
  would delete it. Deleting a guide takes its shots; an hourly cron sweeps uploads no guide ever
  claimed.
- **Spacing comes from the scale, and the relationship decides the step.** `--s-1`..`--s-9` are a
  4px base and Tailwind's numbers are the same unit, so use them: `gap-2` for a label and its
  control, `gap-3` for rows inside a block, `gap-4` for blocks in a column, `px-4 py-3` for a card,
  `mt-8` between sections. Half-steps are off the scale — `-1.5`, `-2.5` and `-3.5` were all in use
  and one relationship had four different values, which is what made the interface look unfinished
  before anyone could say why. `-0.5` is the one exception: 2px inside a chip is a sub-unit.
- **Ink decides, coral punctuates.** The look follows a warm cream system: `--bg` is a pale cream,
  a card is `--surface-raised` (a deeper cream at `rounded-3`, 24px) with almost no edge, and
  `--field` is the one near-white surface, for inputs, menus and command wells. The primary action
  is an ink pill (`.btn.primary`, `bg-ink text-on-ink`) and every `.btn` is a pill. `--coral` is
  2.6:1 on the canvas, so it is only ever a mark — the nav's diamond (`nav.marked`), an unread dot,
  a link's underline — and `--accent` is the same hue at a readable 5:1 for any word that has to be
  coral. Headings are 480 with negative tracking, never 600+; the serif is the editorial accent
  (guide prose and the italic `.turn`), not the display face.
- **A raised surface's edge is a shadow; a border is structure.** Cards, list containers, panels,
  menus and the sign-in card take `shadow-edge` (`--edge-shadow` in styles.css: a 1px ring plus a
  little depth in light, the ring alone in dark), never `border border-line`. Borders stay where
  they separate or state something: dividers, table rules, inputs and code wells, a selected or
  focused control, a coloured callout. A row inside a list sits flush, so it rounds its ends to the
  list's own radius; nested surfaces with a small inset nest their radii (outer = inner + padding —
  the `.menu` is 16px because its items are 8px inside 8px). Every `.btn` presses to
  `scale(0.96)`; `.static` opts out. A button in the same row as an input or a code well is a
  full-height `.btn`, not `.btn sm`: the field is `--control-h`, and a small button beside it
  sits off its line.
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
- **The checkout is hosted, the mode is read off the key, and the webhook is what writes a plan.**
  Both providers hand back a page of their own, because the alternative is this product handling
  card details — which is also why there is no card form to build and no seat-change screen beyond a
  number. `modeOf()` derives test-versus-live from the key itself rather than a setting beside it:
  a flag somebody has to remember to flip is how a product spends three weeks taking payments that
  were never real, and the hub badges every plan block when any configured key is a test one.
  `POST /v1/teams/:slug/subscribe` and `PATCH /v1/teams/:slug/seats` are **owner only** and refuse a
  seat count below the team's current membership — the seat count is what admits the next member, so
  setting it under the current size is a refusal aimed at whoever joins next rather than at the
  person doing it. The seats route answers with the **confirmed** count and the pending one, never
  the asked-for figure: the subscription is the single source for what is paid for, so the hub waits
  for the webhook rather than showing a number nothing has agreed to. Paystack cannot change
  quantity on a running subscription at all and says so out loud, which is better than appearing to
  succeed and quietly billing the old number. Every provider key is an optional binding: without
  them the tier is unavailable and the hub says so, rather than offering a button that cannot work.
- **A billing webhook is the only write in the product that no person authenticates**, so the
  signature over the **raw** body is the entire credential. `billing.ts` reads it with
  `c.req.text()` and verifies before anything parses: parse first and you verify a different set of
  bytes than the one that was signed, which is the classic way this is got wrong. The module
  **imports no sibling `.ts` on purpose** — it has to be unit-testable and a value import of a
  sibling is what Node's type stripping cannot resolve, so `eq()` is a local copy of
  `timingSafeEqual` rather than an import (the same reason `chatCard` lives inside notify.ts). Both
  providers are here because the first paying teams and the Show HN ones do not reach for the same
  processor: Stripe signs `${t}.${body}` with HMAC-SHA256 and **the timestamp is checked**, because
  without a tolerance a captured "subscription is active" replays forever; Paystack signs the body
  with HMAC-SHA512 and has no timestamp at all, which is survivable only because every event sets a
  plan to a value rather than moving it by a step. Three rules in the mapping, each of which was a
  way to get this wrong: `past_due` is **not** lapsed, since downgrading on the first failed
  attempt makes an overnight bank decline look like a cancellation; an event that carries no seat
  count leaves seats **untouched**, since writing zero would unseat the whole team on a payment
  retry; and an event nobody mapped answers **200**, because an endpoint that errors on what it
  does not care about is one the provider retries all day and then disables, taking the events that
  do matter with it. The webhook path is public by **prefix**, not by the two exact routes: a
  webhook aimed at the wrong URL is a real thing that happens during setup, and the middleware
  answering it with "not signed in — sign in at /hub" sends whoever is reading the provider's
  delivery log to a screen with nothing to do with the problem.
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
  — a guide addressed to the team, a new member joining. What must never stop is work already in
  flight closing, so a verdict and an ack still go through: they belong to the reader, and the reader
  is not the person who missed the payment. Reading, pulling and share links are untouched, because
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
  open in code and is `"0"` in production** — it is the cutover switch: it defaults open so a deployment that forgets the var keeps the old
  behaviour rather than locking people out by omission. The publish
  refusal is two messages, because the two states are fixed in different places — over a ceiling is
  solved by archiving, no plan is solved by buying one, and "archive some" to somebody with nothing
  synced is nonsense.
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
- **Three addresses, and the inbox ranks them.** `to:` inside a `team:` is `@handle` (one person),
  `#group` (the people who do a thing, `team_group` + `group_member`), or absent (the whole team).
  The lane orders handle, then group, then team drop — and every surface showing it says which
  kind each guide is, because the order is only honest if the reason for it is visible. Two rules
  follow from a group being more than one person: the team-wide clause must exclude both narrower
  addresses (or a `#frontend` handoff lands on everyone anyway), and one member acking `taken`
  clears it from the others' lanes — never from the lane of someone named by handle, who was asked
  personally and whose ask nobody else can answer. A group is an address, not a permission: it
  holds only people already in the team, and it has no roles.
- **Mail is written twice, and the plain-text half is written first.** `sendMail` takes lines and
  an optional HTML string; `mail-html.ts` builds the second from a fixed kit (`shell`, `button`,
  `command`, `quote`, `p`, `mono`) — tables, inline styles, a system font stack, no flexbox, no
  media queries, no SVG, and every colour stated, because Gmail on Android inverts a light mail
  rather than reading `prefers-color-scheme`. The masthead's mark is an absolute PNG with the
  wordmark beside it as text: images are blocked by default for a sender nobody has replied to.
  Anything a person typed — a title, a verdict's reason — goes through `esc()` on the way in.
- **Every answer a reader can give exists in all three places.** The hub, the MCP tools and the
  CLI: `take`/`pass` for the ack, `works`/`broken` for the verdict, `done` to archive. A signal that
  exists in only two of them is one a third of the product's users cannot send, and the mail that
  tells someone what to do next can only name commands that exist.
- **Google Chat gets a card; nothing else does.** Chat cannot unfurl a link — previews there come
  from a Chat app registering URL patterns, and a team connects an incoming webhook — so `chatCard()`
  in `notify.ts` builds the preview from what we already know. It must stay built rather than
  scraped: the share key in a guide's URL is its authorisation, `robots.txt` disallows `/g/` for
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
- **Status lifecycle**: draft → published, with `consumed` as the author's shelf. **What is
  accepted and what may be set are two different lists**, and `guide.ts` holds both: `STATUSES` is
  what parses, `SETTABLE` is what a write may choose. `promoted` is in the first and not the second
  — a guide carrying it keeps it and still re-shares, and nothing can acquire it. Shrinking
  `STATUSES` instead would have been the obvious move and the wrong one: the value lives in
  frontmatter inside markdown in other people's repositories, and `validate()` refuses a status it
  does not know, so a guide shared a month ago would stop re-sharing today. Both write paths
  enforce it and they enforce it differently, because they are asked different things: `PATCH
  /v1/guides/:id/status` refuses `promoted` **by name**, since an installed CLI still calls it and
  "must be one of …" reads as a typo rather than as a retirement; `PUT /v1/guides/:id` silently
  keeps `promoted` when the stored row already had it and downgrades to `published` when it did
  not, checked against the row rather than the markdown somebody just sent. That second check is
  also what keeps the free tier honest — `quota.ts` counts `published` and `promoted` as the
  statuses occupying room, so a settable `promoted` was an unlimited free tier for anyone who
  noticed. The server stores status both in the `guide.status` column and inside the markdown
  (`setField`) so a pulled `.md` is truthful.
- **Teams (M2).** `team`/`membership`/`invite`/`pull` tables (migration 0002). A guide's
  `team_id` makes it readable and consumable by members; `to_account_id` addresses one member.
  Only the author can promote or delete. `GET /v1/inbox` = handed to me (or my teams, by others),
  not yet pulled by me. Every pull is a `pull` row; the sender sees them as `pulled_by`. Handles
  are global and unique.
- **"It works" is shown, not said, and the proof does not outlive the review.** `PUT
  /v1/guides/:id/verdict` with `ok: true` is refused (`NEEDS_PROOF`) unless its note or `detail`
  names at least one `/v1/shots/<id>` **this account uploaded** — pointing at somebody else's
  screenshot is not proof. People said guides worked that did not, and a note was only their word.
  The shots are claimed for the guide, and `evidenceOn` reads verdict `detail` as well as claim
  evidence so an author's edit cannot release them. `sweepProof` (hourly, `shots.ts`) deletes a
  closed guide's proof `PROOF_DAYS` (5) after it closed — anything the guide holds that its own
  markdown does not name — and rewrites the text that pointed at it to say it was removed rather
  than leave a broken image. Screenshots only: video was left out for storage. Agent hand-ins keep
  their own evidence rule (commands and output count), since a screenshot of a migration proves
  nothing a test run does not.
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
- **The log (`GET /v1/log`) is the only surface ordered by time, and it owns no table.** Everything
  else is ordered by state — the board's queues, the guides page's rank — so nothing could answer
  "what did I get done in September", and the one thing the product recorded everywhere and showed
  nowhere was your own work. `log.ts` is a `UNION ALL` over rows that already exist: `guide.created`
  for a publish, and the `pull`, `verdict` and `ack` rows for the rest. **Never give it a table.**
  The moment it has its own rows it can disagree with the board, and the whole reason it cannot
  today is that there is nothing to keep in step. Two rules follow from what it is. It renders
  **no counts** — no totals, no streak, no per-month number: a count of guides shared is a metric of
  the wrong thing, and it is the shape this becomes if allowed to summarise (PRD §9). And every
  surface printing it **must say it is what you passed along, not what you worked on** — work that
  never became a guide has no row, so an empty month is indistinguishable from a quiet one, and a
  page that does not say so lies about the exact thing people open it to check. The pull arm is
  `GROUP BY guide_id` on purpose: `recordPull` writes a row per fetch of `/v1/guides/:id` and the
  CLI resolves an id by fetching, so `take` then `pull` leaves two rows seconds apart. The board
  wants both; a log rendering both says you pulled the same thing twice in a minute.
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
  beside the number every run** — activation undercounts because `passalong pull` serves a local
  copy without calling the API unless the guide has a team, and the quality proxy asked for
  `consumed`, which changed meaning. A report that quietly substitutes a near-miss is worse than
  one that says so.
- **The hub is live, and the stream owns no table.** `GET /v1/events` (`src/events.ts`) is
  Server-Sent Events for the signed-in account: `note` for each notification addressed to it (a
  toast in the hub, `HubToasts`) and `change` for any guide it can see whose hold, progress note,
  verdict or ack moved (a quiet refresh — progress notes never toast). It polls D1 every 3 seconds
  from a cursor that is a **time, not a row id**, because notifications coalesce by bumping `at` on
  an existing row; migration 0033 indexes the three times it reads. Each connection ends after four
  minutes and the client resumes from `Last-Event-ID`. The hub reads it with fetch
  (`useLive`), not EventSource, because EventSource cannot send the bearer token a token sign-in
  uses, and it disconnects while the tab is hidden and catches up — a few toasts and a count —
  when it is shown. Durable Objects would push without polling; this needed no new infrastructure.
- **Push reaches a device only for what needs you, and says nothing it should not.** Web Push
  (`src/webpush.ts`: VAPID and RFC 8291 encryption on WebCrypto, no library — `web-push` needs
  Node's crypto) goes out from `notify()` through a hook the app sets (`onPush`), for `PUSHED`
  kinds only: sent to you, taken, handed in, works, didn't work, sent back, went quiet, stuck on
  you. A
  phone that buzzes for every open gets muted. Devices are `push_subscription` rows (migration
  0034), one per browser, turned on from Settings — permission is asked on the button, never on
  load, because a refused prompt cannot be asked again. `private` is per device, since a lock screen
  is. A 404/410 from the push service deletes the row. `public/sw.js` has **no fetch handler**, so
  the pages it controls, guide pages included, load exactly as without it. Two events had no way to
  reach you and now do: `blocked` (a progress note starting `BLOCKED:`, first time only) and your
  own agent's `task_finished`, both sent without an actor so `notify()` does not drop them as
  self-inflicted. Keys: `node scripts/vapid-keys.mjs`; without `VAPID_*` the hub says push is not
  set up. iOS delivers web push only to the home-screen app.
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
  the page must never end up in a search index. Everything under `/g/` also sends
  `x-robots-tag: noindex, nofollow, noarchive` (route rule in `nuxt.config.ts`, and `VIEW_HEADERS`
  in `apps/api/src/index.ts` for the raw `.md`): a disallowed page's meta is never read, and the
  `.md` has no `<head>`. No canonical link on a noindex page either.
- **The hub shows a guide by framing it, never by rendering it.** `/hub/g/:id` is a guide's
  signed-in page: who holds it, the hand-in, the answers, and every guide it is tied to, from
  `GET /v1/guides/:id/context`, which records no pull. The document itself is the share page at
  `?embed=1` in a sandboxed same-origin iframe with no `allow-scripts`, which is why the hub's
  policy carries `frame-src 'self'` and nothing wider. Turning a guide's markdown into the hub's
  own HTML would put a stranger's document on the one page that runs script and holds the token.
  Row titles open this page; the share link stays one click away on it. Its sidebar leads with
  **Progress** (`utils/progress.ts`): what happened to the guide in order, built from that same
  context — acks, claims, hand-ins, verdicts with their screenshots, follow-ups — and ending on
  where it stands. It owns no table, for the reason the log owns none, so a hold that was released
  or sent back is gone from it with its claim row; verdict and archive receipts are not "opened".
- **The blog is markdown in the repo, bundled into the Worker.** Posts are
  `apps/web/content/blog/<slug>.md` with `title`, `date`, `description`, `author` and `draft`.
  A Worker has no filesystem, so they are Nitro server assets (`nitro.serverAssets` in
  nuxt.config.ts) read through `useStorage("assets:blog")` in `server/utils/blog.ts`. `/blog` and
  `/blog/**` are `noScripts` with `VIEW_HEADERS` like docs. A draft renders at its address, noindex,
  and is left out of the index, `/blog/rss.xml` and the sitemap. `/blog` itself is a draft in
  shared/pages.ts until its first post goes out: publishing is `draft: false` on the post, on
  `/blog`, and a line in public/llms.txt (test/public-pages.test.mjs insists).
- **The landing's JSON-LD is a data block, not script.** `server/plugins/csp.ts` skips
  `application/ld+json` when deciding whether a page runs script; without that the landing would
  get the hub's nonce policy.

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
- `src/og.ts` renders each guide's unfurl card (`/g/:id/:key/og.png`). `workers-og` is ~1.7MB of
  JS and wasm, so it is behind a dynamic `import()`: every other route would otherwise pay for it
  on a cold start. Satori's parser does not decode HTML entities — write literal characters.
  A drawn card is kept in the edge cache (`cached()`), keyed by a hash of its markup, because the
  CDN never caches a Worker's own response whatever its `cache-control` says. The markup is the
  card, so an edit is a new key and nothing needs purging; bump `DRAWN_WITH` when a change to the
  renderer (fonts, size, format) would draw the same markup differently.
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
