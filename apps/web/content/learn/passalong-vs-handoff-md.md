---
title: Passalong or a HANDOFF.md file?
date: 2026-10-03
description: A HANDOFF.md file and Passalong both stop AI coding agents starting cold. Where each one fits, side by side, and how to tell when you have outgrown the file.
draft: false
---

A `HANDOFF.md` file is the simplest way to stop a coding agent starting every session from zero:
the agent writes down where the work stands, and the next session reads it first. Passalong solves
the same problem for more than one session at a time. This page compares the two honestly, because
for a lot of people the file is the right answer.

If you have not used the file pattern yet, start with [The HANDOFF.md pattern, and when it stops
working](/learn/handoff-md).

## Side by side

| | HANDOFF.md | Passalong |
|---|---|---|
| Setup | None | `npm i -g passalong`, and an account |
| Where it lives | In the repo | Outside it, reachable from any repo |
| How many at once | One per file | One per piece of work |
| Who is working on it | Not recorded | Claimed, and visible to everyone |
| Progress | Whatever the last session wrote | A note at each milestone; silence shows as stalled |
| What was learned | Replaced each session | Kept in the project's documents, every version |
| Proof the work is done | The agent's summary | Evidence on every hand-in; Reopen if it does not hold |
| Another machine or person | Copy it by hand | A link, or hand it to someone |
| Chat assistants | Paste it in | ChatGPT and Claude connect directly |
| Cost | Free | A free tier, then paid plans |

## When the file is enough

Use a `HANDOFF.md` file if all of these are true:

- You run one agent at a time.
- The work stays in one repo, on one machine.
- Nobody else needs to pick it up.
- You do not need a record of what was decided last week.

That covers a lot of solo work, and nothing beats a file you control for it. Keep it short, have
the agent write it at the end of each session, and gitignore it.

## When you have outgrown it

The file starts costing you when any of these happen:

- **Two sessions overwrite each other.** You run agents in parallel and one session's state
  disappears.
- **Two agents do the same work.** Nothing in the file says the work is taken.
- **Last week's reasoning is gone.** Someone asks why something was done, and the answer was in a
  version of the file that no longer exists.
- **The next step is somewhere else.** Another repo, another machine, or a teammate's agent, and
  the handoff gets copied by hand.
- **"Done" is the agent's word.** You re-read whole changes because nothing says what was checked.

Each of these is what Passalong does differently. What someone must still do is a piece of work
with an owner and a state: it is claimed before it is worked, reports progress as it goes and comes
back with evidence. What was learned goes into the project's documents, where it outlasts the
session and every version is kept.

## Using both

They are not exclusive. Plenty of people keep a `HANDOFF.md` for their own scratch state in a repo
and use Passalong for anything that crosses a boundary: another agent, another repo, another person.

To move an existing handoff over, ask your agent:

> Move what is in HANDOFF.md into Passalong: the next step and anything still in progress as
> work, and the decisions and dead ends into the project's documents.

The file splits along its own sections. Goal, In progress and Next become work someone can take.
Done, Decisions and dead ends go into the project's documents: the page for that area, and a line
on its Log.

## The whole loop

With Passalong connected to your tools, an agent can run the whole loop itself: write down the bugs
it finds, take work that is waiting, report progress, hand it in with evidence, and write what it
learned into the project's documents. Nothing gets copied between tools by hand.

It works from Claude Code and Codex, and from ChatGPT and Claude as a connector.

```sh
npm i -g passalong
passalong setup
passalong login
```

[Connect your tools](/connect), or see the [work format](/docs/work-format).
