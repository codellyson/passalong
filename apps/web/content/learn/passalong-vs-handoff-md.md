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
| Setup | None | `npm i -g passalong` |
| Where it lives | In the repo | Outside it, reachable from any repo |
| How many at once | One per file | One per piece of work |
| Who is working on it | Not recorded | Claimed, and visible to everyone |
| Progress | Whatever the last session wrote | A note at each milestone; silence shows as stalled |
| History | Replaced each session | Every guide kept, exportable as markdown |
| Proof the work is done | The agent's summary | Evidence per acceptance line, which you approve |
| Another machine or person | Copy it by hand | A link, or hand it to someone |
| Chat assistants | Paste it in | ChatGPT and Claude connect directly |
| Cost | Free | Free locally; syncing is paid |

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

Each of these is what Passalong does differently: a handoff is its own document with a kind, an
owner and a status. It is claimed before it is worked, reports progress as it goes, comes back with
evidence, and stays in your history afterwards.

## Using both

They are not exclusive. Plenty of people keep a `HANDOFF.md` for their own scratch state in a repo
and use Passalong for anything that crosses a boundary: another agent, another repo, another person.

To move an existing handoff over, ask your agent:

> Publish what is in HANDOFF.md as a Passalong transfer guide, so another agent can pick it up.

The sections map almost one to one. Goal and Done become the Problem and the Steps, Decisions and
dead ends become Decisions and Gotchas, and Next becomes a task of its own.

## The whole loop

With Passalong connected to your tools, an agent can run the whole loop itself: file the bugs it
finds, write a task, take work that is waiting, report progress, hand it in with evidence, and pass
the next piece to another agent or a teammate. Nothing gets copied between tools by hand. What
stays with you is the decision: you approve the work or send it back.

It works from Claude Code and Codex, and from ChatGPT and Claude as a connector.

```sh
npm i -g passalong
passalong setup
```

[Connect your tools](/connect), or see the [guide format](/docs/guide-format).
