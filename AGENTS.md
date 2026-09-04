# Passalong — agent notes

Passalong hands a finished implementation from one context (repo, machine, agent session, person)
to another as a **transfer guide**: markdown with frontmatter that an agent can act on directly.
The product is the baton pass, not a knowledge base. `docs/PRD.md` is the source of intent.

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
- `apps/api` — Hono on a Cloudflare Worker + D1. Sync API (`/v1/*`, bearer token) and the
  read-only web view (`/g/:id/:key`, plus `.md` for raw markdown). No editor by design.
  - `public/` — static assets served by the Workers assets layer before the Worker runs:
    `styles.css` (the only stylesheet; the view's CSP refuses inline styles), `favicon.svg` and
    the PNG icons, `site.webmanifest`, `robots.txt` (share links are `Disallow`ed), `404.html`
    (the Worker serves it via the `ASSETS` binding for unmatched routes), and `_headers` for
    cache and security headers on those files.
  - `scripts/icons.mjs` — regenerates the PNG icons from the mark in `favicon.svg`. Pure Node.

## Contracts

- **Guides are plain markdown.** Never introduce a field the frontmatter parser can't round-trip
  (strings and string lists only). `passalong export` must always be a complete backup.
- **Ids** are 8 chars from a no-lookalike alphabet; they are addresses, not secrets. The
  **share key** in the link is the secret. Owner access needs the bearer token.
- **Accounts are tokens.** `POST /v1/accounts` mints one; only its SHA-256 lands in D1. There is
  no email or password in v1; that is the v2 team layer.
- **Status lifecycle**: draft → published → consumed → promoted. The server stores status both in
  the `guide.status` column and inside the markdown (`setField`) so a pulled `.md` is truthful.
- **Teams (M2).** `team`/`membership`/`invite`/`pull` tables (migration 0002). A guide's
  `team_id` makes it readable and consumable by members; `to_account_id` addresses one member.
  Only the author can promote or delete. `GET /v1/inbox` = handed to me (or my teams, by others),
  not yet pulled by me. Every pull is a `pull` row; the sender sees them as `pulled_by`. Handles
  are global and unique.
- **Two views of one guide.** `/g/:id/:key` renders the author's order; `?view=verify` leads with
  Problem, Verification and Gotchas and folds the rest into a `<details>`. What leads and what
  folds lives in `verifyLayout()` in `guide.ts`, not in `render.ts` — it is a statement about the
  guide model, and keeping it there is also what makes it testable (type stripping cannot import
  `render.ts`, which resolves `./guide.js`). **No view may drop part of a guide**: everything not
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
  past 7 days). Landed = the same `EXISTS` with `pulls < 3`. Worth keeping = `pulls >= 3`, which
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
- **CSP on the web view** (`default-src 'none'; style-src 'self'`) is what makes rendering owner
  markdown for other viewers safe. Don't loosen it to add scripts or inline styles; put styles
  in `public/styles.css`.
- **Guide pages are `noindex`** and `robots.txt` disallows `/g/`. The share key is the secret, so
  the page must never end up in a search index.

## Workflow

```sh
pnpm install
pnpm -C packages/passalong test            # guide format unit tests
pnpm -C apps/api lint                  # tsc
pnpm -C apps/api db:migrate            # local D1 (re-run if wrangler.jsonc's database_id changes)
pnpm dev:api                           # Worker on :8787
PASSALONG_API=http://localhost:8787 PASSALONG_HOME=/tmp/rh packages/passalong/bin/passalong login
pnpm -C apps/api db:migrate:remote && pnpm -C apps/api run deploy
```

## Sharp edges

- Local D1 state is keyed by `database_id`; migrations applied under a placeholder id vanish when
  the real id is set. Symptom: `no such table: account`.
- `node --test test/` treats the directory as a file; use bare `node --test`.
- `public/styles.css` is browser-cached for an hour (`public/_headers`). After changing it, bump
  `STYLES` in `apps/api/src/render.ts` or returning visitors get the old sheet.
- `/hub` and `/join/:code` are the only pages allowed to run script (`HUB_HEADERS` in
  `index.ts`); they are static files talking to `/v1/*` with the token from `localStorage`. Guide
  pages render markdown someone else wrote and must keep the stricter `VIEW_HEADERS`. `passalong hub` passes the
  token in the URL fragment, which the page stores and scrubs on load.
- A pulled guide carries its own **share URL** in the frontmatter, and that URL needs no account
  to read. `pull` therefore drops a self-ignoring `.gitignore` (`*`) in `./.passalong/`: committing
  that directory would publish the guide to anyone who can see the repo. Don't "helpfully" remove it.
- `passalong share` opens `$EDITOR` only at a TTY. Agents and scripts pass a file and get no editor.
- The CLI prints the guide id (and pulled markdown) on **stdout** and everything else on stderr,
  so `ID=$(passalong share draft.md)` works.

## Deploying

`docs/DEPLOY.md` is the runbook: preflight, Worker (`db:migrate:remote` then `run deploy`; plain `pnpm deploy` is a pnpm built-in), then the
npm package. Production host is `passalong.kreativekorna.com` (custom-domain route in
`wrangler.jsonc`); `DEFAULT_API` in `packages/passalong/src/api.js` and `homepage` in its
`package.json` must match it. Account creation is throttled by the `ACCOUNT_LIMIT` rate-limit
binding (5/min per IP); the binding is optional in code so a config without it still runs.
