# Passalong LLM wiki

A wiki an agent keeps: what Passalong is, how its parts fit, and why they are shaped the way they
are — written as synthesis, with every claim pointing at the source that makes it true.

It sits beside the other docs rather than replacing them:

| Where | Job |
| --- | --- |
| [`AGENTS.md`](../../AGENTS.md) | The rules and sharp edges. Normative. Read before changing code. |
| [`docs/wiki/`](../wiki/README.md) | Reference: schema, routes, auth, web view, releasing. Descriptive, one area per page. |
| [`docs/PRD.md`](../PRD.md), [`docs/V2.md`](../V2.md), [`docs/PUBLISH.md`](../PUBLISH.md) | Intent: what the product is for and what is planned. |
| **`docs/llm-wiki/`** (here) | Understanding: one page per concept, how it connects to the others, the decisions behind it, and what is still open. The place to start when you need the whole picture fast. |

Start at [index.md](index.md). What changed and when is in [log.md](log.md).

## How to maintain it

This wiki is only useful while it is true. An agent working on this repo keeps it that way.

**When to update.** After a change that alters what a page says — a new feature, a changed rule, a
decision made, a plan dropped — update the page in the same change, and add a line to `log.md`.
A fix that changes nothing a page claims needs nothing here.

**Ingest.** When a new source arrives (a spec, a merged PR, a decision in conversation), read it,
then: update every page it touches, create a page if it introduces a concept none covers, add it
to `index.md`, and log it. One source often touches several pages; update them all.

**Query.** To answer a question from the wiki, read `index.md`, then the pages it points to, then
the sources those pages cite. If the answer was not in the wiki and is worth keeping, write it in.

**Lint.** Periodically: check each page's sources still exist and still say what the page claims;
flag contradictions between pages; move anything decided out of `open-questions.md`.

## Conventions

- **One concept per page**, named for the concept in kebab-case. Link other pages by relative path.
- **Every page ends with `## Sources`**: the files, docs sections, migrations or PRs that make it
  true. Code and `AGENTS.md` win over this wiki; where they disagree, the page is the bug.
- **Say why, not only what.** The code says what. The reason a thing is shaped that way is what
  gets lost, and it is what this wiki is for.
- **Plain English**, present tense, dates as YYYY-MM-DD. No marketing.
- **Nothing secret.** No keys, tokens, share links or account data — this is a public repo.
