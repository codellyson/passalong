# Codebase map

Three pieces, **one Worker**, one origin, one deploy.

| Piece | What it is | Deployed as |
| --- | --- | --- |
| `packages/passalong` | The CLI and the stdio MCP server. Defines the guide format. | npm package `passalong` |
| `apps/api` | Hono + D1: `/v1/*`, `/health`, the share link's `.md` and `og.png`. | **Not on its own** — mounted inside apps/web |
| `apps/web` | Nuxt 4 on a Cloudflare Worker: every page, the static assets, and the mounted API. | The Worker CI deploys from `master` |

`apps/web/server/middleware/1.api.ts` hands `/v1/*`, `/health` and the two `/g/**` machine routes to
the Hono app and lets everything else fall through to Nuxt. `apps/api/wrangler.jsonc` survives only
because `wrangler d1 migrations` reads it; CI applies migrations before each deploy.

## Where a concept lives

| Concept | Code |
| --- | --- |
| Guide format | `packages/passalong/src/guide.js`, mirrored in `apps/api/src/guide.ts` |
| Claims, the task queue | `apps/api/src/claims.ts` |
| Notifications, wording | `apps/api/src/notify.ts` |
| Live stream | `apps/api/src/events.ts`, `apps/web/app/composables/useLive.ts` |
| Push | `apps/api/src/webpush.ts`, `apps/web/public/sw.js` |
| Screenshots | `apps/api/src/shots.ts` |
| Plans, billing | `apps/api/src/quota.ts`, `billing.ts`, `gifts.ts` |
| Unfurl cards | `apps/api/src/og.ts` |
| Hosts, links | `apps/api/src/hosts.ts` (`mintOrigin`: a dev server mints its own address) |
| Security headers | `apps/web/shared/csp.ts`, `apps/web/server/plugins/csp.ts` |
| Hub state | `apps/web/app/composables/useHub.ts` |
| Styles | `apps/web/app/assets/css/styles.css`, `tailwind.css` |
| Public pages | `apps/web/shared/pages.ts` |

## Working on it

```sh
pnpm install && pnpm dev          # the whole thing on :3000, against a local D1
pnpm -C apps/api db:migrate       # local D1 (the dev server must be stopped)
pnpm -C packages/passalong test   # and apps/api, apps/web: node --test
pnpm -C apps/web lint             # vue-tsc over pages and the mounted API
```

Only a production build (`pnpm -C apps/web build` then `npx wrangler dev`) shows the real security
headers; the dev build ships scripts whatever the config says.

## Sources
- [AGENTS.md](../../AGENTS.md): "Layout", "Workflow", "Deploying"
- [docs/wiki/architecture.md](../wiki/architecture.md), [docs/DEPLOY.md](../DEPLOY.md)
