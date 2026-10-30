# Architecture

Three pieces, one database, **one deployed Worker**.

```
packages/passalong/          the CLI and the MCP server. Plain ESM, no build step.
  bin/passalong              argument parsing and every command's output
  src/work.js              the work format: sections, frontmatter, ids, validation
  src/store.js              ~/.passalong and ./.passalong — the local copy
  src/api.js                talks to the Worker; DEFAULT_API is the canonical host
  src/mcp.js                the stdio MCP server an agent drives
  src/capture.js            turning a session into a draft
  skill/SKILL.md            the Claude Code capture skill, installed by `passalong setup`

apps/api/                    the Hono app. NOT deployed on its own — apps/web mounts it.
  src/index.ts              every route; the header comment is the API surface
  src/work.ts              the format again, server side (parse, validate, verify layout)
  src/auth.ts               PBKDF2, tokens, sessions, breach check
  src/og.ts                 the per-work unfurl card (satori + resvg, wasm)
  src/hosts.ts              which hostnames serve and which redirect
  src/notify.ts             the notification feed
  src/email.ts              outbound mail through the Email Service binding
  src/analytics.ts          product events, sent from the Worker
  migrations/               D1 schema, applied in order

apps/web/                    Nuxt 4 on Cloudflare. The Worker that is actually deployed.
  app/pages/                /, /w/[id]/[key], /hub, /join/[code], /reset
  app/components/hub/       the hub, which used to be one 931-line file
  app/composables/useHub.ts its state and every mutation
  server/middleware/        0.canonical.ts (www → apex), 1.api.ts (the mount)
  server/api/               the page-facing endpoints: one work, one invite
  server/utils/work-html.ts markdown → HTML, server-side only
  shared/csp.ts             the two response policies
  public/                   static assets, served before the Worker runs
```

## One Worker, two halves

`apps/web` is the deployment. `server/middleware/1.api.ts` hands `/v1/*`, `/health` and the two
machine routes on a share link (`/w/:id/:key.md`, `/w/:id/:key/og.png`) to the Hono app, and lets
everything else fall through to Nuxt.

Same origin is the point, not an accident: the hub authenticates with an HttpOnly session cookie
and the CLI with a bearer token, and one middleware accepts either. Split them across two hosts and
that needs CORS on thirty routes and a cookie `Domain` — so the split does not exist.

## Why the CLI has no build step

The source in `packages/passalong/src` is the code that runs. One less thing to rot, and a piece of work
about this repo can tell you to read a file rather than a bundle. The web app does have a build,
and gets three things from it that the old hand-written HTML had to do by hand: a content hash on
the stylesheet, `.vue` files instead of template strings, and a typecheck that has already caught
bugs the string templates could not have.

## Server-first

All work lives on the server, and the CLI keeps no copy unless asked: `take --save` writes
`./.passalong/<id>.md`, and `passalong export` writes everything you can read as plain markdown,
which is how work survives the service. Writing work needs an account; an agent does not work
without the network anyway, and local copies only went stale and piled up.

## Where the same knowledge lives twice

The work format is implemented on both sides — `packages/passalong/src/work.js` and
`apps/api/src/work.ts`. That is deliberate: the CLI validates before sending so bad work never
leaves the machine, and the Worker validates because it cannot trust a client. The status list,
the retired fields and the tag rules must stay in step; `fixtures/work/` tests both.

## The two ends

The product is not "a place to put documents". It is a loop with two ends, and most design
decisions fall out of which end is being served:

- **The sending end** wants writing work down to cost nothing, or it will not happen at the moment
  it is noticed. So the box, email and webhooks take it in any shape, and the reader names it.
- **The doing end** wants to know what is asked and to say where it got to. So there are no kinds
  to choose between: the agent reads the work and works out what done means, and `take`,
  `progress`, `hand_in`, `pass` and `ask` are the same for everything.

A hand-in with its evidence closes the loop: it is final, the work goes to Done with what was
shown, and **Reopen** is how a person says it is not right. What was learned goes into the
project's documents rather than into a one-off note for one person (docs/LOOP.md §0).
