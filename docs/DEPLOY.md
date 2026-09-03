# Deploying Relay

Two deployables: the Worker (`apps/api`) and the npm package (`packages/relay`). The Worker goes
first, because the package's default API URL points at it.

## Production shape

| Piece | Where | Config |
| --- | --- | --- |
| API + web view | Worker `relay-api` on `relay.kreativekorna.com` | `apps/api/wrangler.jsonc` |
| Database | D1 `relay` (id `2b2c58a0-…`, WEUR) | same file |
| CLI + MCP | npm `justrelay`, binary `relay` | `packages/relay/package.json` |
| Default API URL | `DEFAULT_API` in `packages/relay/src/api.js` | must match the route above |

No secrets are needed. Accounts are bearer tokens minted by the API itself; only their SHA-256
hashes are stored.

## Preflight (run before every deploy)

```sh
pnpm install
pnpm -r test                    # CLI + API unit tests
pnpm -C apps/api lint           # tsc
pnpm lint                       # biome
pnpm -C apps/api deploy:check   # wrangler dry run: bindings, assets, routes
```

## 1. Worker

```sh
pnpm -C apps/api db:migrate:remote   # applies any new files in apps/api/migrations
pnpm -C apps/api run deploy
```

First deploy creates the `relay.kreativekorna.com` DNS record and certificate; allow a minute.

Verify:

```sh
curl -s https://relay.kreativekorna.com/health                 # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' https://relay.kreativekorna.com/g/abcdefgh/wrongkey0000000000000000   # 404
curl -s -X POST https://relay.kreativekorna.com/v1/accounts    # 201 with a token
```

Then switch your own machine from the local Worker to production:

```sh
relay login            # mints a production account; prints the token for other machines
relay share ~/.relay/guides/<id>.md --no-edit   # re-share anything you want synced
```

Rollback: `wrangler rollback` in `apps/api`, or `wrangler deployments list` to pick a version.
Migrations are forward-only; write a new migration rather than editing an applied one.

## 2. npm package

Requires `npm login` (the registry currently returns 401 for `npm whoami` on this machine).

```sh
cd packages/relay
npm pack --dry-run          # 10 files, ~14 kB: bin/, src/, skill/, README
npm version patch           # or minor; bumps package.json (and tags once the repo is committed)
npm publish                 # publishConfig.access is public
```

Smoke-test the published package from a clean directory:

```sh
npx -y justrelay@latest help
```

`relay setup` on a user's machine copies `skill/SKILL.md` into `~/.claude/skills/relay-capture`
and runs `claude mcp add relay -- relay mcp`, so those two paths are part of the public surface.

## 3. After deploy

- Update `docs/PRD.md` status and the README install line if the package name changes (the
  naming question in the PRD is still open: Relay, Handoff, Baton, JustRelay).
- The free-tier cap is `FREE_SYNC_LIMIT` in `wrangler.jsonc`; account creation is throttled to
  5 per IP per minute via the `ACCOUNT_LIMIT` rate-limit binding.
- Observability is on with full sampling; `wrangler tail` streams logs.

## Continuous deploy

`.github/workflows/ci.yml` runs the preflight on every push and pull request. A green push to
`master` then applies remote migrations, deploys the Worker, and smoke-tests `/health`. The
deploy job skips itself until the token secret exists, so CI is safe to run before setup.

One-time setup:

1. Create an API token at <https://dash.cloudflare.com/profile/api-tokens>: start from the
   **Edit Cloudflare Workers** template and add **Account → D1 → Edit**. Scope it to this
   account and, under Zone Resources, to `kreativekorna.com`.
2. Store it: `gh secret set CLOUDFLARE_API_TOKEN` (paste when prompted).
   `CLOUDFLARE_ACCOUNT_ID` is already set.
3. Do the **first** deploy from your machine (section 1 above). Creating the custom domain and
   its certificate needs zone permissions the token may not have; once the domain exists,
   the token only needs to update the Worker.

`.github/workflows/release.yml` publishes `justrelay` to npm when a `v*` tag is pushed and the
tag matches `packages/relay/package.json`. It needs `NPM_TOKEN` (an npm Automation token):

```sh
cd packages/relay && npm version patch && git push && git push --tags
```

## Not yet in place
- No custom-domain fallback: if `relay.kreativekorna.com` moves, change the route, the
  `DEFAULT_API` constant, and `homepage` in the package together.
