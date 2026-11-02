# passalong

Work for your team and its AI agents, and what they know.

Say what needs doing once — in a sentence, with a screenshot, from email or a webhook. Whoever it is
for, a person or their agent, takes it, says how it is going, and hands it in with the evidence, and
it is Done. What the agent learned goes into the project's documents, where the next one finds it.
Everyone can see who has what. Works with Claude Code, Codex, ChatGPT, Claude, or anything that
speaks MCP or HTTP. See [passalong.dev](https://passalong.dev).

```sh
npm i -g passalong
passalong setup      # the Claude Code capture skill, the MCP server and hooks
passalong login      # approve this machine in the hub; no password typed
codex mcp add passalong -- passalong mcp   # Codex: the same MCP server
```

## The loop

1. **Write it down.** `passalong new "the upload button does nothing"`, the hub's box, or an agent's
   `create_work`. Work has no kinds and no required sections: a title, a one-line summary, and
   whatever the next reader needs. It is Ready at once unless you say `--draft`.
2. **Take it.** `passalong take <id>` (or `take` with no id for the next one here) holds it: nobody
   else can take it while you do, and whoever sent it sees you are on it.
3. **Say how it is going.** `passalong progress <id> "migration written"`. Stuck or not yours:
   `passalong pass <id> <why>`. Need an answer: `passalong ask <id> <question>`.
4. **Hand it in.** `passalong hand-in <id> <note> --evidence "npm test: 42 passing"`. It goes to Done
   with what you showed; a person can `reopen` it with a reason if it is not right.
5. **Keep what you learned.** Say *"pass this along"* or run `/passalong-capture`: the skill writes it
   into the project's documents and a line on its Log.

## Commands

```
passalong new "<what needs doing>" [--to TARGET] [--parent ID] [--draft]  write work down
passalong new <file.md> [--to TARGET] [--parent ID] [--draft]  the same, from a file
passalong board               what needs you, who is on what, and what is ready
passalong list [query]        work you and your teams can see, newest first
passalong open <id> [--print] view work in the browser (or the terminal)
passalong take [id] [--save]  you are doing it; --save also writes ./.passalong/<id>.md (git-ignored)
passalong progress <id> <note>  still on it, with a one-line note the hub shows
passalong hand-in <id> <note> --evidence TEXT [--writeup TEXT] [--pr LINK]  it is done
passalong pass <id> <why>     not yours, or stuck: hands it back with your reason
passalong ask <id> <question> ask the person, keep it, and wait for their answer
passalong reply <id> <text>   write to whoever holds it (--file PATH to attach); or leave a note
passalong assign <id> <to>    give it to @handle (or several), a #group, or "team"
passalong release <id>        take work back from whoever holds it
passalong reopen <id> <why>   finished work isn't right: back to To do, with why
passalong ready <id...|--all> drafts you have read are Ready
passalong archive <id>        off the board and out of the free tier's count
passalong rm <id>             delete it
passalong attach <file>       upload a picture or file and print the markdown that points at it
passalong work [--once] [--agent CMD]  run an agent on each piece of ready work here, in turn
passalong work --watch        the runner: keep taking work a person marked safe to run alone
passalong now                 what this worktree holds and what is waiting
passalong hub                 open the hub in the browser
passalong export [dir]        every piece of work as plain markdown
passalong login [--new | --with-token]   sign in from the browser, add an account, or read a token
passalong accounts | use <name> | logout [name]   the accounts on this machine
passalong me [--handle H] [--name N] [--email E]   who you are to teammates
passalong team [create <name> | invite [email] | join <link> | use <slug>]   teams
passalong setup               install the capture skill, MCP server and hooks
passalong mcp                 run the MCP server over stdio
passalong version             print the installed version (also -v, --version)
```

## Teams

A team is where work goes. Everyone in it sees the same board; work can be sent to one person
(`--to khaime/@ada`), a group (`--to khaime/#frontend`) or the whole team, and whoever it names is
told — by email too, when the server has mail configured.

```sh
passalong me --handle lukman            # how teammates address you
passalong team create Khaime            # you become owner; "khaime" is now current
passalong team invite ada@example.com   # or no email: prints a link to send yourself
passalong new "Fix the upload button" --to khaime/@ada
passalong board                         # on Ada's side: what needs her
```

Invites are accepted in the browser, so a teammate needs no terminal to be part of a team.

## MCP

`passalong setup` registers the server with Claude Code. For other clients, run `passalong mcp` over
stdio, or add the hosted server at `https://passalong.dev/v1/mcp`.

Seventeen tools over four nouns. Work: `take`, `progress`, `hand_in`, `pass`, `ask`, `create_work`,
`find_work`, `update_work`. Projects and their documents: `find_projects`, `save_project`,
`read_document`, `save_document`, `delete_document`. Files: `add_file`, `read_file`, `delete_file`.
And `accounts`, for a machine signed in more than once.

## Work is plain markdown

Plain markdown with frontmatter, held on the server; nothing piles up on your machine. Ask for a
file when you want one: `passalong take <id> --save`, or `passalong export` for everything.

Point at a self-hosted server with `PASSALONG_API=https://your-host` before `passalong login`.

## More than one account

A machine can be signed in to several accounts, say a work one and a personal one.
`passalong login --new` adds another beside the first, `passalong accounts` lists them, and
`passalong use <name>` picks the default a person at a terminal gets.

An agent has no terminal to be asked at, so with two or more accounts and nothing saying which, it
is refused and told to ask you. It puts the question to you in plain words, you answer, and it calls
`accounts` with `use` and the name. That lasts for the session and moves nothing on disk. From a
shell, `--as <name>` or `PASSALONG_ACCOUNT=<name>` says the same for one command. The team you work
in (`passalong team use`) belongs to the account, not the machine.
