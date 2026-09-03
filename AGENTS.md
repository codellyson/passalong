# Relay — agent notes

Relay hands a finished implementation from one context (repo, machine, agent session, person)
to another as a **transfer guide**: markdown with frontmatter that an agent can act on directly.
The product is the baton pass, not a knowledge base. `docs/PRD.md` is the source of intent.

## Layout

- `packages/relay` — the `relay` CLI and the MCP server. Plain ESM JavaScript, no build step,
  no runtime deps beyond `@modelcontextprotocol/sdk` + `zod`. Published to npm as `justrelay`.
  - `src/guide.js` — the guide format: frontmatter parse/serialize, validation, ids, template.
    **This file defines the format.** `apps/api/src/guide.ts` mirrors its parsing rules; change both.
  - `src/store.js` — local store at `~/.relay` (`RELAY_HOME` overrides). One `.md` per guide.
  - `src/relay.js` — the operations (share, pull, list, status, export). Both surfaces call these.
  - `src/mcp.js` — MCP tools: `search_guides`, `get_guide`, `publish_guide`, `guide_template`,
    `set_guide_status`.
  - `src/api.js` — client for the hosted API. Everything works with no token; sync is additive.
  - `bin/relay` — the CLI. Few flags on purpose (see `[[command-style-atomic]]` conventions).
  - `skill/SKILL.md` — the Claude Code capture skill. `relay setup` copies it to
    `~/.claude/skills/relay-capture`.
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
  (strings and string lists only). `relay export` must always be a complete backup.
- **Ids** are 8 chars from a no-lookalike alphabet; they are addresses, not secrets. The
  **share key** in the link is the secret. Owner access needs the bearer token.
- **Accounts are tokens.** `POST /v1/accounts` mints one; only its SHA-256 lands in D1. There is
  no email or password in v1; that is the v2 team layer.
- **Status lifecycle**: draft → published → consumed → promoted. The server stores status both in
  the `guide.status` column and inside the markdown (`setField`) so a pulled `.md` is truthful.
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
pnpm -C packages/relay test            # guide format unit tests
pnpm -C apps/api lint                  # tsc
pnpm -C apps/api db:migrate            # local D1 (re-run if wrangler.jsonc's database_id changes)
pnpm dev:api                           # Worker on :8787
RELAY_API=http://localhost:8787 RELAY_HOME=/tmp/rh packages/relay/bin/relay login
pnpm -C apps/api db:migrate:remote && pnpm -C apps/api deploy
```

## Sharp edges

- Local D1 state is keyed by `database_id`; migrations applied under a placeholder id vanish when
  the real id is set. Symptom: `no such table: account`.
- `node --test test/` treats the directory as a file; use bare `node --test`.
- `relay share` opens `$EDITOR` only at a TTY. Agents and scripts pass a file and get no editor.
- The CLI prints the guide id (and pulled markdown) on **stdout** and everything else on stderr,
  so `ID=$(relay share draft.md)` works.

## Deploying

`docs/DEPLOY.md` is the runbook: preflight, Worker (`db:migrate:remote` then `deploy`), then the
npm package. Production host is `relay.kreativekorna.com` (custom-domain route in
`wrangler.jsonc`); `DEFAULT_API` in `packages/relay/src/api.js` and `homepage` in its
`package.json` must match it. Account creation is throttled by the `ACCOUNT_LIMIT` rate-limit
binding (5/min per IP); the binding is optional in code so a config without it still runs.
