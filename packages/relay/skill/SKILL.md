---
name: relay-capture
description: Distill what was just accomplished in this session into a Relay transfer guide and publish it, so another repo, machine, agent session, or teammate can implement the same thing. Use when the user says "relay this", "hand this off", "share this with <repo/person>", "capture this for later", "write a transfer guide", or runs /relay-capture.
---

# Relay capture

You are turning this session into a **transfer guide**: executable context for an agent in a
different place. The reader is an AI agent (with a developer watching) that has none of this
session's history. Write for execution, not for permanence.

## Procedure

1. **Reconstruct the story from the session.** What was the problem, what was tried, what failed,
   what was decided and why, what finally worked, and how it was verified. Read the diff
   (`git diff`, `git log`) only to confirm details; the reasoning is in the transcript.
2. **Write the guide** with the structure below. Be concrete: file paths, commands, exact error
   strings, version numbers. Prefer a short guide with every section filled over a long one.
3. **Mark context-specific parts** so the receiver can adapt rather than copy. Put
   `ASSUMES: <thing>. If <alternative>, <what changes>.` at the start of any step that depends on
   this repo's stack, layout, or conventions.
4. **Save the draft** to `~/.relay/drafts/<slug>.md` (create the directory if needed), then run:

   ```bash
   relay share ~/.relay/drafts/<slug>.md --no-edit
   ```

   It prints the guide id on stdout and the share link on stderr.
5. **Report** the id (and link if synced) and one line on how to use it on the other side:
   `relay pull <id>` in the target repo, or "pull relay <id>" to an agent with the Relay MCP server.

If the `relay` command is missing, tell the user to run `npm i -g justrelay && relay setup` and
still write the draft file so nothing is lost.

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

## Quality bar

- **Gotchas is the highest-value section.** If nothing went wrong, say what would have gone
  wrong without a specific decision. Never leave it empty.
- **Verification must be runnable.** A command and an expected output, not "make sure it works".
- **Every ASSUMES has an alternative.** The point is adaptation on the other side.
- **No session narration.** "First I looked at..." is noise. State the finding.
- **No secrets.** Redact tokens, keys, and internal hostnames that would not apply elsewhere.
- Title, Problem, and Steps are required; the guide will not publish without them.
