# passalong

Hand work to your AI coding agents, and get back what they did and how they checked it.

Write a task, a bug or a finished change once. The agent that takes it starts knowing what done
looks like and what was already decided, reports as it goes, and hands back a write-up with the
evidence for each thing you asked for, which you approve or send back. One agent per job, and
everyone can see who has what. Works with Claude Code, Codex, ChatGPT, Claude, or anything that
speaks MCP or HTTP. See [passalong.dev](https://passalong.dev).

```sh
npm i -g passalong
passalong setup      # installs the Claude Code capture skill + registers the MCP server
passalong login      # optional: sync guides across machines and get share links
codex mcp add passalong -- passalong mcp   # Codex: the same MCP server
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
passalong share [file] [--to team[/handle]]  publish a guide → id + link, Ready; --to addresses it
passalong pull <id|link>      print a guide; --save also writes ./.passalong/<id>.md (git-ignored)
passalong inbox               guides handed to you that you have not pulled yet
passalong board               waiting on you, in flight, landed, worth keeping
passalong activity [--all]    what happened while you were away; clears unless --all
passalong list [query]        your guides and your teams'
passalong open <id> [--print] view a guide in the browser (or the terminal)
passalong hub                 open your synced guides in the browser
passalong archive <id>        off your board and out of the free tier's count (was `done`)
passalong promote <id>        deprecated: mark promoted
passalong rm <id>             delete a guide locally and from sync
passalong export [dir]        dump every guide as plain markdown
passalong login               sign in from the browser
passalong login --with-token  read a token from stdin instead (CI, scripts)
passalong login --new         add another account to this machine
passalong accounts            the accounts signed in here, and which is the default
passalong use <name>          make one of them the default
passalong logout [name]       forget one of them (default: the current one)
passalong me [--handle H] [--name N] [--email E]   who you are to teammates
passalong team                current team and its members
passalong team create <name>  start a team (you become its owner)
passalong team invite [email] make an invite link (mailed when an email is given)
passalong team join <link>    accept an invite
passalong team use <slug>     switch the current team
passalong setup               install the Claude Code capture skill + register the MCP server
passalong mcp                 run the MCP server over stdio
passalong version             print the installed version (also -v, --version)
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

Every guide, whatever its kind, moves the same way: it is Ready when shared (or a draft, with
`status: draft`, until a person runs `passalong ready <id>`), then whoever takes it (`passalong take <id>`) holds it, hands it in with
the evidence, and a person approves it or sends it back with the reason (`passalong approve` /
`passalong reject`).

Sign in at [the hub](https://passalong.dev/hub) with an email and password, and mint
an API token there for the CLI and MCP servers — named, revocable, and shown once. Your password
never goes near the terminal. `passalong login` with no arguments still makes an account without
any of that; add an email and password later to be able to sign in from a browser and recover it.

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

## Guides are plain markdown

Plain markdown with frontmatter, held on the server; nothing piles up on your machine. Ask for a
file when you want one: `passalong pull <id> --save`, or `passalong export` for every guide.

Point at a self-hosted server with `PASSALONG_API=https://your-host` before `passalong login`.

## More than one account

A machine can be signed in to several accounts, say a work one and a personal one.
`passalong login --new` adds another beside the first, `passalong accounts` lists them, and
`passalong use <name>` picks the default a person at a terminal gets.

An agent has no terminal to be asked at, so with two or more accounts and nothing saying which, it
is refused and told to ask you. It puts the question to you in plain words, you answer, and it calls
`use_account` with the name. That lasts for the session and moves nothing on disk. From a shell,
`--as <name>` or `PASSALONG_ACCOUNT=<name>` says the same for one command. The team you work in
(`passalong team use`) belongs to the account, not the machine.
