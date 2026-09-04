# Deploying Passalong

Two deployables: the Worker (`apps/api`) and the npm package (`packages/passalong`). The Worker goes
first, because the package's default API URL points at it.

## Production shape

| Piece | Where | Config |
| --- | --- | --- |
| API + web view | Worker `passalong-api` on `passalong.kreativekorna.com` | `apps/api/wrangler.jsonc` |
| Database | D1 `passalong` (id `2b2c58a0-…`, WEUR) | same file |
| CLI + MCP | npm `passalong`, binary `passalong` | `packages/passalong/package.json` |
| Default API URL | `DEFAULT_API` in `packages/passalong/src/api.js` | must match the route above |

Accounts are bearer tokens minted by the API itself; only their SHA-256 hashes are stored.
One optional secret: `BREVO_API_KEY` (`wrangler secret put BREVO_API_KEY` in `apps/api`) turns
on handoff and invite emails from `EMAIL_FROM` (a var in `wrangler.jsonc`, must be a verified
Brevo sender). Without it, handoffs still land in inboxes; nothing is mailed.

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

First deploy creates the `passalong.kreativekorna.com` DNS record and certificate; allow a minute.

Verify:

```sh
curl -s https://passalong.kreativekorna.com/health                 # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' https://passalong.kreativekorna.com/g/abcdefgh/wrongkey0000000000000000   # 404
curl -s -X POST https://passalong.kreativekorna.com/v1/accounts    # 201 with a token
```

Then switch your own machine from the local Worker to production:

```sh
passalong login            # mints a production account; prints the token for other machines
passalong share ~/.passalong/guides/<id>.md --no-edit   # re-share anything you want synced
```

Rollback: `wrangler rollback` in `apps/api`, or `wrangler deployments list` to pick a version.
Migrations are forward-only; write a new migration rather than editing an applied one.

## 2. npm package

First release (0.1.0) was published 2026-09-04 by hand. The npm account has 2FA, so a manual
publish needs `--otp=<code>` from the authenticator; the CI path needs an Automation token.

```sh
cd packages/passalong
npm pack --dry-run          # 10 files, ~14 kB: bin/, src/, skill/, README
npm version patch           # or minor; bumps package.json (and tags once the repo is committed)
npm publish --otp=<code>    # publishConfig.access is public
```

Smoke-test the published package from a clean directory:

```sh
npx -y passalong@latest help
```

`passalong setup` on a user's machine copies `skill/SKILL.md` into `~/.claude/skills/passalong-capture`
and runs `claude mcp add passalong -- passalong mcp`, so those two paths are part of the public surface.

## 3. After deploy

- Update `docs/PRD.md` status and the README install line if the package name changes (the
  naming question in the PRD is still open: Passalong, Handoff, Baton, JustPassalong).
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
3. Push to `master` (or re-run the last `ci` workflow). The first CI deploy on 2026-09-03
   created the custom domain and certificate itself, so the template token's zone permissions
   are sufficient; no local deploy is required.

`.github/workflows/release.yml` publishes `passalong` to npm when a `v*` tag is pushed and the
tag matches `packages/passalong/package.json`. It needs `NPM_TOKEN` (an npm Automation token):

```sh
cd packages/passalong && npm version patch && git push && git push --tags
```

## Not yet in place
- No custom-domain fallback: if `passalong.kreativekorna.com` moves, change the route, the
  `DEFAULT_API` constant, and `homepage` in the package together.
