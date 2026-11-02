---
name: passalong-capture
description: Write what this session learned into the team's Passalong project documents — updating the pages that already cover it and adding a line to the project's Log — so the next person or agent who picks up work on this product starts knowing it. Use when the user says "pass this along", "passalong this", "hand this off", "capture this", "write this up for the team", "remember this for next time", or runs /passalong-capture.
---

# Passalong capture

Passalong has four things: **work** (what someone must still do), **projects** (one per product or
body of work), **documents** (what to know about a project) and **files**. Capturing a session means
writing what it learned into the project's **documents**, where everyone who takes work on that
product reads it — not handing a one-off write-up to one person. Every version of a document is
kept, so editing a page is safe: a bad edit can be put back.

You need the Passalong MCP server (`find_projects`, `read_document`, `save_document`). If those tools
are missing, tell the user to run `npm i -g passalong && passalong setup` and stop.

## Before you write anything

**Check what is open.** Call `find_work` with nothing (or run `passalong now`) to see what this
worktree holds.

- **The session finished something you hold** — `hand_in` that first, with its evidence: what you
  ran and what came back — the command and the lines that decided it, a test summary, a link to the
  change, or a screenshot. Then capture what was learned, below. A hand-in says the work is done; the
  documents say what is now true.
- **Something is still open** — a defect you found and did not fix, a follow-on job — that is work,
  not knowledge. Write it down with `create_work`: one call, one item each, every item with a
  `summary` a person can read. Never record open work only in a document: a document has no owner
  and no state and tells nobody.
- **The ask is vague** — "update the passalong", "add this to passalong" — it may mean hand in what
  you hold, update the documents, or write new work. Ask which, in one line.

## Procedure

1. **Decide what is worth knowing.** Go through the session for what the next person could not
   learn from the code alone: how something works, a decision and why, a constraint, what failed and
   why, the command that checks it, a gotcha. Leave out the story of how you got there — "first I
   looked at…" is noise. If the user named the scope (`/passalong-capture <what>`), keep to it.
2. **Find the project.** `find_projects` with the repo's or product's name (`query`). Pick the one
   it belongs to. If none fits, make one with `save_project`, named for the product, with a one-line
   description — private unless the user named a team — and tell them where it lives (its `space`).
3. **Read before you write.** `find_projects` with that project's `id` lists its documents.
   `read_document` the README and the page that covers the area you are writing about. Note each
   one's `version`.
4. **Update the page that already covers it.** `save_document` with the `document` id, the
   `version` you read and the whole new `body`. Change what is no longer true rather than adding a
   contradiction below it; a page says what is true now. Add a new page (`save_document` with `name`
   and `body`, no `document`) only when nothing covers that area yet, and name it for the area
   ("Billing", "Deploys"), not for this session. If the change alters what the product is or how it
   is built, update the README too. On a stale-version refusal, read it again and redo your edit on
   top of what is there.
5. **Add a line to the Log.** `read_document` the project's Log page (make it with `save_document`,
   `name: "Log"`, if there is none) and save it with one line added at the top:
   `- <today, YYYY-MM-DD> — <what changed, in one plain sentence> (<commit, PR or work id>)`.
6. **Report** which project, which documents you changed or added, the Log line, and the ids of any
   work you wrote down.

## Writing for the next reader

- **Write for someone with none of this session's history** — a teammate, or an agent taking work on
  this product next week. Concrete beats general: file paths, commands, exact error strings,
  versions.
- **Checkable when it matters.** A claim about how to verify something gives the command and the
  result to expect.
- **One area per page.** Put a lesson where someone working on that area would look for it.
- **No secrets.** Redact tokens, keys and internal hostnames.
- **Pictures are files.** `add_file` a screenshot or diagram with `project` set to keep it with the
  project's files, and say in the page what it shows.
