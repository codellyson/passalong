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
| `POST /v1/invites/:code/accept` | account — 402 when the team is `lapsed` or its seats are full; an existing member is never refused |

## Guides

| Route | Access | Notes |
| --- | --- | --- |
| `PUT /v1/guides/:id` | owner | Body is `text/markdown`, not JSON. The markdown is the record; `team`/`to` are read from its frontmatter. |
| `GET /v1/guides/:id` | owner or team member | Returns markdown. **Records a pull.** |
| `GET /v1/guides?q=&scope=` | account | `scope=all` (default) `| mine | <team slug>` |
| `PATCH /v1/guides/:id/status` | owner: `draft`/`published`/`consumed`; team member: `consumed` or `published` only | Archiving, not judgement — the verdict says whether it worked. `promoted` is refused by name (400) on this route and cannot be acquired through `PUT /v1/guides/:id` either; a guide already carrying it keeps it |
| `PUT /v1/guides/:id/verdict` | account | `{ ok, note? }` |
| `DELETE /v1/guides/:id` | **owner only** | |
| `GET /v1/inbox` | account | Handed to you or your teams, not yet pulled |
| `GET /v1/board` | account | The queues: waiting, not working, in flight, landed |
| `POST /v1/subscribe` | account — `{ provider }` → a hosted checkout URL for Solo. No seat count: the plan is one person |
| `POST /v1/teams/:slug/subscribe` | team **owner** — `{ provider, seats }` → a hosted checkout URL. Seats may not be fewer than the team's current members |
| `PATCH /v1/teams/:slug/seats` | team **owner** — `{ seats }`, paid plans only. Answers with the *confirmed* count and the pending one; the webhook is what writes it. Paystack cannot change quantity after a subscription starts and says so |
| `GET /v1/billing` | account — which providers are configured and in which mode. Never a key |
| `POST /v1/billing/webhook/:provider` | **none** — the signature over the raw body is the credential. `stripe` or `paystack`; anything else is 404. 200 with `applied: false` for an event we do not act on or a subscription we do not know |
| `GET /v1/log?repo=&since=&limit=` | account | Your own acts, newest first. `since` is a date prefix (`2026`, `2026-09`, `2026-09-11`) and anything else is a 400 |
| `GET /v1/notifications?unread=` | account | |
| `POST /v1/notifications/read` | account | `{ ids? }` — everything unread when `ids` is omitted |

## Bug reports

A bug is a guide with `kind: bug` in its frontmatter, filed through the same `PUT /v1/guides/:id`
as everything else — there is no second write path, so an issue filed from the hub is byte-for-byte
a document the CLI would accept. A report is the parent that keeps a set together.

| Route | Access | Notes |
| --- | --- | --- |
| `POST /v1/reports` | account | `{ title?, environment?, team?, to? }` → an id for each issue's `report:` frontmatter |
| `GET /v1/reports/:id` | owner or team member | The report and its issues, grouped by product area |
| `PATCH /v1/reports/:id` | owner | Title, environment, and who it went to |
| `GET /v1/reports` | account | Yours, newest first, with counts |
| `POST /v1/shots` | account | Raw image bytes with a content-type — png, jpeg, webp, gif, ≤5MB. Not multipart: one file per request. |
| `GET /v1/shots/:id` | **anyone with the id** | Like the guide that embeds it. An image behind a login renders as a broken image in the document it was pasted into. |
| `POST /v1/uploads` | account | `{ name? }` → `{ upload_url, expires }`: a one-time link for one screenshot. Ten minutes, 20 open per account (429 past that). |
| `PUT` or `POST /v1/uploads/:token` | **anyone with the link** | Raw image bytes, no credential. The type is read from the bytes, not the header. → `{ shot, markdown }`; 410 once spent or expired. |

An upload link exists for something that holds an image as a file and cannot send a credential with
it — in practice, Claude's code sandbox. See `src/uploads.ts`. The link is stored hashed, and it is
spent by one conditional `UPDATE`, so two uploads racing for it cannot both land. Everything that can
be checked without spending it (size, type) is checked first, so a wrong file does not burn the link.

A report you cannot see answers 404, not 403: which reports an account has is not something a
status code should confirm.

## MCP over HTTP

`POST /v1/mcp` is the same MCP server the CLI runs over stdio, served at an address for assistants
that add outside tools as remote servers. Streamable HTTP, stateless, `enableJsonResponse` — every
tool is a request and a response, so there is no session to keep and no Durable Object to keep it
in, and a fresh server per request is correct on a runtime that may hand the next one to a
different isolate.

It sits under `/v1/` so the credential middleware has already run: the bearer token that
authenticates everything else authenticates this, and so does a connector's OAuth access token,
which reaches this endpoint and nothing else (see [auth](auth.md)).

The tools reimplement nothing — each is a name, a description and a schema mapped onto a route
above, dispatched back through the app with the caller's account. They are `search_guides`,
`get_guide`, `inbox`, `board`, `log`, `publish_guide`, `take`, `progress`, `hand_in`, `pass`, `file_bugs`,
`attach_screenshot`, `create_upload` and `get_report`. The stdio server has the ones that touch a
working directory, which a hosted server does not. Every tool declares annotations and an output
schema, and returns `structuredContent` beside its text.

A screenshot reaches this server one of two ways, because MCP has no standard file input yet:

- **ChatGPT** fills a file input. `attach_screenshot`, and the top-level `attachments` on
  `publish_guide` and `file_bugs`, are declared through `openai/fileParams`; ChatGPT passes a
  `download_url` and the tool fetches it (public https only) and stores it through `/v1/shots`. Only
  top-level fields can be files, which is why a `file_bugs` issue names its attachments by position.
- **Claude** has the file in its code sandbox and nothing to put it in. `create_upload` mints an
  upload link and returns the `curl` command that sends the file to it; the bytes go from the
  sandbox to the API and never through the model. The sandbox has to be allowed to reach
  `passalong.dev`. A tool passed a sandbox path instead of a URL answers by naming `create_upload`.

`src/mcp-http.ts` takes its vocabulary as an argument rather than importing `./guide.js`: a sibling
imported that way makes the module unloadable under Node's type stripping, which is what keeps the
app itself untestable. Passing it in is what buys the tests in `test/mcp-http.test.mjs`.

## Describing the API

`GET /v1/openapi.json` (public) describes this surface for agents that only speak HTTP — a ChatGPT
action, Gemini function calling — since `passalong mcp` is stdio and reaches only things that can
run a local process. `servers[0].url` comes from `origin()` — the apex, since `PUBLIC_ORIGIN`
names it — which is why it is served rather than committed as a file: a document naming the wrong
host produces calls that 404 with no explanation.

It deliberately omits signup, login, password reset and token management. An action schema is a
list of things you are inviting a model to call.

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
| `GET /hub/report` | File a set of bugs; the one authoring surface in the product |
| `GET /hub/report/:id` | One report and its issues |
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
