# API

Defined in `apps/api/src/index.ts`. The header comment there is the canonical list; this page adds
who may call what, and why some of the shapes are odd.

Auth is a bearer token (`Authorization: Bearer pa_…`) or the `pa_session` cookie. `app.use("/v1/*")`
is the gate; the routes below marked **open** are the exceptions it lets through.

## Accounts and auth

| Route | Access | Notes |
| --- | --- | --- |
| `POST /v1/accounts` | **open** | Mints an anonymous account and its first token. Rate-limited per IP (`ACCOUNT_LIMIT`, 5/min) — it is the only unauthenticated write, so a script could otherwise fill the table. |
| `POST /v1/auth/signup` | **open** | `{ email, password }` → account + session cookie |
| `POST /v1/auth/login` | **open** | `{ email, password }` → session cookie |
| `POST /v1/auth/forgot` | **open** | Always answers the same, whether or not the address exists. Do not make it informative. |
| `POST /v1/auth/reset` | **open** | `{ code, password }` → new password + session |
| `POST /v1/auth/logout` | session | Ends the session server-side, not just locally |
| `POST /v1/auth/password` | token/session | Claim an account that has none, or change it |
| `GET/POST /v1/tokens`, `DELETE /v1/tokens/:id` | account | A new token is shown once; only its hash is kept |
| `GET /v1/me`, `PATCH /v1/me` | account | Identity, teams, counts; `{ handle, name, email }` |

## Teams

| Route | Access |
| --- | --- |
| `POST /v1/teams` | account — creator becomes owner |
| `GET /v1/teams` | account |
| `GET /v1/teams/:slug` | **members only** |
| `POST /v1/teams/:slug/invites` | members — `{ email? }`, mailed when an email is given |
| `POST /v1/invites/:code/accept` | account |

## Guides

| Route | Access | Notes |
| --- | --- | --- |
| `PUT /v1/guides/:id` | owner | Body is `text/markdown`, not JSON. The markdown is the record; `team`/`to` are read from its frontmatter. |
| `GET /v1/guides/:id` | owner or team member | Returns markdown. **Records a pull.** |
| `GET /v1/guides?q=&scope=` | account | `scope=all` (default) `| mine | <team slug>` |
| `PATCH /v1/guides/:id/status` | owner: any status; team member: `consumed` or `published` only | A member can say they used it; only the author can promote or unpublish |
| `PUT /v1/guides/:id/verdict` | account | `{ ok, note? }` |
| `DELETE /v1/guides/:id` | **owner only** | |
| `GET /v1/inbox` | account | Handed to you or your teams, not yet pulled |
| `GET /v1/board` | account | The queues: waiting, not working, in flight, landed |
| `GET /v1/notifications?unread=` | account | |
| `POST /v1/notifications/read` | account | `{ ids? }` — everything unread when `ids` is omitted |

`GET /v1/guides/:id` recording a pull is the one side effect on a GET in this API. It is
deliberate: a pull is the event the author needs to see, and making it a separate call would mean
trusting clients to report it. Keep it in mind when adding caching or prefetching.

## Web routes

| Route | Serves |
| --- | --- |
| `GET /` | The landing page |
| `GET /g/:id/:key` | The read-only guide view. `?view=verify` leads with `Verification`. |
| `GET /g/:id/:key.md` | Raw markdown. Also records a pull. |
| `GET /g/:id/:key/og.png` | The unfurl card. Deliberately does **not** record a pull — crawlers, not people. |
| `GET /hub` | Your transfers, teams and tokens; talks to `/v1/*` |
| `GET /join/:code` | Where an invite link lands |
| `GET /reset` | Set a new password from an emailed link |
| `GET /health` | `{"ok":true}` — what CI smoke-tests |

Guide pages are `noindex` and `/g/` is disallowed in `robots.txt`. The share key is the secret, so
the page must never reach an index.

**Who serves what.** All of these are one Worker (`apps/web`), but not one router. The Hono app in
`apps/api` handles `/v1/*`, `/health`, `/g/:id/:key.md` and `/g/:id/:key/og.png`; everything else is
a Nuxt page. `apps/web/server/middleware/1.api.ts` decides, by path, and a miss there falls through
to Nuxt rather than becoming Hono's 404.

## Errors

`err(c, status, message)` for a JSON error, and every route the Hono app still owns is
machine-facing, so a miss there is JSON. Pages get Nuxt's error page (`app/error.vue`), which leads
with the case that actually happens: a share link whose key did not survive the trip.
`app.onError` logs and returns a 500 without detail.
