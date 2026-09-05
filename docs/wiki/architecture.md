# Architecture

Three pieces, one database.

```
packages/passalong/          the CLI and the MCP server. Plain ESM, no build step.
  bin/passalong              argument parsing and every command's output
  src/guide.js              the guide format: sections, frontmatter, ids, validation
  src/store.js              ~/.passalong and ./.passalong — the local copy
  src/api.js                talks to the Worker; DEFAULT_API is the canonical host
  src/mcp.js                the stdio MCP server an agent drives
  src/capture.js            turning a session into a draft
  skill/SKILL.md            the Claude Code capture skill, installed by `passalong setup`

apps/api/                    a Hono Worker on Cloudflare, one D1 database
  src/index.ts              every route; the header comment is the API surface
  src/guide.ts              the format again, server side (parse, validate, verify layout)
  src/auth.ts               PBKDF2, tokens, sessions, breach check
  src/render.ts             HTML for the landing, the hub shell, guide pages, join, reset
  src/og.ts                 the per-guide unfurl card
  src/hosts.ts              which hostnames serve and which redirect
  src/notify.ts             the notification feed
  src/email.ts              outbound mail through the Email Service binding
  src/analytics.ts          product events, sent from the Worker
  public/                   static assets, served before the Worker runs
  migrations/               D1 schema, applied in order
```

## Why the CLI has no build step

The source in `packages/passalong/src` is the code that runs. `htm` tagged templates need no
transpiling, so the hub's frontend has the same property. One less thing to rot, and a guide about
this repo can tell you to read a file rather than a bundle. Preact and htm are vendored into
`public/vendor/` by `scripts/vendor.mjs` rather than pulled from a CDN, because the hub's CSP is
`script-src 'self'`.

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
