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

- **The session answers something you hold** — use the MCP `hand_in` tool instead.
  Publishing a second guide about it leaves two records of one piece of work. Every hand-in carries
  what you ran and what came back — the command and the lines that decided it, a test summary, a
  link to the change, or a screenshot url. Copy each one out of the session as you go; at the end
  you would be writing from memory, which is what evidence exists to replace. On a **task**, send
  it as `checks`: one entry per Acceptance line, each with that line and the evidence for it. Its
  author reads them line against line, and evidence filed under the check it answers is worth more
  than the same output in one block. On a handoff or a bug, which have no Acceptance lines, send
  `evidence` as one block.
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
   strings, version numbers. A transfer has no required body sections; keep only the context the
   next agent needs.
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
   that needed explaining, or what changed since — add `--follows <that id>`.
   That publishes it as a follow-up: its own guide, listed under the original, and handed to
   whoever opens the original, person or agent. It travels the other way too — whoever opens the
   follow-up gets the guide it came out of, and where that guide has got to — so write it as a
   note on that work rather than as a standalone brief. What you did or found while working on a
   guide belongs in its `hand_in`, not a follow-up. Whether a guide worked is its own answer:
   `passalong works <id> <screenshot>` or `passalong broken <id> <why>`.
6. **Report** the id (and link if synced) and one line on how to use it on the other side:
   `passalong start <id>` in the target repo, or "start passalong <id>" to an agent with the
   Passalong MCP server. `start` rather than `pull` on purpose: it takes the handoff as well as
   fetching it, and until somebody says they are on it the sender cannot tell a guide nobody
   noticed from one somebody is deep in.

If the `passalong` command is missing, tell the user to run `npm i -g passalong && passalong setup` and
still write the draft file so nothing is lost.

## Choose the right Passalong form

Every guide must state `kind:`. An absent kind is refused; the server never guesses one.

- `transfer` is context for a different repo, machine or agent session. It has no required
  sections. Write only what the receiver needs to avoid starting cold.
- `bug` is a defect to fix. Put the reproduction under `## Reproduce`, never `## Steps`, so the
  receiver does not mistake the steps that show the defect for a remedy. Use `file_bugs` when
  filing several independent defects.
- `task` is work nobody has done yet. Use `plan_tasks` for a larger goal; its `## Acceptance`
  gives the reviewer something to check. Do not write implementation steps for the taker.

**A project folder is not a guide.** When asked to keep a script, brief, screenshots or other
assets together for continuing work, call `list_folders` first. Reuse a fitting folder, or call
`create_folder` with a title and short description drawn from the person's request. Create the
first Markdown document with `create_folder_document`; do not leave an empty folder or ask the
person to fill a form. Omit `team` unless they asked to share it. Read a document and its version
before `save_folder_document`; reread after a stale-version refusal. Add files with
`add_folder_asset` and link an existing guide with `link_folder_guide` only when it uses the folder.

## Say it to a person

Everything below is written for another agent: exact, dense, full of ids and paths. A person reading
their hub wants two sentences. So every guide carries a `summary:` in its frontmatter — plain
language, 400 characters at most, no ids, paths or jargon, saying what this is and whether anybody
has to do anything. It is what they see first; your document is behind it. A guide with no summary is
refused.

Write it the way you would tell a colleague in the corridor: "Webhook signatures are now checked
before anything is stored. Done and working; nothing to do." Not: "Implemented HMAC-SHA512 verify in
billing.ts per the Paystack spec, see PR 412."

## Guide structure

```markdown
---
title: <what this accomplishes, as a verb phrase: "Add Paystack webhook verification">
summary: <one or two plain sentences for a PERSON, 400 characters at most, no ids or paths: what this is and whether anyone has to act>
kind: transfer
author: <git user.name, if known>
source_context: <repo or product this came from>
status: published
stack_assumptions: [<runtime/framework/db/service versions the steps depend on>]
tags: [<3 to 6 lowercase keywords>]
---

## What changed
The information the receiving agent needs, in the shape that makes it easiest to use.

## Why
Decisions or constraints the receiver could not infer from the final code.

## How to check
Commands and expected results, if the receiver needs to repeat or verify the work.
```

Those headings are examples, not a required template. A short transfer may be a paragraph.
Include paths, assumptions, verification or gotchas only when they help the next agent act.

## Bug structure

```markdown
---
title: <what is broken, in one line: "Undo leaves section drag handles dead">
summary: <one or two plain sentences for a PERSON: what is broken and whether anyone has to act>
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

- **Write for the crossing.** State what another agent cannot learn from the destination repo.
- **Verification, when relevant, must be checkable.** Give the command and expected result.
- **State assumptions where they matter.** Say how the next environment may differ.
- **One problem per guide.** A lesson from the same session that is not part of this fix goes in
  its own guide only when it is separate work worth handing over.
- **No session narration.** "First I looked at..." is noise. State the finding.
- **No secrets.** Redact tokens, keys, and internal hostnames that would not apply elsewhere.
- Every guide needs a title, summary and explicit kind. A transfer needs no fixed body section.
- A bug needs Problem and Reproduce. Never give a bug a Steps section.
- The line above Problem is written by `file_bugs` and the hub's form. It is in the document, not
  added by whatever served it, so an agent that fetched the share link over plain HTTP — with no
  MCP server and no knowledge of Passalong — still reads what the document is before acting on it.
