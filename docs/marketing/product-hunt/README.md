# Product Hunt launch kit

Drafted 2026-11-17. Nothing here has been submitted. Every claim below is true of the product today
and matches the landing page (`apps/web/app/pages/index.vue`); change the page and this together.

## The listing

**Name:** Passalong

**Tagline** (Product Hunt allows 60 characters):

> Your agents, passing work to each other

39 characters, and the landing's headline, so a visitor lands on what they clicked.
Alternatives, if the first reads too abstract on the day:

- `One work board for your team and its agents` (43, the page's `<title>`)
- `A work board for people and their agents` (40, the versus claim)

**Description** (260 characters at most):

> One board for your team and everyone's agents. My agent finds a bug and files it for yours.
> Yours takes it, reads what the team knows, asks you when it needs an answer, and hands it in
> with proof. Works with Claude Code, Codex, Cursor and any MCP client.

(254 characters as one line.)

**Topics:** Productivity, Developer Tools, Artificial Intelligence, Task Management.

**Works with** (Product Hunt's "built with / integrations" field): Claude Code, Codex, Cursor, ChatGPT, Claude, Sentry, PostHog,
GitHub Actions, Slack, Discord, Google Chat, GitHub, GitLab.

**Links:** https://passalong.dev (website), https://passalong.dev/connect (setup),
https://www.npmjs.com/package/passalong.

**Pricing:** Free (25 pieces of work), with paid plans: Solo $5 a month, Team $20 a month for up
to 10 people.

## Media

All in this folder, at Product Hunt's sizes. Every screen is the real hub, from the Fieldnote demo
team on staging, in light mode:

| File | Use |
|---|---|
| `00-thumbnail-240.png` | Thumbnail (240×240), from `apps/web/public/icon-512.png` |
| `01-landing.jpg` | Gallery 1: the landing's hero, headline and agents |
| `02-board.jpg` | Gallery 2: the team's board, people and agents on one board |
| `03-project-documents.jpg` | Gallery 3: a project's documents, which every agent reads first |
| `04-agent-asks.jpg` | Gallery 4: an agent asking when it needs an answer |
| `05-hand-in-with-proof.jpg` | Gallery 5: work handed in with proof |

Gallery images are 1270×760: `01` is the landing at that size, `02`–`05` are the landing's own
screens (`apps/web/public/media/{board,project,ask,proof}-light.jpg`), the board letterboxed.

**Video:** none yet. Product Hunt takes a YouTube link, not a file. The old film
(`passalong-launch.mp4`) tells a story the product no longer has; the recording of a real Claude
Code session on staging (`RECORDING.md`) replaces it. Upload that when it exists and put it first.

## Maker's first comment

Post it the minute the launch goes live. Edit freely: it should sound like you.

> Hi Product Hunt 👋
>
> Most of us now work beside an agent. Mine finds a bug that isn't its job, in code someone else
> owns. Today that bug goes into a chat message and is gone by Friday.
>
> Passalong is one board for your team and everyone's agents, so agents can pass work to each other:
>
> - **My agent files it for yours.** It lands on the board, for the person or group who owns it.
> - **Yours takes it.** One agent holds a piece of work at a time, and it reads the project's
>   documents, what your team knows about the product, before it starts.
> - **It asks you** when it needs an answer, and you reply from the hub.
> - **It hands in with proof**: the test it ran and what came back, or a screenshot.
>
> We never host your agent. Bring your own: Claude Code, Codex, Cursor or anything that speaks MCP,
> and ChatGPT or Claude as a connector.
>
> Getting started is `npm i -g passalong && passalong setup`. A free account holds 25 pieces of
> work.
>
> I'd love to hear what your agent finds that isn't its job, and what would make you trust its
> "done".

## Before launch day

- [ ] Pick the date. Launches reset at 12:01 a.m. Pacific; Tuesday to Thursday is busiest.
- [ ] Schedule the post on Product Hunt with the copy and media above; add co-makers.
- [ ] Record the real Claude Code session (`RECORDING.md`), upload it to YouTube, put it first.
- [ ] Decide on the 1.0 post: `apps/web/content/blog/passalong-1-0.md` is `draft: true`. Publishing
      it is `draft: false` on the post, `draft: false` on `/blog` in `apps/web/shared/pages.ts`, and
      a line in `apps/web/public/llms.txt` (test/public-pages.test.mjs insists). Its stale facts
      (To do, 0.22.0, cream) were fixed on 2026-11-17.
- [ ] `docs/marketing/directory-listings.md` still describes approving or sending back a hand-in and
      a local mode with no account; neither is true now. Fix it before reusing its copy anywhere.
- [ ] Walk the newcomer path on production from a fresh email: sign up, `/hub/start`, invite, the
      CLI's `passalong setup`, one piece of work taken and handed in. A launch-day visitor who hits a
      dead end does not come back.
- [ ] Confirm production `FREE_SIGNUP` is `"1"` (it is in `apps/web/wrangler.jsonc`) and mail
      sends (verification and invites).
- [ ] Note the numbers the day before with `pnpm metrics --remote`. Aptabase never sees a URL, so
      it cannot attribute Product Hunt traffic; the before-and-after in D1 is the record.
- [ ] Account creation is rate-limited to 5 a minute per IP (`ACCOUNT_LIMIT`). Fine for a launch;
      know it is there if someone reports "too many requests" from an office network.

## On the day

- [ ] Post the maker's comment as soon as it is live.
- [ ] Answer every comment, the same day. Questions about agents' safety: Passalong never runs
      commands it reads out of work, and an always-on agent only takes work a person marked for it.
- [ ] Share the Product Hunt link where your team already is; ask people to look and comment, not to
      upvote — Product Hunt penalises vote requests.
- [ ] Watch `/health` and the Worker's logs for the spike.
