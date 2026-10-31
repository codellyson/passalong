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

## Work

A row in `work` is one piece of work; the paths keep the old name, the words people see do not.

| Route | Access | Notes |
| --- | --- | --- |
| `PUT /v1/work/:id` | owner | Body is `text/markdown` (or `{ markdown }`). The markdown is the record; `team`/`to` are read from its frontmatter. `title` and `summary` are required; a `kind:` line is refused by name. New work is Ready unless it says `status: draft`. |
| `GET /v1/work/:id` | owner or team member | Returns markdown. **Records a pull** unless `?peek=1`. |
| `GET /v1/work?q=&scope=` | account | `scope=all` (default) `\| mine \| <team slug>` |
| `GET /v1/work/:id/parent?markdown=` | reader | The work this came out of, filtered on its own, clipped at 32 KB |
| `GET /v1/work/:id/context` | reader | The hub's read; see below |
| `GET /v1/work/:id/thread` | reader | The thread, from `task_event` alone |
| `PATCH /v1/work/:id/status` | team: `draft`/`ready`; author or admin: `done` | Ready, Move to Draft, archive. Held work cannot return to Draft until it is taken back. Any other status is refused (400). |
| `DELETE /v1/work/:id` | author or team admin | |
| `POST /v1/take` | account | `{ agent, id?, repo?, host?, worktree?, any? }` — hold work by id, or the next for `repo`. One holder. |
| `PUT /v1/work/:id/progress` | holder | `{ agent, note?, fence? }` — renew the lease, set the board's line |
| `POST /v1/work/:id/hand_in` | holder | `{ agent, note, evidence\|checks, writeup?, pr?, fence? }` — final: Done with what was shown. Refused without proof. |
| `POST /v1/work/:id/pass` | holder, or anyone it reached | `{ agent, why }` — back to the queue; on work you do not hold it is "not for me" |
| `POST /v1/work/:id/ask`, `POST /v1/work/:id/reply` | holder; author, assignee or holder | The question and the answer; a reply on work nobody holds is a note for whoever takes it |
| `POST /v1/work/:id/release`, `/reopen`, `/assign`, `/recall` | team | Take it back; finished work back to To do with `{ why }`; give it to `{ to }`; take back what you sent |
| `PUT /v1/work/:id/alone` | a person in the hub | Safe for the runner; refused to the CLI and both MCP servers |
| `POST /v1/tasks/next` | account | The runner's and `passalong work`'s next ready work, `{ alone }` for marked work only |
| `GET /v1/tasks`, `GET /v1/working` | account | All work you can see with its column and claim; what is held now |
| `POST /v1/compose`, `/v1/compose/preview`, `GET /v1/compose/recent` | account | The hub's box: words and pictures become work, named by the reader |
| `POST /v1/in/:key` | **the key is the credential** | Webhooks into email-in: Sentry, PostHog, or `{ title, text?, url?, id? }`; `?repo=`, `?team=`, `&to=` |
| `GET /v1/support`, `POST /v1/work/:id/customer[/draft]` | team | Customer requests; a reply to a customer is sent only by a person in the hub |
| `GET /v1/board` | account | The hub's queues: waiting, in flight, landed |
| `POST /v1/subscribe` | account — → a Bachs checkout URL for Solo |
| `POST /v1/teams/:slug/subscribe` | team **owner** — → a Bachs checkout URL for Team (flat, up to 10 people). Refused for a team already over 10, which is set up by hand |
| `POST /v1/billing/portal` | account — `{ team? }` → a one-time Bachs billing page for that team's subscription (owner only) or your own Solo one |
| `GET /v1/billing` | account — `{ mode }`: `unset`, `test` or `live`, read off the key. Never a key |
| `POST /v1/billing/webhook/bachs` | **none** — the signature over the raw body is the credential. 200 with `applied: false` for an event we do not act on, a subscription we do not know, or one older than what is stored |
| `GET /v1/log?repo=&since=&limit=` | account | Your own acts, newest first. `since` is a date prefix (`2026`, `2026-09`, `2026-09-11`) and anything else is a 400 |
| `GET /v1/notifications?unread=&scope=` | account | `scope=all` (default), `mine`, or a team slug. The unread count follows the same scope. |
| `POST /v1/notifications/read?scope=` | account | `{ ids? }` — everything unread in the selected scope when `ids` is omitted |

