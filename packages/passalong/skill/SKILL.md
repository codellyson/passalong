---
name: passalong-capture
description: Distill what was just accomplished in this session into a Passalong transfer guide and publish it, so another repo, machine, agent session, or teammate can implement the same thing. Use when the user says "pass this along", "passalong this", "hand this off", "share this with <repo/person>", "capture this for later", "write a transfer guide", or runs /passalong-capture.
---

# Passalong capture

You are turning this session into a **transfer guide**: executable context for an agent in a
different place. The reader is an AI agent (with a developer watching) that has none of this
session's history. Write for execution, not for permanence.

## Before you write anything

**Check what is already open, and whether a guide is wanted at all.** Run `passalong now` (or
`take` with no id over MCP) to see what this worktree holds and what was handed to you.

- **The session answers something you hold** — hand it in (`passalong hand_in <id> …`) instead.
  Publishing a second guide about it leaves two records of one piece of work.
- **The work never left this repo** — committed and pushed on a branch the team can already see,
  with a pull request to review — then it has crossed no boundary, and a transfer guide is one more
  thing for somebody to read. What is worth publishing from a session like that is what is *still
  open*: file it as a bug (`kind: bug`) or a task, not as a write-up of the fix.
- **The ask is vague** — "update the passalong", "add this to passalong", "log this" — it may mean
  hand in what you hold, add a follow-up to a guide, or publish something new. Ask which, in one
  line. Publishing the wrong thing costs somebody a review, and the author a guide to delete.

A transfer guide earns its place when the work has to cross a boundary: another repo, another
machine, another agent session, or a teammate without your branch.

## Procedure

1. **Pick the one thing to transfer.** If the user named it (`/passalong-capture <what>` or
   "pass along the webhook fix"), that is the scope. Otherwise take the most recent completed
   piece of work. A long session usually holds several; do not merge them, and if it is
   genuinely unclear which one the user means, ask before writing.
2. **Reconstruct the story from the session.** What was the problem, what was tried, what failed,
   what was decided and why, what finally worked, and how it was verified. Read the diff
   (`git diff`, `git log`) only to confirm details; the reasoning is in the transcript.
3. **Write the guide** with the structure below. Be concrete: file paths, commands, exact error
   strings, version numbers. Prefer a short guide with every section filled over a long one.
4. **Mark context-specific parts** so the receiver can adapt rather than copy. Put
   `ASSUMES: <thing>. If <alternative>, <what changes>.` at the start of any step that depends on
   this repo's stack, layout, or conventions.
5. **Save the draft** to `~/.passalong/drafts/<slug>.md` (create the directory if needed), then run:

   ```bash
   passalong share ~/.passalong/drafts/<slug>.md --no-edit
   ```

   If the user named a person or team ("share this with Ada", "hand this to the platform
   team"), add `--to <team>` or `--to <team>/<handle>`; `passalong team` lists the current
   team's members and their handles. It prints the guide id on stdout and the share link (and
   who it was handed to) on stderr.

   **If what you are capturing is more context for an existing guide** — a missing detail, a step
   that needed explaining, what changed since, what you found doing it — add `--follows <that id>`.
   That publishes it as a follow-up: its own guide, listed under the original, and handed to
   whoever opens the original, person or agent. A session that started from a passalong guide
   (`passalong start` or `pull` on an id, or an agent opened one) usually has context worth adding
   this way. Whether the guide worked is still its own answer: `passalong works <id>` or
   `passalong broken <id> <why>`.
6. **Report** the id (and link if synced) and one line on how to use it on the other side:
   `passalong start <id>` in the target repo, or "start passalong <id>" to an agent with the
   Passalong MCP server. `start` rather than `pull` on purpose: it takes the handoff as well as
   fetching it, and until somebody says they are on it the sender cannot tell a guide nobody
   noticed from one somebody is deep in.

If the `passalong` command is missing, tell the user to run `npm i -g passalong && passalong setup` and
still write the draft file so nothing is lost.

## Two kinds of guide

`kind:` in the frontmatter says what a guide is for, and the receiver behaves differently for
each. Absent means `transfer`, which is what every guide written before bug reports existed is.

| kind | what it is | what the receiver does |
| --- | --- | --- |
| `transfer` (or no `kind:` line) | finished work to repeat somewhere else | follows the **Steps** |
| `bug` | a defect to fix where it is | fixes it — **Reproduce** shows the problem, it is not a procedure to apply |

To file bugs you found but are not fixing, call `file_bugs` with all of them in one call — it
opens a report and publishes each issue as its own guide, so any one of them can be handed to
whoever fixes it. `publish_guide` is for a single guide: work you finished and want repeated, or
one bug on its own.

A bug has no `## Steps` and publishing one with a Steps section is refused. That is the whole
reason the kinds are separate: "follow its Steps" is what the MCP server tells every agent that
pulls a guide, and steps that reproduce a defect are the one list that must never be run as a
remedy — an agent that follows them reproduces the bug, checks the Verification, finds it false
because the bug is real, and reports that the guide does not work.

## Guide structure

```markdown
---
title: <what this accomplishes, as a verb phrase: "Add Paystack webhook verification">
author: <git user.name, if known>
source_context: <repo or product this came from>
status: published
stack_assumptions: [<runtime/framework/db/service versions the steps depend on>]
tags: [<3 to 6 lowercase keywords>]
---

## Problem
What was broken or needed. Two or three sentences. Include the observable symptom.

## Solution shape
The approach at a high level, before any code. One short paragraph.

## Decisions and rationale
- **Chose X over Y** because Z. (Each real decision, with what was rejected.)

## Steps
1. ASSUMES: <stack>. If <other>, <adjust>. Then the concrete step, with the file path and the code or command.
2. ...

## Verification
Commands to run and what they should print. Test cases. What "done" looks like.

## Gotchas
- What failed along the way, the exact error, and why. What looked right but wasn't.
```

## Bug structure

```markdown
---
title: <what is broken, in one line: "Undo leaves section drag handles dead">
kind: bug
severity: <s1 blocker | s2 major | s3 minor | s4 cosmetic>
area: <which surface it is on>
report: <the report id, when it was filed with others>
status: published
tags: [bug, <2 to 4 more>]
---

> **Bug report.** The steps under Reproduce show the problem — they are not a fix to apply. Fix what Problem describes, then check Verification.

## Problem
What is broken and what it stops someone doing. The observable symptom, and the error if there is one.

## Reproduce
1. The steps that show the bug. These produce the defect — they are not a fix to apply.

## Verification
The behaviour that should have happened, as something the fixer can check.

## Gotchas
- Anything already ruled out, or that made it hard to pin down.
```

## Quality bar

- **Gotchas is the highest-value section.** If nothing went wrong, say what would have gone
  wrong without a specific decision. Never leave it empty.
- **Verification must be runnable.** A command and an expected output, not "make sure it works".
- **Every ASSUMES has an alternative.** The point is adaptation on the other side.
- **One problem per guide.** A lesson from the same session that is not part of this fix goes in
  its own guide (write and share it separately), not in this one's Gotchas.
- **No session narration.** "First I looked at..." is noise. State the finding.
- **No secrets.** Redact tokens, keys, and internal hostnames that would not apply elsewhere.
- Title, Problem, and Steps are required; the guide will not publish without them.
- For a bug: title, Problem and **Reproduce**. Never a Steps section — see the two kinds above.
- The line above Problem is written by `file_bugs` and the hub's form. It is in the document, not
  added by whatever served it, so an agent that fetched the share link over plain HTTP — with no
  MCP server and no knowledge of Passalong — still reads what the document is before acting on it.
