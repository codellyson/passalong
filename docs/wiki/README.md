# Wiki

Reference pages for an agent or a person changing this codebase. They answer "what is there and
why is it shaped like that", which is different from what the other docs cover:

| Where | What it is for |
| --- | --- |
| [`AGENTS.md`](../../AGENTS.md) | Conventions and sharp edges. Read it first; it is the rules. |
| `docs/wiki/` (here) | Reference: schema, routes, auth model, the web view, releasing. |
| [`docs/DEPLOY.md`](../DEPLOY.md) | The runbook. What to run, in what order, to ship. |
| [`apps/api/public/llms.txt`](../../apps/api/public/llms.txt) | Public. For agents *using* the product, not changing it. |

These pages describe behaviour that is defined in code. Where they disagree with the source, the
source wins — and the page is a bug. Each one names the file it describes so that is checkable.

## Pages

- [Architecture](architecture.md) — the three pieces, and why the split falls where it does
- [Data model](data-model.md) — the D1 tables and what each one is really tracking
- [API](api.md) — the `/v1` surface, auth on each route, and what the web routes serve
- [Auth](auth.md) — tokens, sessions, passwords, and what is stored versus what is shown once
- [Web view](web-view.md) — rendering owner-authored markdown safely, CSP, styles, OG cards
- [Releasing](releasing.md) — how the Worker deploys and how the CLI reaches npm

## The shape of the thing in one paragraph

An agent finishes something non-trivial and publishes a **transfer guide**: markdown with
frontmatter and six fixed sections. The guide syncs to a Worker backed by one D1 database. Someone
else — another repo, another machine, a teammate, an agent — pulls it, does it, runs its
`Verification`, and records a verdict. The verdict flows back to the author. Everything else in
this repo exists to make that loop cheap: the CLI to publish and pull, the MCP server so an agent
can do it without a human, the hub and share links so a person can, and teams so it can be
addressed to someone in particular.
