# Blog and Publish

Two different things that share a word.

## The blog — built, not yet public

The product's own blog at `/blog`. Posts are markdown files in `apps/web/content/blog/<slug>.md`
(`title`, `date`, `description`, `author`, `draft`), bundled into the Worker as Nitro server assets
because a Worker has no filesystem.

- `/blog` lists published posts; `/blog/:slug` renders one in the reading face; `/blog/rss.xml` is the
  feed; the sitemap lists posts once `/blog` is published.
- No script and the strict policy, like docs.
- A draft renders at its address, noindex, and appears nowhere else. `/blog` is itself a draft in
  `shared/pages.ts`.
- **Publishing:** `draft: false` on the post and on `/blog`, and a `/blog` line in
  `public/llms.txt` (a test insists).

The first post, *Hand work to your agents, and see it come back*, is a draft awaiting edits.

## Publish — planned, nothing built

A product feature: an approved task's write-up becomes a public post — a changelog entry — for the
people the work was for. The pitch: *your changelog writes itself from work you already checked.*

- The user's own agent drafts it; only a person publishes it.
- A post is its own entity, not a public guide: guides carry share keys, private proof and handles.
- Before publishing, checks flag secrets, internal addresses, private links, named people and repo
  paths. Proof screenshots are opted in one by one as public copies.
- A team page with a feed, no script; custom domains later, through Cloudflare for SaaS.
- It fits PRD §9 as one more crossing — from the team to its users — not as a CMS.

Five decisions are open; see [open-questions.md](open-questions.md).

## Sources
- `apps/web/server/utils/blog.ts`, `apps/web/app/pages/blog/`, `apps/web/content/blog/`, `apps/web/test/blog.test.mjs`
- [docs/PUBLISH.md](../PUBLISH.md)
- [AGENTS.md](../../AGENTS.md): "The blog is markdown in the repo…"
