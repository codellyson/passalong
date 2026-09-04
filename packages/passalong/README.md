# passalong

Hand finished work to another context.

Solve something non-trivial in one agent session. Run one command. Open a session in another
repo, on another machine, or with a teammate, and the agent there already knows the whole story:
the problem, the decisions and why, the steps, how to verify, and what went wrong along the way.

```sh
npm i -g passalong
passalong setup      # installs the Claude Code capture skill + registers the MCP server
passalong login      # optional: sync guides across machines and get share links
```

## The loop

1. **Finish work** in Claude Code (or any agent). Say *"pass this along"*, run `/passalong-capture`, or
   run `passalong share` yourself.
2. **Trim and publish.** The draft opens in your editor. Save it and you get a short id and a link.
3. **Pull on the other side.** `passalong pull <id>` in the target repo, or paste the link to any
   agent with the Passalong MCP server. The guide lands in its context; it implements, adapting the
   parts marked `ASSUMES:`.
4. **Close.** `passalong done <id>` when it landed. `passalong promote <id>` if it keeps getting pulled.

## Commands

```
passalong share [file]        publish a guide (newest draft, or a scaffold you edit) → id + link
passalong pull <id|link>      fetch a guide into ./.passalong/ and print it
passalong list [query]        your guides, local and synced
passalong open <id> [--print] view a guide in the browser (or the terminal)
passalong hub                 open your synced guides in the browser
passalong done <id>           mark consumed: implemented on the receiving side
passalong promote <id>        mark promoted: graduated into a reusable reference
passalong rm <id>             delete a guide locally and from sync
passalong export [dir]        dump every guide as plain markdown
passalong login [token]       create an account, or attach this machine to an existing one
passalong setup               install the Claude Code capture skill + register the MCP server
passalong mcp                 run the MCP server over stdio
```

## MCP

`passalong setup` registers the server with Claude Code. For other clients, run `passalong mcp` over stdio.

Tools: `search_guides`, `get_guide`, `publish_guide`, `guide_template`, `set_guide_status`.

## Guides are files

Plain markdown with frontmatter in `~/.passalong/guides`. Yours to edit, grep, and commit.
`passalong export` dumps everything. Works with no account; `passalong login` adds sync and share links.

Point at a self-hosted server with `PASSALONG_API=https://your-host` before `passalong login`.
