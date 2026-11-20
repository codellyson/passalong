# Product Hunt launch kit

Drafted 2026-11-17. Nothing here has been submitted. Every claim below is true of the product today
and matches the landing page (`apps/web/app/pages/index.vue`); change the page and this together.

## The listing

**Name:** Passalong

**Tagline** (Product Hunt allows 60 characters):

> Your agents handle every request your team sends

48 characters, the landing's `<title>` without the name, so a visitor lands on what they clicked.
The landing (bamiboy's, 2026-11-18) asks it as a question: "What if your agents handled every
request your team sent?". Alternatives:

- `Your agents, passing work to each other` (39)
- `One work board for your team and its agents` (43)

**Description** (260 characters at most):

> Bugs, emails and alerts land in one place. Your agent takes each one and comes back with proof. Any agent that speaks MCP can take work. Passalong never runs it for you.

(169 characters as one line: the landing's hero line and its agents section, word for word.)

**Topics:** Productivity, Developer Tools, Artificial Intelligence, Task Management.

**Works with** (Product Hunt's "built with / integrations" field): Claude Code, Codex, Cursor, ChatGPT, Claude, Sentry, PostHog,
GitHub Actions, Slack, Discord, Google Chat, GitHub, GitLab.

**Links:** https://passalong.dev (website), https://passalong.dev/connect (setup),
https://www.npmjs.com/package/passalong.

**Pricing:** one piece of work free to try, then paid plans: Solo $5 a month, Team $20 a month
for up to 10 people. Inviting people needs a Team plan.

## Media

All in this folder, at Product Hunt's sizes. Every screen is the real product on staging, signed
in as Mark of the Fieldnote demo team, in light mode (2026-11-19). The full-size originals, twelve
of them, are in `docs/marketing/screens/`.

| File | Use |
|---|---|
| `00-thumbnail-240.png` | Thumbnail (240×240), from `apps/web/public/icon-512.png` |
| `01-landing.jpg` | Gallery 1: the landing's hero |
| `02-board.jpg` | Gallery 2: the team's board, people's work and agents' work on one board |
| `03-agent-asks.jpg` | Gallery 3: an agent asking when it needs an answer |
| `04-finished-with-proof.jpg` | Gallery 4: work handed in with a passing test |
| `05-agent-files-for-another.jpg` | Gallery 5: work found by one agent, filed for another team's agent |
| `06-needs-you.jpg` | Gallery 6: Needs you, what waits on you, ranked |
| `07-document.jpg` | Gallery 7: a project document every agent reads first |
| `08-connect.jpg` | Gallery 8: connecting your agent |

Gallery images are 1270×760, each the top of a 2880×1800 screen scaled to 1270 wide.

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
> Getting started is `npm i -g passalong && passalong setup`. One piece of work is free to try;
> after that it is Solo or Team.
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
