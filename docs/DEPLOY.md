# Deploying Passalong

Two deployables: the Worker (`apps/api`) and the npm package (`packages/passalong`). The Worker goes
first, because the package's default API URL points at it.

## Production shape

| Piece | Where | Config |
| --- | --- | --- |
| API + web view | Worker `passalong-web` on `passalong.dev` (and `passalong.kreativekorna.com`) | `apps/web/wrangler.jsonc` |
| Database | D1 `passalong` (id `2b2c58a0-…`, WEUR) | binding in `apps/web`, migrations in `apps/api` |
| Screenshots | R2 `passalong-shots` — evidence attached to bug reports | `apps/web/wrangler.jsonc` |
| Nightly sweep | cron `17 4 * * *` → `apps/web/server/plugins/sweep.ts` | same file |
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

**The free tier is closed.** `FREE_SIGNUP` is `"0"` in `apps/web/wrangler.jsonc`, so a new account
syncs nothing until it is on a plan. Two things keep that from being a cliff: accounts carrying
`grandfathered` (migration 0016, set on everyone who existed when it ran) keep `FREE_SYNC_LIMIT`,
and the local store is untouched — `passalong share` writes to the machine with no account and no
ceiling. Set it to `"1"` to reopen. It defaults to open in code, so a deployment that forgets the
var keeps the old behaviour rather than locking people out by omission.

**Billing.** Five Worker secrets, all optional: without them the paid tier is simply unavailable
and every webhook is refused rather than trusted.

| Secret | What it is |
| --- | --- |
| `STRIPE_SECRET` | API key. `sk_test_…` or `sk_live_…` |
| `STRIPE_PRICE` | The recurring price id the subscription is for |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…`, from the endpoint you register |
| `PAYSTACK_SECRET` | API key, which is **also** the webhook signing key |
| `PAYSTACK_PLAN` | The plan code the subscription is for |

**Test mode is not a setting.** It is read off the key (`modeOf` in `billing.ts`), so it cannot
disagree with the keys actually in use — configure test keys and the hub badges every plan block
"test mode — no real money moves". A mode flag beside the key is how a product spends three weeks
taking payments that were never real.

Register the webhook endpoints as `https://passalong.dev/v1/billing/webhook/stripe` and
`…/paystack`. Stripe needs `customer.subscription.created`, `.updated` and `.deleted`; Paystack
needs `subscription.create`, `subscription.disable` and `invoice.payment_failed`. Anything else is
answered 200 and ignored, so subscribing to more is harmless.

What the tests cannot reach is the provider validating ids that only exist in your account — a
price id, a plan code, a live subscription. `apps/api/test/billing-calls.test.mjs` pins everything
this side of that by stubbing `fetch`: the endpoint, the encoding, the field names, where the
metadata goes and how an error is read back. Run it before the first real checkout and after any
change to `billing.ts`.

To exercise the rest, put the test keys in `apps/web/.dev.vars` (gitignored) and point the
provider's CLI forwarder at `http://localhost:3000/v1/billing/webhook/<provider>`. Note the
webhook, not the checkout, is what writes a plan — so a subscription only takes effect once the
event arrives.

## Preflight (run before every deploy)

```sh
pnpm install
pnpm -r test                    # CLI + API unit tests
pnpm -C apps/api lint           # tsc over the mounted app
pnpm -C apps/web lint           # vue-tsc over the pages, and apps/api through the mount
pnpm lint                       # biome
pnpm -C apps/web build          # the dry run needs the build output to exist
pnpm -C apps/web deploy:check   # wrangler dry run: bindings, assets, routes
```

## 1. Worker

**One-time, before the first deploy that carries them:** the R2 bucket must exist, or wrangler
refuses the deploy on an unresolvable binding rather than failing later at runtime.

```sh
npx wrangler r2 bucket create passalong-shots
```

There is one Worker: **`apps/web`**. It serves every page and mounts the Hono app from `apps/api`,
which is not deployed on its own. Migrations still live with the schema in `apps/api`.

