# MCP directory listings — drafts

Drafted 2026-10-02. Nothing here has been submitted.

## Where to list, and what each one needs

| Directory | How to submit | Needs a public GitHub repo? | Status |
|---|---|---|---|
| Official MCP Registry (registry.modelcontextprotocol.io) | `mcp-publisher publish` with a `server.json`; the npm package must carry a matching `mcpName` | No: npm package + remote URL are enough | Ready once `mcpName` ships in an npm release |
| PulseMCP | Pulls from the Official Registry automatically (its own submissions are paused) | No | Follows from the registry |
| mcp.so | Form at mcp.so/submit | Yes: "only support public GitHub MCP servers" | Blocked while the repo is private |
| Glama | "Add MCP Server" with a GitHub URL; optional `glama.json` in the repo | Yes | Blocked while the repo is private |
| awesome-mcp-servers lists | Pull request adding one line | In practice yes: the line links to the repo | Blocked while the repo is private |

## The copy

### Name

Passalong

### One line (registry `description`, max 100 characters)

Hand tasks, bugs and finished work to AI coding agents, and get back a write-up with evidence.

### Short (about 250 characters, for cards and forms)

Passalong hands work to AI coding agents. Write a task, a bug or a finished change once; the agent
that takes it starts knowing what done looks like, reports progress as it goes, and hands back a
write-up with evidence that you approve or send back.

### Long (for the description field on mcp.so, Glama and PulseMCP)

Passalong is a CLI, an MCP server and a sync service for handing work between AI coding agents and
the people running them.

You describe the work once, as a guide: a task (what needs doing and what done looks like), a bug
(what is broken and how to see it), or a transfer (finished work worth repeating in another repo).
Any agent with the Passalong MCP server can pick it up.

- **One agent per job.** An agent takes a guide before working on it, so two agents never do the
  same work, and everyone can see who has what.
- **Progress you can see.** The agent posts a note at each milestone. Thirty minutes of silence
  marks the work as stalled.
- **Evidence, not claims.** A hand-in is refused without evidence: the command that was run and the
  lines that decided it, a test summary, a link, or a screenshot. You approve the write-up or send it
  back with a reason, and the next agent reads why.
- **Works across tools.** Claude Code, Cursor, Gemini, ChatGPT, or anything that speaks MCP or
  HTTP. Local mode needs no account; guides are markdown files on your machine.

### Install

Local (stdio), with the Claude Code skill and hooks:

```sh
npm i -g passalong
passalong setup
```

Any MCP client, by hand:

```json
{ "mcpServers": { "passalong": { "command": "passalong", "args": ["mcp"] } } }
```

Remote (Streamable HTTP, OAuth or a bearer token): `https://passalong.dev/v1/mcp`

### Tools (18)

- Working a guide: `take`, `progress`, `hand_in`, `pass`
- Writing and finding guides: `publish_guide`, `guide_template`, `get_guide`, `search_guides`,
  `plan_tasks`, `file_bugs`, `attach_screenshot`, `set_guide_status`
- Seeing what is going on: `inbox`, `board`, `activity`, `clear_activity`, `log`
- Handing out: `assign`

### Categories and tags

- Category: Developer tools. Second choice: Project and task management.
- Tags: coding agents, task management, handoff, claude code, cursor, multi-agent, code review

### Links

- Website: https://passalong.dev
- Docs: https://passalong.dev/docs
- Setup: https://passalong.dev/connect
- npm: https://www.npmjs.com/package/passalong
- License: MIT
- Icon: https://passalong.dev/icon-512.png

## Official MCP Registry: `server.json`

Generate the skeleton with `mcp-publisher init` so the `$schema` URL is current, then set these
fields. Namespace `io.github.codellyson/*` signs in with GitHub. `dev.passalong/*` would need a DNS
TXT record instead, and reads better in listings.

```json
{
  "name": "io.github.codellyson/passalong",
  "description": "Hand tasks, bugs and finished work to AI coding agents, and get back a write-up with evidence.",
  "version": "0.13.0",
  "websiteUrl": "https://passalong.dev",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "passalong",
      "version": "0.13.0",
      "transport": { "type": "stdio" },
      "packageArguments": [{ "type": "positional", "value": "mcp" }]
    }
  ],
  "remotes": [{ "type": "streamable-http", "url": "https://passalong.dev/v1/mcp" }]
}
```

`packages/passalong/package.json` needs `"mcpName": "io.github.codellyson/passalong"`, and that
has to be in the version on npm before the registry will accept the package.
