# Deploying Passalong

Two deployables: the Worker (`apps/api`) and the npm package (`packages/passalong`). The Worker goes
first, because the package's default API URL points at it.

## Production shape

| Piece | Where | Config |
| --- | --- | --- |
| API + web view | Worker `passalong-api` on `passalong.dev` (and `passalong.kreativekorna.com`) | `apps/api/wrangler.jsonc` |
| Database | D1 `passalong` (id `2b2c58a0-…`, WEUR) | same file |
| CLI + MCP | npm `passalong`, binary `passalong` | `packages/passalong/package.json` |
| Default API URL | `DEFAULT_API` in `packages/passalong/src/api.js` | must match the route above |

Accounts are email + password, with an HttpOnly session cookie for the hub and named, revocable
bearer tokens for the CLI and MCP servers. Only SHA-256 hashes are stored — of tokens, session ids
and reset codes alike. `POST /v1/accounts` still mints an anonymous, unclaimed account for
`passalong login` and invite links.

**Mail.** Handoff, pull, consumed and invite emails go through Cloudflare Email Service via the
`send_email` binding (`EMAIL` in `wrangler.jsonc`). There is no API key — the binding is the
credential — but two things must be true, or every send fails silently:

1. The domain in `EMAIL_FROM` is onboarded to Email Service, or sends fail
   `E_SENDER_NOT_VERIFIED`. Done once, from the CLI (no dashboard needed); on a Cloudflare-hosted
   zone the DNS records are created for you:

   ```sh
   wrangler email sending enable passalong.dev
   wrangler email sending dns get passalong.dev   # SPF, DKIM, DMARC, bounce MX
   wrangler email sending settings passalong.dev  # enabled: true
   ```

   Sending is scoped to the `passalong.` subdomain on purpose: the records live under
   `cf-bounce.passalong…` and `_dmarc.passalong…`, so the apex domain's mail is untouched and a
   deliverability problem here cannot spread to it.
2. The account is on the Workers Paid plan, which is what allows sending to recipients outside the
   account. On any plan you may mail addresses verified as Email Routing destinations, free.

Nothing else depends on this: every mail is a delivery of a `notification` row that exists either
way, so with mail off the hub, `passalong activity` and the MCP `activity` tool still work.

**Migration 0005 rewrote how identity works** and runs against live data. It was tested locally
against a seeded pre-auth database: accounts, guides, teams, memberships and notifications all
survive, and every existing `account.token_hash` becomes a row in `token` named "CLI (existing)",
so tokens people already hold keep working. If you ever need to re-test that, seed a database from
migrations 0001–0004 first — running 0005 against an empty one proves nothing.

`wrangler dev --remote` runs the Worker on Cloudflare's real runtime against **production D1**.
It is the only way to catch runtime restrictions that local `workerd` does not enforce — the
PBKDF2 iteration cap was found this way — but anything it writes is real. Clean up after yourself.

**Analytics.** `APTABASE_KEY` is a Worker secret (`wrangler secret put APTABASE_KEY` in
`apps/api`). Unset, nothing is sent — dev and anyone else's deployment stay silent. Events go
straight from the Worker to Aptabase's ingest endpoint; there is no SDK and no browser involvement,
deliberately. See the rule about what may go in a prop in AGENTS.md before adding an event.

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

First deploy creates the DNS record and certificate for each route; allow a minute.

Verify:

```sh
curl -s https://passalong.dev/health                 # {"ok":true}
curl -s https://passalong.kreativekorna.com/health   # {"ok":true} — the old host still answers
curl -s -o /dev/null -w '%{http_code}\n' https://passalong.dev/g/abcdefgh/wrongkey0000000000000000   # 404
curl -s -X POST https://passalong.dev/v1/accounts    # 201 with a token
curl -s -o /dev/null -w '%{http_code}\n' https://passalong.dev/v1/tokens   # 401 unauthenticated
```

Then switch your own machine from the local Worker to production:

```sh
passalong login            # mints a production account; prints the token for other machines
passalong share ~/.passalong/guides/<id>.md --no-edit   # re-share anything you want synced
```

Rollback: `wrangler rollback` in `apps/api`, or `wrangler deployments list` to pick a version.
Migrations are forward-only; write a new migration rather than editing an applied one.

## 2. npm package

0.1.0 was published by hand (2FA: `npm publish --otp=<code>`). Releases now go through the
version-triggered workflow below; manual publishing is the fallback.

```sh
cd packages/passalong
npm pack --dry-run          # 10 files, ~14 kB: bin/, src/, skill/, README
npm version patch --no-git-tag-version   # or minor; bumps package.json, makes no tag
npm publish --otp=<code>    # publishConfig.access is public
```

Smoke-test the published package from a clean directory:

```sh
npx -y passalong@latest help
```

The frontend has no build step, so nothing needs compiling before a deploy. `public/vendor/` is
committed; refresh it with `pnpm -C apps/api vendor` after bumping preact or htm, and commit the
result.

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
   account and, under Zone Resources, to both `passalong.dev` and `kreativekorna.com` — the
   deploy touches a custom-domain route on each.
2. Store it: `gh secret set CLOUDFLARE_API_TOKEN` (paste when prompted).
   `CLOUDFLARE_ACCOUNT_ID` is already set.
3. Push to `master` (or re-run the last `ci` workflow). The first CI deploy on 2026-09-03
   created the custom domain and certificate itself, so the template token's zone permissions
   are sufficient; no local deploy is required.

`.github/workflows/release.yml` publishes `passalong` to npm. There are no release tags: it runs
on every push to `master`, reads the version from `packages/passalong/package.json`, and asks the
registry whether that exact version exists. If it does the job stops at the first step; if it does
not, it publishes. Bumping the version *is* the release:

```sh
cd packages/passalong && npm version patch --no-git-tag-version
git commit -am "Release the CLI at 0.2.2" && git push
```

The registry is the source of truth for what has shipped, so nothing has to be remembered between
runs and a re-run of an old commit cannot double-publish.

**Auth is not configured yet.** The `v0.2.0` run (2026-09-04, back when this was tag-triggered)
failed with `403 OIDC permission denied for this action` — what npm returns when a package has no
trusted publisher registered. Until it is set up on npmjs.com — package `passalong` → Settings →
Trusted Publisher → GitHub Actions, owner `codellyson`, repository `passalong`, workflow
`release.yml`, no environment — every version bump will fail the same way, and the only route is a
manual `npm publish --otp=<code>` from a logged-in machine. A version whose publish failed is not
spent: npm never saw it, so the same number can be retried once auth works.

The dangling `v0.2.0` tag on the remote is left over from the tag-triggered era and means nothing
now; `git push origin :refs/tags/v0.2.0` removes it.

## Not yet in place
- If the canonical host moves again, change the route, the `DEFAULT_API` constant, and `homepage`
  in the package together. `passalong.kreativekorna.com` is kept routed rather than redirected:
  share keys live in the URL, so links handed out under it must keep resolving, and `origin` in
  `src/index.ts` builds each page's links from the host it was asked on.
