# Publish: finished work becomes a post

**Version:** 0.1  **Author:** Lukman Isiaka  **Date:** 2026-09-27  **Status:** Sketch. Nothing built. Decisions marked **Open** are the author's to make before building.

## 1. One-liner

When a task is approved, its write-up can become a public post for the people the work was for — a changelog entry, a release note, a feature post — drafted by your agent, reviewed by you, published to your team's page.

## 2. Why this sells

Every team that ships has the same backlog nobody touches: the changelog. The work is done, it was reviewed, and telling users about it is a separate chore that happens late, badly or never.

Passalong already holds the raw material, and it is better than what a changelog is usually written from:

- **What changed and why.** Every task ends with a transfer write-up: Problem, Solution shape, Decisions.
- **Proof.** A hand-in carries evidence, and "it works" now carries a screenshot of it working.
- **A human gate.** Nothing reaches this point without someone approving it against Acceptance.

So the post is a by-product of shipping rather than a second job. That is the pitch: *your changelog writes itself from work you already checked.* It is also a reason for the people who don't run agents — a PM, a founder, marketing — to be in the team, which is the plan that pays (PRD §11).

## 3. How it fits what Passalong is

PRD §9 says Passalong is not a wiki, a docs site or a note-taking app. This is not those either, and the line is worth holding:

- **It is one more crossing.** Passalong moves work between repos, machines, agents and people. This is the last hop: from the team to its users. A post is a handoff to the outside.
- **It is not a CMS.** No pages, no navigation, no themes, no drafts that are not about shipped work. A post always starts from a finished guide. You can't write one from nothing — that is what the blog in `content/blog` is for, and it stays ours.
- **The guide is not the post.** A write-up is written for the next engineer; a post is written for a user. They are two documents with two audiences, and the post is a new thing, not the guide made public (§5).

## 4. The flow

1. **A task is approved.** Its write-up already exists.
2. **Draft a post.** From the guide page in the hub: *Draft a post from this*. Or an agent: `draft_post` over MCP, `passalong post <id>` on the CLI. **The user's own agent writes it**, from the write-up and the task, for an outside reader — the same pattern as capture (PRD §5): Passalong runs no model. The hub path hands the agent a prompt to copy, exactly as follow-ups do today.
3. **Review.** The draft lands in the team's Posts list as a draft, never live. The reviewer edits it in the hub or pulls it as markdown. §6's checks run and say what they found.
4. **Publish.** One click, by a team member with the right to (§8). It appears on the team's public page and its feed.
5. **Later.** Edit, unpublish, delete. An edit is a new version; unpublishing takes it down and keeps it.

Several approved tasks can go into one post: *Draft a post from these* on a multi-select, for a weekly or release roundup.

## 5. The post

A new entity, not a guide with a public flag:

- `post`: `id`, `team_id`, `slug`, `title`, `summary`, `markdown`, `status` (draft · published · unpublished), `published_at`, `author_id`, `created`, `updated`.
- `post_source`: which guides it came from. Used for lineage — the guide page says *published as …* — and never to render anything public.
- `post_asset`: images the post shows (§6).

Why separate: a guide carries a share key, private screenshots with a five-day life, internal handles and repo paths, and it is edited by its author for its own reader. A public flag on it would publish all of that by accident one day. A post is a copy that was made on purpose and reviewed.

Posts are plain markdown with frontmatter, and `passalong export` includes them (PRD §10: no lock-in).

## 6. What is safe to publish

This is the part that decides whether anyone trusts the feature. A private guide was never written to be public. Rules:

1. **Nothing is published without a person pressing Publish.** Not by an agent, not by a schedule. An agent can draft; only a human with the right publishes.
2. **Nothing is copied through without being seen.** The draft is rewritten for an outside reader, not the write-up pasted.
3. **Images are opted in one by one.** Proof screenshots are private and deleted five days after the guide closes. Publishing one *copies* it into `post_asset`, a separate public image with its own life. The original is never made public.
4. **Checks before publish,** shown on the review screen, never silently fixed:
   - anything that looks like a secret — API keys, tokens, `sk_`/`pk_live`, private keys, connection strings;
   - internal hosts and addresses — `localhost`, private IP ranges, `*.internal`, staging URLs;
   - share links and `/v1/shots/` URLs — a private address in a public post;
   - `@handles` and email addresses — named people, who may not want to be;
   - repo paths and branch names.
   
   A finding is a warning to resolve or dismiss, not a block: a post may legitimately name a path. Dismissals are recorded on the version.
