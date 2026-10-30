# Surfaces

Every answer exists in all three of the hub, the MCP tools and the CLI — take, progress, hand in,
pass, reopen, Ready and Draft, archive — because a signal in only two is one a third of users cannot
send. Sending to a customer is the one deliberate exception: the hub only.

## CLI — `packages/passalong`

Published to npm as `passalong` (0.22.0 speaks work). Plain ESM, few flags on purpose. Work lives on
the server and the CLI keeps no copy unless asked: `take --save` writes `.passalong/<id>.md`, and
`export` walks `GET /v1/export`. Writing work needs an account. `tidy()` clears copies older CLIs
left, once per machine. Prints the id on stdout and everything else on stderr, so
`ID=$(passalong new draft.md)` works.

- `new` (a sentence or a file), `board`, `list`, `open`, `take`, `progress`, `hand-in`, `pass`,
  `ask`, `reply`, `assign`, `release`, `reopen`, `ready`, `archive`, `rm`, `attach`, `work`, `hub`,
  `export`… `share`, `task`, `pull`, `start`, `inbox`, `activity`, `log`, `tasks`, `recall`,
  `approve`, `reject` and `done` are gone.
- `passalong setup` installs the Claude Code capture skill, the MCP server and hooks. The skill writes
  what a session learned into the project's documents, with a line on its Log — never a document for one person.
- **Too old is refused, not warned.** Every call carries `x-passalong-version`; below `MIN_CLIENT`
  (currently 0.20.0; 0.22.0 once it is `latest` on npm) the API answers 426 with the install
  command. An agent never reads stderr, so the refusal is the one text it is sure to see. The
  package release is staged by CI and requires a maintainer's npm approval.

## MCP — one set of tools, served two ways

- **stdio**: `passalong mcp` (`packages/passalong/src/mcp.js`), for anything that runs a process.
- **HTTP**: `POST /v1/mcp` (`apps/api/src/mcp-http.ts`), for assistants that add remote servers.
  It owns no logic: every tool dispatches back through the app's own routes with the caller's token,
  so each rule lives in one route. Stateless.
- **17 tools over four nouns** (docs/WORK.md). Work: `take`, `progress`, `hand_in`, `pass`, `ask`,
  `create_work` (one or many; `draft: true` for a plan), `find_work` (an id reads it, words search,
  nothing is the board), `update_work`. Projects: `find_projects`, `save_project`, `read_document`,
  `save_document`, `delete_document`. Files: `add_file` (a path over stdio; a file input or a
  one-time upload link over HTTP), `read_file`, `delete_file`. Account: `accounts`, stdio only —
  over HTTP the bearer token is the account, so it has 16. About 45 older tools went: one tool per job.
  Tool names, descriptions and instructions use only the four nouns. `find_work` with nothing is still drawn as a
  board in hosts with MCP Apps.

## API — `/v1/*`

Hono on D1, mounted inside the web Worker. Bearer token (CLI, MCP) or session cookie (hub) through one
middleware. Full list in [docs/wiki/api.md](../wiki/api.md).

## Share links

`/w/:id/:key` — the id is an address, the **key is the secret**. Renders the work plainly, with no
script, for anyone holding it; `.md` gives the raw markdown to an agent. `?embed=1` is the document alone, for the
hub to frame.

## Unfurl cards

`/w/:id/:key/og.png`, drawn with satori/resvg. Each card is drawn once and kept in the edge cache,
keyed by a hash of its markup — a retitled piece of work is a new key, never a stale picture, and the share
key never reaches the cache. The edge cache works only on the custom domains, not `workers.dev`.

## Sources
- `packages/passalong/bin/passalong`, `src/passalong.js`, `src/mcp.js`, `src/api.js`
- `apps/api/src/mcp-http.ts`, `apps/api/src/clients.ts`, `apps/api/src/og.ts` (`cached`)
- [AGENTS.md](../../AGENTS.md): "The MCP server is served two ways…", "A CLI too old…", "Every answer exists in all three places…"
- `apps/web/public/llms.txt` — the public version for agents using it
