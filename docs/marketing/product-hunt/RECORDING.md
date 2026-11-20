# Recording the landing's motions

Drafted 2026-11-17. Nothing has been recorded for the landing yet.

## Current approach: a real Claude Code session on staging

The landing should show Claude in action, not a mock-up or a scripted replay. So the film is a
screen recording, made by hand (Cmd-Shift-5), of a real Claude Code session working one piece of
work on `staging.passalong.dev`, with the hub open beside it:

- A demo team, **Fieldnote** (Mark, Rui, Sam; groups `#backend` and `#web`; project **Web app**
  with a README, a Checkout page and a Log), lives on staging only, as test accounts.
- The coupon bug ("Coupon field accepts expired codes") is filed by Mark for `#backend`. Its text
  asks whoever takes it to check whether an expired code should show an error.
- Rui's Claude Code runs in a small demo repo with only the `passalong` tools pointed at staging,
  none of the recorder's own settings, hooks or plugins, and its in-terminal question tool turned
  off, so its question goes through Passalong's `ask` and is answered from the hub.
- The prompt is "There's a coupon bug waiting for me on Passalong. Take it and fix it." Claude
  finds it, takes it, reads the code, asks, gets Mark's reply, fixes it, runs `npm test` and hands
  in. The hub shows each step and the card ends in Done.

Two automated attempts on localhost taught what this needs: a page that films a terminal has to
answer Claude's folder-trust prompt with "Yes" (the default is "No, exit"), and with its own
question tool available Claude asks in the terminal, where nobody in the hub can answer.

Staging must run `master` before recording (see docs/DEPLOY.md, Staging), or the board says
"To do" where the landing says "Ready".

## Earlier plan: scripted takes

Kept for the scope notes and captions. The approach below (the hub filmed by Playwright while the
CLI made the calls off camera) was tried for one clip and set aside: it showed no agent.

The landing's film and four loops are animated mock-ups that still tell the customer-reply story
removed in #217. These replace them with the hub responding to an agent's real tool calls.

## Scope

**Who watches.** Someone on Product Hunt or the landing deciding whether to try Passalong:
usually a developer who already works with Claude Code, Codex or ChatGPT, sometimes the person who
runs a small team. They should come away knowing what their agent does with Passalong, and what
the team sees when it does.

**What is filmed.** The hub, in one browser tab. The agent's side is the real operation, not a
mock-up: each step's take runs the `passalong` CLI (or, for documents, the `/v1` route), which
performs the same operations the MCP tools call. Playwright films the hub changing in response,
and the caption names the tool. No agent or terminal is on screen, so no caption may say an agent
typed or decided anything it did not.

**Voice.** The landing's loops play muted: captions only. The film also gets a voice (Kokoro,
generated locally), for the YouTube upload Product Hunt links to.

**Build.** A fresh worktree of `master` (5bfb47f at the time of writing; say which commit was
filmed), run with `pnpm dev`, never this worktree's working tree. What is filmed must match what
production serves on launch day.

**What gets written.** Only the local D1 that `pnpm dev` manages. `passalong.dev` and
`passalong.kreativekorna.com` go in `blockWrites`, so any write to production aborts the take.
Each take registers `afterTake` to archive and delete the work it created. The demo team itself is
throwaway: it lives only in the local database.

## Setup needed

- A fresh account on localhost, signed in by you through `login.cjs` (the take never types a
  password), with a CLI token for the same account in a throwaway `PASSALONG_HOME`.
- Team **Fieldnote**: Mark (the signed-in viewer), Sam (design), Rui (backend). Groups `#web` and
  `#backend`. Project **Web app**, repo set, with a README, a `Checkout` page and a Log of three
  lines, at version 4.
- 8–12 pieces of work across the four columns, so the board does not look empty: "Export CSV drops
  the last row", "Dark mode on settings", "Invite email lands in spam", and so on.