5. **Unpublish is immediate and complete.** The page returns 410, the feed drops it, and the card image goes with it.

## 7. The public page

- `passalong.dev/t/<team>/changelog` — the index, newest first.
- `passalong.dev/t/<team>/changelog/<slug>` — one post.
- `…/changelog/rss.xml` — the feed. This is the part people subscribe to.
- The team's name and mark at the top; Passalong's small at the foot ("Changelog by Passalong"), which is the distribution.

Built like the landing and the blog: rendered on the server, **no script** and the strict policy (`VIEW_HEADERS`). A post's markdown was written by a team member, and the no-script rule is what makes rendering it safe, exactly as for guide pages. Each post gets an unfurl card from the existing renderer.

**Open:** `/t/<team>/changelog`, `/@<team>` or a subdomain (`<team>.passalong.dev`). Subdomains look best and need wildcard DNS and a certificate; paths ship first.

**Open:** a switch for teams that want the page up but out of search engines.

## 8. Who may do what

- **Draft:** any team member, and any agent acting for one.
- **Publish, unpublish, delete:** the team owner, and members the owner gives it to. A new team role, not a new account type.

**Open:** whether the author of the source task should be told when it is published, and whether they can object first.

## 9. Custom domains

`changelog.acme.com` pointing at the team's page. Teams will ask for it early — a changelog on somebody else's domain looks borrowed.

On Cloudflare this is **Cloudflare for SaaS** (custom hostnames): the team adds a CNAME, Cloudflare issues the certificate, the Worker reads the hostname and serves that team's page. It costs per hostname above the included allowance, and needs a verification flow in the hub (add domain → show the record → check it → live).

Phase 2. The path-based page ships first and proves people publish.

## 10. Pricing

**Open**, with a recommendation:

- **Team plan includes publishing** to the team's page on `passalong.dev`. It is a team feature by nature — a solo developer's changelog is a nice-to-have, a team's is a job somebody currently does by hand.
- **Custom domain** as a Team add-on, or in a higher tier, because it has a real per-hostname cost.
- **Solo:** a personal page (`/u/<handle>/changelog`) is cheap to offer and is a good top-of-funnel; decide after seeing whether teams use it.
- **Lapsed team:** published posts **stay up**, read-only — the same rule a lapsed team's guides follow (§11 in the PRD: withholding a team's own work to collect a debt is what §10 forbids). What stops is new publishing.

## 11. Agent-native

PRD §10: every feature must answer *can an agent do this without a human clicking through a UI?* For this one, deliberately, **up to the last step**:

- `draft_post` (MCP) and `passalong post <id…>` (CLI) draft from one or more guides.
- `passalong post list`, `passalong post pull <id>` to edit locally, `passalong post push` to update the draft.
- Publishing stays a person's act (§6.1). An agent can be told a post is waiting; it cannot publish it.

## 12. Build order

1. **Posts as drafts.** `post` tables, `draft_post` / `passalong post`, the team's Posts list in the hub, editing, the §6 checks. No public page yet — a team can try the drafting before anything is exposed.
2. **Public page on passalong.dev.** Index, post, feed, unfurl cards, publish and unpublish, the role.
3. **Images.** Opting a proof screenshot into `post_asset`.
4. **Custom domains.** Cloudflare for SaaS, the verification flow.
5. **Roundups.** One post from several guides.

## 13. How we know it works

Measured the way PRD §14 is, from D1 with `scripts/metrics.mjs`, and through analytics only as categorical events (`post_drafted`, `post_published`) — never a title, slug or team:

- Teams that publish at least one post in their first month.
- Drafts that get published — low means the drafts are not good enough, or the checks are frightening people off.
- Feed subscribers per team page, as a count.
- Teams that came from a *Changelog by Passalong* link — the distribution claim, tested.

## 14. Open questions

1. Page address: path, `@team`, or subdomain (§7).
2. Pricing: Team-only, and custom domains as an add-on or a tier (§10).
3. Solo personal pages: now, or after teams prove it (§10).
4. Does the source task's author get a say before a post about their work goes out (§8)?
5. Name. "Publish", "Changelog", "Posts"? The public page says *Changelog*; the feature might want a verb.
