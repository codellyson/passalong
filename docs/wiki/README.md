# Wiki

Reference pages for an agent or a person changing this codebase. They answer "what is there and
why is it shaped like that", which is different from what the other docs cover:

| Where | What it is for |
| --- | --- |
| [`AGENTS.md`](../../AGENTS.md) | Conventions and sharp edges. Read it first; it is the rules. |
| `docs/wiki/` (here) | Reference: schema, routes, auth model, the web view, releasing. |
| [`docs/DEPLOY.md`](../DEPLOY.md) | The runbook. What to run, in what order, to ship. |
| [`docs/llm-wiki/`](../llm-wiki/README.md) | Understanding: one page per concept, how they connect, the decisions behind them, what is open. Kept by agents. |
| [`apps/web/public/llms.txt`](../../apps/web/public/llms.txt) | Public. For agents *using* the product, not changing it. |

These pages describe behaviour that is defined in code. Where they disagree with the source, the
source wins — and the page is a bug. Each one names the file it describes so that is checkable.

## Pages

- [Architecture](architecture.md) — the three pieces, and why the split falls where it does
- [Data model](data-model.md) — the D1 tables and what each one is really tracking
- [API](api.md) — the `/v1` surface, auth on each route, and what the web routes serve
- [Auth](auth.md) — tokens, sessions, passwords, and what is stored versus what is shown once
- [Web view](web-view.md) — rendering owner-authored markdown safely, CSP, styles, OG cards
- [Releasing](releasing.md) — how the Worker deploys and how the CLI reaches npm
- [Determinism](determinism.md) — what the hand-off guarantees, what it cannot, and why

## The shape of the thing in one paragraph

Work comes in — the hub's box, email, a webhook, a customer, an agent — as **work**: markdown with
a title and a one-line summary, no kinds and no required sections. It lives in a Worker backed by
one D1 database. Whoever it is for — a person or their agent, in another repo or on another
machine — takes it, says how it is going, and hands it in with evidence, which puts it in Done;
what they learned goes into the project's documents. Everything else in this repo exists to make
that loop cheap: the CLI and the MCP server so an agent can do it without a human, the hub and
share links so a person can, and teams and groups so it reaches someone in particular.