- Light theme, 1440×900 for the loops (the landing's 1200×750 is the same 8:5 shape), 1600×900 for
  the film (16:9).
- Every record named with a short suffix (`Coupon field accepts expired codes · 4821`) in the
  takes, hidden from the caption, so two takes never fight over one card.

## Watch out

- The board in Claude Code (`find_work` drawn as an MCP App) cannot be filmed this way: clip 2
  shows the same board in the hub instead.
- Clip 2's landing heading says "Passalong's agent sorts it". If clip 2 shows `find_work` and
  `take`, the heading should become "Your agent finds its work" when the clip is swapped in.
- `ask` holds until someone replies. In clip 4 the take replies from the hub on camera, and the
  next step's `progress` is what picks the reply up.

## Scripts

Captions are the last cell. On the loops they are short enough to read in two to three seconds.

### things-come-in — `create_work`

| Shot | On screen | Caption |
|---|---|---|
| L01 | The board, Ready column in view. Off camera: `passalong new` with title, summary, `to: #backend`, project Web app. | Your agent finds a bug that isn't its job and calls create_work. |
| L02 | The card appears in Ready under #backend, then opens to its summary. | It lands on the team's board, for #backend, in Web app. |
| L03 | Switch to Rui's view: Needs you, the card at the top as sent to his group. | Rui sees it waiting for him. |

### agent-sorts-it — `find_work`, `take`

| Shot | On screen | Caption |
|---|---|---|
| L01 | The board, Ready grouped as Rui / #backend / Anyone. Off camera: `passalong board` as Rui. | find_work shows your agent what's waiting, grouped by who it's for. |
| L02 | Off camera: `passalong take <id>`. The card moves to In progress, marked held. | take: one agent holds it. Nobody else can take it now. |
| L03 | Off camera: a second `take` of the same id, refused. The card stays put. | A second agent is told who has it, and stops. |

### projects-remember — `read_document`, `save_document`

| Shot | On screen | Caption |
|---|---|---|
| L01 | Web app's project page, Documents tab, README open. | Every take starts with the project's documents. |
| L02 | Off camera: the document route saves a new Log line. The Log reloads with it. | When it learns something, the agent writes it back with save_document. |
| L03 | The Log's history: version 5, saved by an agent. | The next agent starts knowing it. |

### work-done-shown — `progress`, `ask`, `hand_in`

| Shot | On screen | Caption |
|---|---|---|
| L01 | The work page. Off camera: `passalong progress <id> "Found it: no team check on coupons"`. Progress fills in. | progress: the team sees each step as it happens. |
| L02 | Off camera: `passalong ask <id> "Show an error for expired codes, or ignore them?"`. The question shows; the cursor clicks Reply, types "Show an error", sends. | ask: when it needs you, it asks, and waits for your answer. |
| L03 | Off camera: `passalong hand-in <id>` with `npm test` and its passing line. The page leads with Finished with. | hand_in: done, with the proof. Here, the passing test. |

### passalong-launch (the film) — every tool, one piece of work

About 35 seconds of voice. Voice and caption are the same line.

| Shot | On screen | Voiceover |
|---|---|---|
| L01 | Mark's board. A card arrives in Ready under #backend. | Mark's agent finds a bug in someone else's code, and files it with create_work. |
| L02 | Rui's Needs you, the card at the top. | It goes straight to the person who can fix it. |
| L03 | The card moves to In progress. | Rui's agent takes it. Nobody else can, while it's held. |
| L04 | Web app's README, then the work page. | Before it starts, it reads what the team knows about the product. |
| L05 | Progress filling in on the work page. | It reports as it goes. |
| L06 | The question, Rui replies from the hub. | When it needs an answer, it asks, and waits. |
| L07 | Finished with, and the passing test. | It hands in with proof you can check. |
| L08 | The project's Log, a new line. | What it learned goes into the project, for the next agent. |
| L09 | Mark's board, the card in Done. | Mark sees it finished. Nothing was dropped. |

## After recording

The landing (2026-11-18) has no film and no loops: a board screenshot, then three still screens
from staging with a line each (`project`, `ask`, `proof` in `apps/web/app/pages/index.vue`'s
`STORY`). The recording replaces those stills.

- Cut one clip per still: reading the project, asking and getting the reply, handing in with proof.
- Encode each at the stills' 5:3 shape (1400×840), muted, looping, with a poster from a frame that
  reads without the video; light and dark if both can be filmed. Swap `STORY` from images to
  `<video>` and keep reduced motion on the poster.
- The full session, voiced or captioned, goes to YouTube for the Product Hunt listing.
- Regenerate the gallery images (`02`–`05` in this folder) if the clips show more than the stills.
- Delete the throwaway `PASSALONG_HOME`s and confirm no test work remains outside the demo team.
- `media/launch-video/` and `apps/web/public/media/features/` only serve the old film and loops:
  delete them or keep them, your call.