```sh
pnpm -C apps/api db:migrate:remote   # applies any new files in apps/api/migrations
pnpm -C apps/web build
pnpm -C apps/web run deploy          # plain `pnpm deploy` is a pnpm built-in — use `run`
```

CI does all of this on a push to master, so a manual deploy is only for when you are bypassing it.

First deploy of a route creates the DNS record and certificate; allow a minute.

Verify:

```sh
curl -s https://passalong.dev/health                 # {"ok":true}
curl -s https://passalong.kreativekorna.com/health   # {"ok":true} — the old host still answers
curl -s -o /dev/null -w '%{http_code}\n' https://passalong.dev/g/abcdefgh/wrongkey0000000000000000   # 404
curl -s -X POST https://passalong.dev/v1/accounts    # 201 with a token
curl -s -o /dev/null -w '%{http_code}\n' https://passalong.dev/v1/tokens   # 401 unauthenticated
curl -sI https://www.passalong.dev/ | head -1        # 308 to the apex
```

Both halves now live in one Worker, so `/health` passing no longer implies the pages render. Check
a page, and check that guide pages still carry the CSP that makes them safe:

```sh
sh apps/web/scripts/probe.sh https://passalong.dev
sh apps/web/scripts/probe.sh https://passalong.dev /g/<id>/<key>
```

If either probe fails, **stop and roll back** — a guide page that ships script has lost the one
property that makes rendering someone else's markdown safe. Rolling back is
`npx wrangler rollback` in `apps/web`.

Then switch your own machine from the local Worker to production:

```sh
passalong login            # mints a production account; prints the token for other machines
passalong share ~/.passalong/guides/<id>.md --no-edit   # re-share anything you want synced
```

Rollback: `wrangler rollback` in `apps/api`, or `wrangler deployments list` to pick a version.
Migrations are forward-only; write a new migration rather than editing an applied one.

### A local D1 that refuses to migrate

`wrangler d1 migrations apply passalong --local` failing with something like
`duplicate column name: <x>` means the local database already has the change but `d1_migrations`
never recorded it — a run that applied a file and was interrupted before writing its row. Wrangler
then retries that file forever, and everything after it never runs, so the local schema silently
falls behind while the command keeps failing the same way.

Look before touching anything. The database is at
`apps/web/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite`:

```sh
sqlite3 "$DB" "select name from d1_migrations order by id;"   # what it thinks it has
sqlite3 "$DB" "pragma table_info(<table>);"                   # what it actually has
```

If the schema really does have what the failing file adds, record it and carry on — take a copy
first, because this is a database:

```sh
sqlite3 "$DB" ".backup /tmp/d1-before.sqlite"
sqlite3 "$DB" "INSERT INTO d1_migrations (name) VALUES ('<file>.sql');"
pnpm -C apps/web exec wrangler d1 migrations apply passalong --local
```

Deleting the file and starting over also works and loses whatever you were dogfooding with, which
is usually the point of having it. Prefer the bookkeeping fix. Either way, running
`pnpm -C packages/passalong test:e2e` against a local server on 3001 is what says the database is
actually usable again.

## 2. npm package

0.1.0 was published by hand (2FA: `npm publish --otp=<code>`). Releases now go through
`pnpm release` and the tag-triggered workflow below; manual publishing is the fallback.

```sh
cd packages/passalong
npm pack --dry-run          # 10 files, ~20 kB: bin/, src/, skill/, README
npm version patch --no-git-tag-version
npm publish --otp=<code>    # publishConfig.access is public
```

Smoke-test the published package from a clean directory:

```sh
npx -y passalong@latest help
```

The frontend is built by Nuxt, so `pnpm -C apps/web build` has to run before the deploy (CI does
this). Nothing about the build output is committed.

`passalong setup` on a user's machine copies `skill/SKILL.md` into `~/.claude/skills/passalong-capture`
and runs `claude mcp add passalong -- passalong mcp`, so those two paths are part of the public surface.

