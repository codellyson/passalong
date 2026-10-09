# Surfaces

Every answer a reader can give exists in all three of the hub, the MCP tools and the CLI — a signal
in only two of them is one a third of users cannot send.

## CLI — `packages/passalong`

Published to npm as `passalong`. Plain ESM, few flags on purpose, works offline against a local store
at `~/.passalong` (sync is additive; failures degrade to a warning). Prints the guide id on stdout and
everything else on stderr, so `ID=$(passalong share draft.md)` works.

- `share`, `pull`, `take`, `pass`, `works`, `broken`, `done`, `task`, `ready`, `work`, `attach`,
  `board`, `log`, `export`…
- `passalong setup` installs the Claude Code capture skill, the MCP server and hooks. The skill
  tells an agent to state a guide's kind and use a folder for continuing project material.
- **Too old is refused, not warned.** Every call carries `x-passalong-version`; below `MIN_CLIENT`
  (currently 0.15.0) the API answers 426 with the install command. An agent never reads stderr, so
  the refusal is the one text it is sure to see. Raise the floor only after that version is
  `latest` on npm. The package release is staged by CI and requires a maintainer's npm approval.

## MCP — one set of tools, served two ways

- **stdio**: `passalong mcp` (`packages/passalong/src/mcp.js`), for anything that runs a process.
- **HTTP**: `POST /v1/mcp` (`apps/api/src/mcp-http.ts`), for assistants that add remote servers.
  It owns no logic: every tool dispatches back through the app's own routes with the caller's token,
  so each rule lives in one route. Stateless.
- Tools: `take`, `progress`, `hand_in`, `pass`, plus `search_guides`, folder listing and document
  revision tools, `inbox`, `board`, `log`,
  `get_guide` (reads only), `publish_guide`, `file_bugs`, `attach_screenshot`, `plan_tasks`…

## API — `/v1/*`

Hono on D1, mounted inside the web Worker. Bearer token (CLI, MCP) or session cookie (hub) through one
middleware. Full list in [docs/wiki/api.md](../wiki/api.md).

## Share links

`/g/:id/:key` — the id is an address, the **key is the secret**. Renders the guide with no script for
anyone holding it; `.md` gives the raw markdown to an agent. `?embed=1` is the document alone, for the
hub to frame.

## Unfurl cards

`/g/:id/:key/og.png`, drawn with satori/resvg. Each card is drawn once and kept in the edge cache,
keyed by a hash of its markup — a retitled guide is a new key, never a stale picture, and the share
key never reaches the cache. The edge cache works only on the custom domains, not `workers.dev`.

## Sources
- `packages/passalong/bin/passalong`, `src/passalong.js`, `src/mcp.js`, `src/api.js`
- `apps/api/src/mcp-http.ts`, `apps/api/src/clients.ts`, `apps/api/src/og.ts` (`cached`)
- [AGENTS.md](../../AGENTS.md): "The MCP server is served two ways…", "A CLI too old…", "Every answer a reader can give…"
- `apps/web/public/llms.txt` — the public version for agents using it
