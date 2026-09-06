# Architecture

Three pieces, one database, **one deployed Worker**.

```
packages/passalong/          the CLI and the MCP server. Plain ESM, no build step.
  bin/passalong              argument parsing and every command's output
  src/guide.js              the guide format: sections, frontmatter, ids, validation
  src/store.js              ~/.passalong and ./.passalong — the local copy
  src/api.js                talks to the Worker; DEFAULT_API is the canonical host
  src/mcp.js                the stdio MCP server an agent drives
  src/capture.js            turning a session into a draft
  skill/SKILL.md            the Claude Code capture skill, installed by `passalong setup`

apps/api/                    the Hono app. NOT deployed on its own — apps/web mounts it.
  src/index.ts              every route; the header comment is the API surface
  src/guide.ts              the format again, server side (parse, validate, verify layout)
  src/auth.ts               PBKDF2, tokens, sessions, breach check
  src/og.ts                 the per-guide unfurl card (satori + resvg, wasm)
  src/hosts.ts              which hostnames serve and which redirect
  src/notify.ts             the notification feed
  src/email.ts              outbound mail through the Email Service binding
  src/analytics.ts          product events, sent from the Worker
  migrations/               D1 schema, applied in order

apps/web/                    Nuxt 4 on Cloudflare. The Worker that is actually deployed.
  app/pages/                /, /g/[id]/[key], /hub, /join/[code], /reset
  app/components/hub/       the hub, which used to be one 931-line file
  app/composables/useHub.ts its state and every mutation
  server/middleware/        0.canonical.ts (www → apex), 1.api.ts (the mount)
  server/api/               the page-facing endpoints: one guide, one invite
  server/utils/guide-html.ts markdown → HTML, server-side only
  shared/csp.ts             the two response policies
  public/                   static assets, served before the Worker runs
```

## One Worker, two halves

`apps/web` is the deployment. `server/middleware/1.api.ts` hands `/v1/*`, `/health` and the two
machine routes on a share link (`/g/:id/:key.md`, `/g/:id/:key/og.png`) to the Hono app, and lets
everything else fall through to Nuxt.

Same origin is the point, not an accident: the hub authenticates with an HttpOnly session cookie
and the CLI with a bearer token, and one middleware accepts either. Split them across two hosts and
that needs CORS on thirty routes and a cookie `Domain` — so the split does not exist.

## Why the CLI has no build step

The source in `packages/passalong/src` is the code that runs. One less thing to rot, and a guide
about this repo can tell you to read a file rather than a bundle. The web app does have a build,
and gets three things from it that the old hand-written HTML had to do by hand: a content hash on
the stylesheet, `.vue` files instead of template strings, and a typecheck that has already caught
bugs the string templates could not have.

## Local-first

Every command works offline with no token. Publishing writes to `./.passalong/` first; sync is
what happens next if an account exists. A failed sync on `list` degrades to a warning, never an
error. This is the reason the CLI is usable in a repo that has never heard of the hosted service,
and the reason guides survive the service.

## Where the same knowledge lives twice

The guide format is implemented on both sides — `packages/passalong/src/guide.js` and
`apps/api/src/guide.ts`. That is deliberate: the CLI validates before publishing so a bad guide
never leaves the machine, and the Worker validates because it cannot trust a client. The section
list and the status list must stay in step; both are tested.

## The two ends

The product is not "a place to put documents". It is a loop with two ends, and most design
decisions fall out of which end is being served:

- **The author end** wants publishing to cost nothing, or it will not happen at the moment the
  work is finished — which is the only moment the knowledge is complete.
- **The receiver end** wants to know what to check before it wants to know how it was built. That
  is why guide pages have a `?view=verify` that leads with `Verification` and folds the rest away,
  and why a guide with no `Verification` section is flagged to the reader rather than quietly
  rendered.

The verdict (`works` / `broken`) closes the loop. It is the only signal that says whether a guide
was any good, so the CLI, the MCP server, the hub and the guide page all offer it.
