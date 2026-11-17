# Product Hunt launch kit

Drafted 2026-11-17. Nothing here has been submitted. Every claim below is true of the product today
and matches the landing page (`apps/web/app/pages/index.vue`); change the page and this together.

## The listing

**Name:** Passalong

**Tagline** (Product Hunt allows 60 characters):

> Everything your team gets, sorted and closed

44 characters, and the same words as the page's `<title>`, so a visitor lands on what they clicked.
Alternatives, if the first reads too abstract on the day:

- `Requests, bugs and alerts, sorted to people and AI agents` (57)
- `One board for your team and its AI agents. Nothing dropped` (58)

**Description** (260 characters at most):

> Emails, bug reports, alerts and requests become work the moment they arrive. Passalong's agent
> sorts each one to the right person or AI agent, your agents read what the team knows first, and
> nothing closes without proof you can check.

(234 characters as one line.)

**Topics:** Productivity, Developer Tools, Artificial Intelligence, Task Management.

**Works with** (Product Hunt's "built with / integrations" field): Claude Code, Codex, Cursor, ChatGPT, Claude, Sentry, PostHog,
GitHub Actions, Slack, Discord, Google Chat, GitHub, GitLab.

**Links:** https://passalong.dev (website), https://passalong.dev/connect (setup),
https://www.npmjs.com/package/passalong.

**Pricing:** Free (25 pieces of work), with paid plans: Solo $5 a month, Team $20 a month for up
to 10 people.

## Media

All in this folder, at Product Hunt's sizes:

| File | Use |
|---|---|
| `00-thumbnail-240.png` | Thumbnail (240×240), from `apps/web/public/icon-512.png` |
| `01-passalong-launch-poster.jpg` | Gallery 1: the film's opening frame — "Your team gets everything at once." |
| `02-things-come-in.jpg` | Gallery 2: things come in |
| `03-agent-sorts-it.jpg` | Gallery 3: Passalong's agent sorts it |
| `04-projects-remember.jpg` | Gallery 4: projects remember the product |
| `05-work-done-shown.jpg` | Gallery 5: work gets done, and shown |

Gallery images are 1270×760, cropped from the landing's posters (`apps/web/public/media/`).

**Video:** Product Hunt takes a YouTube link, not a file. Upload
`apps/web/public/media/passalong-launch.mp4` (35 seconds) to YouTube as unlisted or
public and paste the link as the first gallery item.

## Maker's first comment

Post it the minute the launch goes live. Edit freely: it should sound like you.

> Hi Product Hunt 👋
>
> A small team today is people and AI agents, and things come at it from everywhere: a customer
> email, a screenshot in chat, an alert at 2am, a bug an agent found in one repo that the agent in
> the next repo needs tomorrow. Each of those can fall between two people, or between a person and
> an agent, without anybody deciding to drop it.
>
> Passalong is where those things go, and what keeps them moving until they are closed:
>
> - **Things come in** from the hub's box, email, your phone, Sentry, PostHog, a failed GitHub
>   Actions run, or anything that can POST JSON.
> - **Passalong's agent sorts each one**, pictures included: a title, a sentence anyone can read,
>   the right person or group, the right project. When it is unsure it says what is worth checking.
> - **Projects remember the product.** Each one holds documents saying what the product is and how
>   it is built, so any agent reads them before it starts, and writes back what it learned.
> - **Work gets done, and shown.** One agent holds a piece at a time, reports as it goes, asks you
>   when it needs an answer, and hands in with evidence: a screenshot, or the command it ran and what
>   came back.
>
> We never host your agent. Bring your own: Claude Code, Codex and Cursor on your machine, ChatGPT
> and Claude as a connector, or anything that speaks MCP. Your Slack, Discord or Google Chat room
> hears when work is sent.
>
> Getting started is `npm i -g passalong && passalong setup`, or open the hub and start a team —
> support and marketing folks need nothing installed. A free account holds 25 pieces of work.
>
> I'd love to hear what falls through the cracks on your team, and what would make you trust an
> agent's "done".

## Before launch day

- [ ] Pick the date. Launches reset at 12:01 a.m. Pacific; Tuesday to Thursday is busiest.
- [ ] Schedule the post on Product Hunt with the copy and media above; add co-makers.
- [ ] Upload the film to YouTube (see Media).
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
