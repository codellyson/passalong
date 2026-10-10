# Decisions

The decisions that shaped the product, newest first, each with its reason. The reasons in full live
in `AGENTS.md` and the PRs; this is the map.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-10-10 | **One Markdown renderer**: guides, the blog, learn pages and folder documents all use remark with GFM and GitHub's alerts; `marked` is gone. | Two parsers read the same Markdown two ways — footnotes worked in a folder and broke in a guide — and alerts needed writing once. Guides stay unsanitised behind their CSP; folder documents stay sanitised. |
| 2026-09-27 | **Publish** sketched: an approved write-up can become a public post. Not built. | The changelog is a chore every team skips, and the checked write-up already exists. [docs/PUBLISH.md](../PUBLISH.md) |
| 2026-09-27 | A **blog** in the repo, as markdown bundled into the Worker. | Posts reviewed like code; no CMS, no script on the page. |
| 2026-09-27 | The new **mark**: a squircle P. Manifest `standalone`. | iOS delivers push only to a standalone home-screen app. |
| 2026-09-27 | **Push notifications**, only for what needs you. | Toasts reach you only with the hub open; a phone buzzing for every open gets muted. |
| 2026-09-27 | Your own agent's hand-in and a `BLOCKED:` note **notify you**. | notify() dropped them as self-inflicted, and they are the ones you most need. |
| 2026-09-27 | **Live hub** over polled SSE, cursor by time. | No new infrastructure; notifications coalesce, so row ids would miss repeats. |
| 2026-09-27 | **One Needs-you list**, restyled in place; the review stays a pane. | Items below a tall review were never found. Moving the review onto the guide page buried the document and said everything twice — rejected. |
| 2026-09-27 | A dev server **mints its own links**. | `PUBLIC_ORIGIN` reached dev and handed out production URLs for local uploads. |
| 2026-09-26 | **Progress timeline** leads the guide page. | The page answered "where is this?" in pieces, with no sense of when. Chosen from a four-way prototype. |
| 2026-09-26 | **"It works" needs a screenshot**; proof deleted 5 days after closing. | People said things worked that did not; keeping every proof forever is storage nobody reads. |
| 2026-09-26 | Unfurl cards **cached at the edge** by markup hash. | Every unfurl was a fresh render; a hash means no stale card and no purge. |
| 2026-09-26 | A **signed-in guide page** that frames the share page. | The hub runs script; it must never render a stranger's markdown as its own HTML. |
| 2026-09-26 | The **warm cream redesign**: Onest, Newsreader, ink pills. | A calmer, product-native look; coral as punctuation. |
| 2026-09-25 | **Handed in is final**; old CLIs refused (426). | Follow-ups nobody asked for came from agents that had already handed in; rules ship on merge, text ships on reinstall. |
| 2026-09-25 | **`kind` is explicit**, no default. | A silent default mislabelled 162 of 200 guides. |
| 2026-09-24 | Evidence over prose; screenshots from the real thing. | The write-up is the agent's word; evidence is what a reviewer can check. |
| 2026-09-23 | Roles and gifts: `super`, and plans that end on a date. | Comps were untracked UPDATEs that never ended. |
| 2026-09-21 | **The task queue** (V2): tasks, claims, the human gate. | Guides as the unit, with a queue on top, not a Trello for agents. [docs/V2.md](../V2.md) |
| 2026-09-11 | **Solo** plan; the free tier closes to new accounts. | An individual who wanted to pay had nowhere to go. |
| 2026-09-04 | Named **Passalong** (was Relay); teams (M2). | Relay was unownable; the team is what pays. |

## Sources
- `git log --merges origin/master` (PRs #1–#65)
- [AGENTS.md](../../AGENTS.md), [docs/PRD.md](../PRD.md), [docs/V2.md](../V2.md), [docs/PUBLISH.md](../PUBLISH.md)
