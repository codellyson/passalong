# Releasing

Two things ship on different rhythms: the Worker deploys continuously, the CLI is released
deliberately because people install it.

The full runbook is [`docs/DEPLOY.md`](../DEPLOY.md). This page is the shape and the reasoning.

## The Worker

Every push to `master` runs `.github/workflows/ci.yml`: checks, then remote D1 migrations, then a
Nuxt build and `wrangler deploy` of **`apps/web`**, then a smoke test. `apps/api` is not deployed —
`apps/web` mounts it — so there is one deploy for both halves.

The smoke test hits `/health` on **both** serving hosts (`passalong.dev` and
`passalong.kreativekorna.com`), which keeps "the old host still works" an enforced property rather
than an assumption, and then checks a page and `/v1/me` on the apex. That second part exists
because one Worker now serves both halves: `/health` passing no longer implies the pages render.

Locally: `pnpm dev` (not `pnpm run dev` — but note `pnpm deploy` *is* a pnpm built-in, so that one
must be `pnpm run deploy`).

## The CLI

```sh
pnpm release          # patch
pnpm release minor
```

`scripts/release.mjs` runs the package tests, bumps the version, commits, tags `vX.Y.Z`, and pushes
the branch and the tag together. It refuses first on a dirty tree, off `master`, when `master` has
diverged from the remote, or when the tag or version already exists — and rolls the bump back
rather than leaving the tree edited under a name it cannot use.

Those guards are the whole point. `v0.2.0` was once tagged by hand at a commit whose `DEFAULT_API`
still pointed at the old host: that is what happens when the tag is a separate step from the bump
it is supposed to describe.

It is `release`, not `publish`, because `pnpm publish` is a pnpm built-in — the same trap as
`pnpm deploy`.

## Staged publishing

The tag triggers `.github/workflows/release.yml`, which **stages** rather than publishes.

npm trusted publishing (OIDC) authenticates it: npm trusts this repo plus this workflow *filename*,
GitHub mints a short-lived identity token per run, provenance is attached automatically, and no
`NPM_TOKEN` exists anywhere. The registration is **stage-only**, which has been npm's default and
recommendation since 2026-09 — CI may upload a version but cannot make it live.

So a green release run means **staged, not shipped**. The job writes the approve commands into the
run summary for exactly that reason: a green tick otherwise reads as published.

A maintainer finishes it, with 2FA:

```sh
npm stage list passalong
npm stage view <stage-id>       # or `npm stage download <stage-id>` to inspect the tarball
npm stage approve <stage-id>    # `npm stage reject <stage-id>` to bin it
```

or npmjs.com → `passalong` → **Staged Packages** → Approve. Staging itself needs no 2FA, which is
what lets CI do it unattended.

`npm stage` requires npm ≥ 11.5.1, newer than the one Node 22 bundles — hence the
`npm install -g npm@latest` step in the workflow, and hence needing to upgrade locally before the
approve commands exist.

## Two guards in CI

1. The tag must match `packages/passalong/package.json`, so a tag can never name a commit that
   contains a different version.
2. The registry decides whether the version already shipped. Re-running a run whose stage was
   approved exits clean instead of failing on a conflict. A merely *staged* version is not
   published, so it correctly still counts as new.

## Version history

`0.1.0` was published by hand. `0.2.0` was tagged and never published, and the tag was deleted.
`0.2.1` existed only as a local bump. So the shipped history is `0.1.0` then `0.2.2`, and the gap
is not a missing release.

## Moving the canonical host

Change the route in `wrangler.jsonc`, `DEFAULT_API` in `packages/passalong/src/api.js`, and
`homepage` in the package — together. The old host stays routed rather than redirected: share keys
live in the URL, so links handed out under it must keep resolving.