## 3. After deploy

- Update `docs/PRD.md` status and the README install line if the package name changes (the
  naming question in the PRD is still open: Passalong, Handoff, Baton, JustPassalong).
- The free-tier cap is `FREE_SYNC_LIMIT` in `wrangler.jsonc`; account creation is throttled to
  5 per IP per minute via the `ACCOUNT_LIMIT` rate-limit binding.

### Raising one account's limit

`FREE_SYNC_LIMIT` moves the ceiling for everybody and only at a deploy. `account.sync_limit` moves
it for one person, immediately, with nothing to ship — zero means "not set", so the deployment's
default applies:

```bash
pnpm -C apps/api exec wrangler d1 execute passalong --remote \
  --command "UPDATE account SET sync_limit = 200 WHERE handle = 'someone'"
```

Put it back on the default with `sync_limit = 0`. Only guides that are `published` or `promoted`
count against it, so archiving in the hub is what makes room — see `COUNTED` in
`apps/api/src/quota.ts`, which is the one definition both the warning and the refusal read.

There is no plan or subscription behind this. When there is, a plan resolves to a number and this
is the column it lands in.
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

`.github/workflows/release.yml` publishes `passalong` to npm when a `v*` tag is pushed. Nobody
writes that tag by hand — `pnpm release` does the whole thing:

```sh
pnpm release          # patch
pnpm release minor
```

`scripts/release.mjs` runs the package tests, bumps the version, commits, tags `vX.Y.Z` and pushes
the branch and the tag together. It refuses first on a dirty tree, off `master`, when `master` has
diverged from the remote, or when the tag or the version already exists — and rolls the bump back
rather than leaving the tree edited under a name it cannot use. So the tag CI sees always names a
commit that really contains that version. (`release`, not `publish`: `pnpm publish` is a pnpm
built-in, the same trap as `pnpm deploy`.)

CI re-checks the tag against `package.json` and asks the registry whether the version already
exists, so re-running a run that already published exits clean rather than failing on a conflict.

**Auth** is npm trusted publishing (OIDC), registered on npmjs.com under package `passalong` →
Settings → Trusted Publisher → GitHub Actions, owner `codellyson`, repository `passalong`, workflow
`release.yml`, no environment, **stage-only** (Allow `npm publish` unticked). npm answers
`403 OIDC permission denied for this action` when the registration is missing or when the workflow
attempts something it is not allowed — which is what the `v0.2.0` and the three 2026-09-05 runs
failed on.

Stage-only means CI never makes a version live. `npm stage publish` uploads it; a maintainer then
approves, with 2FA:

```sh
npm stage list passalong
npm stage view <stage-id>      # or `npm stage download <stage-id>` to inspect the tarball
npm stage approve <stage-id>   # `npm stage reject <stage-id>` to bin it
```

or on npmjs.com → `passalong` → **Staged Packages** → Approve. Staging itself needs no 2FA, which
is what lets CI do it unattended. A green release run therefore means *staged*, not *shipped* —
the run's summary says so, because a green tick otherwise reads as published.

`v0.2.2` is the first tag this flow produced, and the only one on the remote. `v0.2.0` was
deleted on 2026-09-05: it never published, and it pointed at a commit whose `DEFAULT_API` still
read kreativekorna — the hazard of writing a tag by hand, separately from the bump it describes,
which is what `pnpm release` now prevents. `0.2.1` existed only as a local bump and was never
tagged or published, so the shipped history is `0.1.0` then `0.2.2`.

## Not yet in place
- If the canonical host moves again, change the route, the `PUBLIC_ORIGIN` var, the `DEFAULT_API`
  constant, and `homepage` in the package together. `passalong.kreativekorna.com` is kept routed
  rather than redirected: share keys live in the URL, so links handed out under it must keep
  resolving. It no longer mints anything, though — `origin()` in `src/index.ts` returns
  `PUBLIC_ORIGIN` when it is set, so both hosts name the apex and one guide keeps one link.
