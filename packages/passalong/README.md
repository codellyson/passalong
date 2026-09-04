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
passalong share [file] [--to team[/handle]]  publish a guide → id + link; --to hands it to a team or teammate
passalong pull <id|link>      fetch a guide into ./.passalong/ (git-ignored) and print it
passalong inbox               guides handed to you that you have not pulled yet
passalong board               waiting on you, in flight, landed, worth keeping
passalong activity [--all]    what happened while you were away; clears unless --all
passalong list [query]        your guides and your teams', local and synced
passalong open <id> [--print] view a guide in the browser (or the terminal)
passalong hub                 open your synced guides in the browser
passalong done <id>           mark consumed: implemented on the receiving side
passalong promote <id>        mark promoted: graduated into a reusable reference
passalong rm <id>             delete a guide locally and from sync
passalong export [dir]        dump every guide as plain markdown
passalong login [token]       create an account, or attach this machine to an existing one
passalong me [--handle H] [--name N] [--email E]   who you are to teammates
passalong team                current team and its members
passalong team create <name>  start a team (you become its owner)
passalong team invite [email] make an invite link (mailed when an email is given)
passalong team join <link>    accept an invite
passalong team use <slug>     switch the current team
passalong setup               install the Claude Code capture skill + register the MCP server
passalong mcp                 run the MCP server over stdio
```

## Teams

A team is the unit of sharing. Members can find, pull, and mark consumed every guide shared to
the team; a guide can also be handed to one person, who sees it in their inbox (and by email
when the server has mail configured).

```sh
passalong me --handle lukman            # how teammates address you
passalong team create Khaime            # you become owner; "khaime" is now current
passalong team invite ada@example.com   # or no email: prints a link to send yourself
passalong team join <link>              # on Ada's machine — or she just opens the link
passalong share --to khaime/ada         # hand this guide to Ada
passalong inbox                         # on Ada's side: what was handed to you
passalong activity                      # back on your side: it landed, and who pulled it
```

Not everyone who receives a guide implements it. Every guide page has a **Verify** view
(`?view=verify`) that leads with Problem, Verification and Gotchas and folds the implementation
away — for a tester or anyone checking the work rather than doing it. Invites are accepted in the
browser, so a teammate needs no terminal to be part of a team.

`passalong activity` is the other half of the transfer: it tells you when someone pulled a guide
you handed over, when they marked it consumed, and when an invite was taken up. A handoff
addressed to a person is also emailed; a team-wide share is not, because mail nobody is
named in is the first thing people filter out. Guides that keep getting pulled get a nudge to
promote them into the team's small set of maintained references.

## MCP

`passalong setup` registers the server with Claude Code. For other clients, run `passalong mcp` over stdio.

Tools: `search_guides`, `inbox`, `get_guide`, `publish_guide` (with `to`), `guide_template`, `set_guide_status`.

## Guides are files

Plain markdown with frontmatter in `~/.passalong/guides`. Yours to edit, grep, and commit.
`passalong export` dumps everything. Works with no account; `passalong login` adds sync and share links.

Point at a self-hosted server with `PASSALONG_API=https://your-host` before `passalong login`.