`GET /v1/tasks` and `/v1/working` accept the same optional `scope`. Each narrows in SQL before its
row limit; an unknown or inaccessible team slug is a 404.

The hub's own take, progress and finish use `POST /v1/tasks/:id/person-take`,
`PUT /v1/tasks/:id/person-progress` and `POST /v1/tasks/:id/person-hand_in`: a person's hold, with a
prose hand-in. The agent routes keep their `agent` identity and contract.

## Projects

| Route | Access | Notes |
| --- | --- | --- |
| `GET /v1/projects?scope=`, `POST /v1/projects` | account | List visible projects or make one; `team`, `parent` and `color` are optional on creation |
| `GET /v1/projects/:id` | creator or current team member | Project metadata, breadcrumbs, sub-project, documents, files and linked work (with its tags) |
| `PATCH /v1/projects/:id` | project writer | Rename, describe, recolor or move; cycles and moves across spaces are refused |
| `POST /v1/projects/:id/documents` | project reader | `{ name, body }` creates a Markdown document |
| `GET`, `PUT`, `DELETE /v1/projects/:id/documents/:document` | project reader | Save requires `{ body, version }`; stale version returns 409 |
| `GET /v1/projects/:id/documents/:document/revisions[/:version]` | project reader | List and read saved versions |
| `POST`, `GET`, `DELETE /v1/projects/:id/files[/:file]` | project reader | Raw upload, private download and removal; images, PDFs, ZIPs and text up to 10 MB |
| `POST /v1/uploads` with `{ project, name }`, then `PUT /v1/uploads/:token` | project writer, then one-time link | A sandbox can send a file directly to that project; the link expires in 10 minutes and works once |
| `GET /v1/projects/:id/files/:file/agent` | project reader | Bounded image or text for MCP context |
| `POST /v1/projects/:id/work`, `DELETE /v1/projects/:id/work/:work` | project reader | Link or unlink work without changing it (the hub's; agents have no tool for it) |
| `DELETE /v1/projects/:id` | creator or team owner | Deletes the project subtree, documents and files, never linked work; a team owner must delete a subtree with teammates' projects |

Projects (projects, to people and agents) may nest at multiple levels. Their files belong to the
project and are independent of work's attachments. A private project is visible only to its creator; any current member may use a team
project. Inaccessible ids answer 404.

## Files

Pictures and other files on work. Bug report sets (`/v1/reports`) went in migration 0061: a set of
bugs is parent work now.

| Route | Access | Notes |
| --- | --- | --- |
| `POST /v1/shots` | account | Raw image bytes with a content-type — png, jpeg, webp, gif, ≤5MB. Not multipart: one file per request. |
| `GET /v1/shots/:id` | **anyone with the id** | Like the share link that embeds it. An image behind a login renders as a broken image in the document it was pasted into. |
| `POST /v1/uploads` | account | `{ name? }` → `{ upload_url, expires }`: a one-time link for one screenshot. Ten minutes, 20 open per account (429 past that). |
| `POST /v1/attachments`, `GET /v1/attachments/:id` | account; a reader of the work | Any other file, ≤10MB, always served as a download with `nosniff`; 404 never 403 |
| `PUT` or `POST /v1/uploads/:token` | **anyone with the link** | Raw bytes, no credential (`kind` image or file). The type is read from the bytes, not the header. → `{ shot, markdown }`; 410 once spent or expired. |

An upload link exists for something that holds an image as a file and cannot send a credential with
it — in practice, Claude's code sandbox. See `src/uploads.ts`. The link is stored hashed, and it is
spent by one conditional `UPDATE`, so two uploads racing for it cannot both land. Everything that can
be checked without spending it (size, type) is checked first, so a wrong file does not burn the link.

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
above, dispatched back through the app with the caller's account. They are the seventeen of
`docs/WORK.md` but `accounts` (here the token is the account): `take`, `progress`, `hand_in`,
`pass`, `ask`, `create_work`, `find_work`, `update_work`, `find_projects`, `save_project`,
`read_document`, `save_document`, `delete_document`, `add_file`, `read_file`, `delete_file`. Every
tool declares annotations and an output schema, and returns `structuredContent` beside its text.
`find_work` with nothing is drawn as a board by hosts that support MCP Apps (`ui://passalong/work`).

A file reaches this server one of two ways, because MCP has no standard file input yet:

- **ChatGPT** fills a file input. `add_file`, and the top-level `files` on `create_work`, are
  declared through `openai/fileParams`; ChatGPT passes a `download_url` and the tool fetches it
  (public https only) and stores it. Only top-level fields can be files, which is why a
  `create_work` item names its files by position.
- **Claude** has the file in its code sandbox and nothing to put it in. `add_file` without a file
  mints an upload link and returns the `curl` command that sends the file to it; the bytes go from
  the sandbox to the API and never through the model. The sandbox has to be allowed to reach
  `passalong.dev`.

`src/mcp-http.ts` takes its vocabulary as an argument rather than importing `./work.js`: a sibling
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

`GET /v1/work/:id` recording a pull is the one side effect on a GET in this API. It is
deliberate: a pull is the event the author needs to see, and making it a separate call would mean
trusting clients to report it. Keep it in mind when adding caching or prefetching.

A hand-in needs proof a person can look at: a screenshot, or a command and its line of output
(`proofProblem()`). Proof on work is deleted 5 days after it is closed.

`GET /v1/events` is a Server-Sent Events stream for the signed-in account: `event: note` carries a
notification (the same shape as `GET /v1/notifications`), `event: change` carries `{ work_id, at }`
for work whose hold, progress note or standing proof moved. Each event's `id` is a cursor; send it back
as `Last-Event-ID` to resume. A connection ends after about four minutes.

`GET /v1/push` says whether push is set up and lists your devices; `POST /v1/push/subscriptions`
takes a browser's `PushSubscription.toJSON()` (https endpoint, 65-byte `p256dh`, 16-byte `auth`)
plus `label` and `private`; `PATCH` sets `private`, `DELETE` removes one, and
`POST /v1/push/subscriptions/:id/test` sends a test notice to it.

`GET /v1/work/:id/context` is the hub's read of a piece of work and records **no** pull: its
summary, every live claim with what was handed in (`risk` to the author only), what it was finished
with (`proofs`), the work it came out of, the work made from it, and what it blocks and is blocked
by. Each related piece of work is filtered for the caller on its own, as `/parent` is. It carries
no markdown.

## Web routes

| Route | Serves |
| --- | --- |
| `GET /` | The landing page |
| `GET /w/:id/:key` | The read-only share page. `?embed=1` is the document alone, for the hub to frame. |
| `GET /w/:id/:key.md` | Raw markdown. Also records a pull. |
| `GET /w/:id/:key/og.png` | The unfurl card. Deliberately does **not** record a pull — crawlers, not people. |
| `GET /hub` | The hub: work, projects, support, activity and settings; talks to `/v1/*` |
| `GET /join/:code` | Where an invite link lands |
| `GET /reset` | Set a new password from an emailed link |
| `GET /hub/new` | The box: say what needs doing, with pictures, and the reader files it |
| `GET /hub/work` | The team board |
| `GET /hub/w/:id` | One piece of work signed in: the share page framed beside who has it, the thread, what it was finished with and what it is tied to |
| `GET /health` | `{"ok":true}` — what CI smoke-tests |

Share pages are `noindex` and `/w/` is disallowed in `robots.txt`. The share key is the secret, so
the page must never reach an index.

**Who serves what.** All of these are one Worker (`apps/web`), but not one router. The Hono app in
`apps/api` handles `/v1/*`, `/health`, `/w/:id/:key.md` and `/w/:id/:key/og.png`; everything else is
a Nuxt page. `apps/web/server/middleware/1.api.ts` decides, by path, and a miss there falls through
to Nuxt rather than becoming Hono's 404.

## Errors

`err(c, status, message)` for a JSON error, and every route the Hono app still owns is
machine-facing, so a miss there is JSON. Pages get Nuxt's error page (`app/error.vue`), which leads
with the case that actually happens: a share link whose key did not survive the trip.
`app.onError` logs and returns a 500 without detail.
