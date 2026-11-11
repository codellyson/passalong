# Hub

The signed-in web app at `/hub`, and one of only three pages allowed to run script (with `/join` and
`/reset`). It covers everything a browser-only person needs. The box at `/hub/new` writes work from
a person's own words, which the reader shapes ([notifications.md](notifications.md)); project
documents have a Markdown editor for corrections. Everything a person reads says work, project,
document or file, never work.

## Needs you

`/hub` is Needs you: what waits on the signed-in person, ranked by the server (`GET /v1/needs`,
`apps/api/src/needs.ts`) — an agent's question, a hold gone quiet, work
sent to you or your group that nobody took, your work that came back. It decides before it lists
(2026-10-30): the first row leads as **Next** on a deeper-cream panel with **Start**, which opens
`/hub/next`, one item at a time in the same rank (j/k, Previous/Next, "1 of 12"; each its summary and
thread). The rest is grouped by
reason (Agents asking, Went quiet, Nobody took it, Came back to you), the oldest
three each, with "Show all N". The rows are a register: columns
(Work, Project, With, Waiting) labelled once above unboxed rows; a row has its title with
"Changed · what" after it, a line under it (the question asked, or
the state where the action does not already say it), and one action on the title's line, done
where the row is (2026-11-10): **Reply** opens a box in place on an agent's question (`HubNeedReply`),
**I'll do this** takes work nobody took and opens it, and a hold gone quiet or work that came back
opens the work, since both need reading first. On a phone the whole row opens the work. Beside
it, **Next steps** (2026-11-11): one card per reason below Next, saying how many wait and carrying
the same act for the oldest of them (Reply, its options, I'll do this, or Open), so what to do now
reads without the rows (wide screens only: below 1280px it would land under the list, repeating the
rows just above it); then work finished this week with **Reopen** (which asks why).
An ink bar marks work with an unread notification on it; opening the work
(`markSeen`) clears it. There is no Mark all seen (removed 2026-11-08: it cleared only the marks,
never a row, so pressing it looked like nothing happened). Empty, it says nothing needs you
and lists what closed in the last day; with no team it also offers the invite paste. Someone with
no team who never started setup is sent to `/hub/start` first (below), and while setup has steps
left and is not put away a quiet "Finish setting up" line leads Needs you (`HubSetupNote`). The old
Home (counter tiles, "How Passalong works", the activity feed) and the Activities page are gone.
`/hub` used to be the Work page: a link to it carrying `?tab=`, `?q=`, `?follows=` or `?done=` goes
on to `/hub/work` with its query.

## Setup

`/hub/start` (`pages/hub/start.vue`, 2026-10-30, docs/LOOP.md §0 step 3) is the first-run setup,
run once by whoever starts the team: **Your team** (team name, your name and @name; the invite paste
for someone meant to join instead), **Who's on it** (copy an invite link, or invite by email —
`POST /v1/teams/:slug/invites` mails when the server has a mailer and says "Not emailed" with the
person's own link when it does not), **Who does what** (Developers, Support and Marketing as
editable starters, with who is in each as toggle chips), **What you work on** (up to five projects:
name, one line, repo — `project.repo`, migration 0067 — each row's line mark showing as soon as it is
named, in the colour it is made with), **What to know** (per project: with a repo the sentence to
paste into the person's own agent, `readmeAsk()` naming the repo; without, three questions or pasted
docs, all written as READMEs by Continue in the person's own words, `draftBody()`; Skip with words
typed asks first), **Where work comes in** (the Anything address from
`/v1/inbound`, breaking only between its parts, with the phone tip) and **Connect your agents**
(`HubConnectors`, opened on Claude Code; the last button says "Finish without an agent" when nothing
can act as the person, which leaves that step left). A page of its own rather than a state of Needs
you, so every device and the "Finish setting up" link land on the same step (`?step=`). Each step is
a heading, one line of why, its controls, **Continue** (offered only when there is something to act
on) and **Skip**. Where the person got to is `account.setup` (migration 0066,
`apps/api/src/setup.ts`, `PUT /v1/me/setup`, read on `/v1/me`): steps done and skipped and whether
it was put away; accounts already in a team when 0066 ran start with it put away, and an invited
member is never offered it. `/hub`'s route middleware sends a teamless account that never touched
setup there before Needs you renders (on the server with the session cookie on a first load; a
redirect made during hydration left a blank page). On Needs you, setup is a short register of the
seven steps, done ones checked, left ones linked, headed "You're set up." only when nothing is left
and "Finish setting up" otherwise. The reader does not polish the three answers yet. `FirstRun` ("Get
started") and the `ASKS`/`CONNECT`/`teamAsk` sentences it used are gone.

## The rail

Every signed-in page sits beside a 240px solid ink rail (`HubSidebar`): the mark, **Go to id**,
Needs you with its count, Projects (each top-level project, with its line colour, its open work and a
light dot when something in it changed), Work, Support, **New** (the box at `/hub/new`), and
Settings and the account menu at the foot. On a phone the places are docked along the bottom as
in a phone app (`HubDock`, 2026-10-30, the author's call): Needs you with its count, Projects, New,
Work and Support on a 56px ink bar that clears the home indicator (`viewport-fit=cover` on hub pages
only); the current one is coral with a 2px coral bar along its top. The rest of the rail — Go to id,
each project, Settings, you — is a drawer that slides in from the right, behind the menu at the top bar's right; the mark is at its left. Anything fixed
or sticky at the foot (toasts, the bulk bar, a conversation's composer) stands `--dock` clear of it,
which is 0 from 768px up.

## Work

**Go to id** on the rail (`HubGoTo`, ⌘K or Ctrl+K) opens work by the id an agent named it by — a bare id, one in backticks, or a share or hub link (`workIdFrom()` in `utils/goto.ts`). On a phone it is in the drawer, with no shortcut hint. A work page is under Work on the rail, and opens with a ← Work link back to the board.

`/hub/work` is the team board (`HubBoard`): **four columns, people inside** (2026-10-30). Draft,
Ready, In progress and Done always fit the page — Draft and Done narrower — and never scroll
sideways; below a 60rem board they stack as sections, and on a phone one shows at a time under a
row of tabs. From md up the board stops at the window's bottom edge (2026-11-11): the page is the
window's height (`fill` in Shell.vue), each column's cards scroll inside it under its name, and By
person's sideways scroller sits on that edge; a phone still scrolls the page. Everyone in the team
sees the same board. The column is the server's — `stage` on
every row, from its status and its claims (`boardPlace()` in board.ts) — so a card moves when the
work moves and never because of who is looking. Inside Ready, work is grouped under who it is for
(the server's `lanes`): you first, then each teammate, each group, then **Anyone**; work sent to
several named people shows under each of them, as one card. The page picks the viewer's team when
they have only one; across all teams the groups are named from the cards themselves.

A card (`HubBoardCard`) has the register's anatomy: its title (the link covers the card), "Changed ·
<what>" in ink with the ink bar at its left edge when something changed since you last
looked (`changed` on every row, from unread notifications, worded as Needs you words it), then the
project's 3×14 line mark and name (`project` on every row, the top project it is linked into) and
its age in tabular figures. In progress adds one muted line: "Went quiet" or "Waiting on you" when
the hold needs somebody, who holds it ("Bola, an agent", or a person plainly) and their last
progress note (`held_by[].note`). Done is quiet and shows the latest twenty by finish time, with
**See all** (`?done=all`). Above the board: a **project** filter (`?project=`, or "Not in a
project") and **Only mine** (`?mine=1`, and an old `?tab=needs` link) — cards about you: yours,
sent to you or your group, or held by you — and a search. Neither moves a card. An empty board says
"Nothing on the board" with **New work**; a filter that leaves nothing says what it was ("Nothing in
Billing app") with **Clear filter**.

Each card has one control, its menu button (`HubCardMenu`, also on right-click): Open, Ready, Move
to Draft, Give to…, Stop this agent, Reopen… (a reason asked inside the menu), copy the share link
or the command for an agent, Archive or Unarchive to Draft, Delete (asked in place) — the work page's acts
under its rules. Dragging does the same acts: Draft to Ready marks it Ready (keeping the repo it names),
Ready to Draft, In progress to Ready stops the agent (asked above the board), into Done archives,
finished work back to Ready reopens (its reason asked above the board), out of Done to Draft
unarchives; between Ready's groups gives it to that person or group (`POST
/v1/work/:id/assign`), and while a Ready card is dragged every teammate and group shows as a
place to drop it. Nothing is dropped into In progress: taking is "I'll do this" on the work page.
Dragging is by pointer (2026-11-11), not the browser's own drag: the card lifts and follows,
where it would land opens to its height, a column or the board scrolls near its edge, and a touch
screen drags after a long press. Dropped, the card is in its new place at once (the hub's optimistic
patch), faded until the server answers and put back if refused; every card slides to wherever the
refetch puts it. A polite live region says what happened. Four columns hold from a 1024px window, and
each column's head stays at the top while Ready scrolls. A card with no project says "Not in a
project", the phrase Needs you uses too. A quiet tick on each card (shown on hover, focus, touch,
or once any card is ticked; not on Done) selects it for the **bulk bar**: Give to…, Move to… (Ready
or Draft, with how many each applies to) and Archive…, each confirmed in place, said in the live
region, then reloaded (`onBulk`, the single acts' routes four at a time).

It replaced four tabs (Needs you, Being worked on, Open, Done) worked out per viewer, which put the
same work in different places for different teammates and counted it differently.

**Who may do what on team work:** anyone in the team moves it between Draft and Ready, stops an
agent, gives it to someone else (**Give to…** on every card that is not done), and reopens finished
work with a reason (**Reopen**, on the work page, the card menu, or dragging it out of Done).
Finishing is final, so there is no review: a work page leads finished work with what it was
**Finished with**, and **Ask someone to check** sends a teammate new work, with this as its parent,
to look at it.
Archiving and deleting stay with its author or a team admin.

A browser-only person can take work from its page, post progress and hand it in there. These holds
use the person's account identity and a week-long lease; their hand-in carries prose and evidence,
like an agent's.

The title's scope picker applies to every work list and work being held. Team
membership is checked at the API boundary, and each list narrows in SQL before its row limit. A
failed list shows an error and retry instead of an empty board. Marking activity read only marks the selected scope.
List rows show a compact image card when the work carries a stored Passalong screenshot. The API
chooses the first image named in its document, then the oldest image in its evidence, and
only from shots it still claims. The hub loads it from its own origin.
Team admins can select, archive, unarchive and delete teammates' work in the same lists as the
author.

## The work page — `/hub/w/:id`

- **Acts** lead the header: one for the work's state (Ready, I'll do this, Give to…, Stop this agent,
  Reopen, Unarchive to Draft) and at most one beside it (Give to… or Archive). Everything else is under
  **More**: Not for me, Move to Draft, Make it private again (the author's recall), Ask someone to
  check, the share link and page, Copy the command for an agent, Let an always-on agent take this on
  its own (`work.alone`), and Delete, asked in place.
- **The document** is the share page at `?embed=1` in a sandboxed same-origin frame with no scripts. The
  hub never renders a stranger's markdown as its own HTML (see [security-model.md](security-model.md)).
- **Progress** leads the sidebar: what happened, in order — sent, opened, taken and where, what they
  said, what they handed in and showed, work made from it — ending on a coral *Now* line. Built from
  `GET /v1/work/:id/context`, which records no pull.
- **The thread** (`HubThread`, `GET /v1/work/:id/thread`) is the conversation: every
  `task_event` line as chat, and a reply box to whoever holds it.
- **Who has it** and **Tied to** (its parent, work made from it, blockers, projects) follow.
- **Loading.** The page asks for its context and its thread together, as soon as the hub starts
  loading rather than after `/v1/me` answers, through `reads` in `useHub` so the page, `HubThread`
  and a prefetch share one cache entry. Pointing at or focusing any link to `/hub/w/:id` or
  `/hub/projects/:id` starts reading that page (`prefetch`, one listener in `HubShell`). On the
  server, `/context` and `summaries()` ask their lookups at once instead of one after another.
  The hub-wide lists (`/v1/work`, `/v1/board`, `/v1/tasks`, `/v1/tokens`) are not read here: each
  loads only once a page that shows it asks (`need` in useHub), and stays loaded for the visit.

## Projects — `/hub/projects`

A project is a project (docs/LOOP.md §0); the hub never says "project". `/hub/projects` is a register
like Needs you: each top-level project with its line colour, its line of description, open work,
documents and last change rolled up over the projects inside it (`projectsFrom()`), "Changed · …" leading
the second line when something in it changed since you last looked (no left bar: the line colour already
marks the row), a plain create form and the agent's ask. The title and New project share a line with
the summary under them; the labels sit over a hairline; the whole row opens the project, with no Open
button.
`/hub/projects/:id` has three tabs at their own addresses (`?tab=documents|work|history`):
**Documents** leads with the README rendered in full, then the other documents (last editor, person
or agent, and when), projects inside it listed quietly, and files; a document opens in place
(`?doc=`, `HubProjectDocument`), is edited as rich text (`HubDocEditor`, Markdown on the server), saves a new version with the version it opened and refuses a stale
one, and an earlier version is read-only at `?doc=…&v=…` with "Put this version back". **Work** is
the project's register (Work · With · State · Age · one action), Open then Done recently; "New work"
opens the box with `?project=`, which files into that project's team and links it here.
The page draws whatever was read for it before (an earlier visit, or a hover) at once and refreshes
behind it; `GET /v1/projects/:id` carries the README's body, so it opens in one request, not two.

## The box

`/hub/new` is a writing surface: one tall editor (`HubWriter`, `class="box"`) under "What do you
need?", with Attachment (a picture is drawn inline; a PDF, zip or text file is kept as an attachment the work claims), @ Person and # Group inside it and **File it** (or ⌘/Ctrl+Enter, caught
before the editor turns it into a line break). Starter lines sit under it as quiet text while it is
empty; a team picker shows only for someone in several teams. Beside it (under it on a phone) is
the agent's reading, refreshed as you write from `POST /v1/compose/preview`: Work (title and tag),
Project (mark or "Not in a project"), For (group or everyone, with the reason), Worth checking when
unsure, what is kept as it came, and Looks like (work already on the board, each with its project,
holder or state and age); on a phone the editor's foot repeats the reading in one line. Filing turns
the page into "Filed: <title>" with Project, For and Why, and Open it, Write another, Move… (project
and who it is for, in place) and, set apart, Undo: it deletes the work, which takes its unread feed
lines with it (`forgetWork()` in notify.ts, from `DELETE /v1/work/:id`, which answers `told`), and
says how many people may already have been told by mail or push, which cannot be recalled. The last
five filings are a register below. An empty preview answering 501 means there is no reader, and the
page says "Writing it down here isn't set up" before anyone writes. `?shared=1` (a phone's Share)
lands with the shared words and pictures already in the editor.
**History** merges work finished (who, person or agent, and what was shown) and document versions,
newest first, with no counts. Work and History come from one read, `GET /v1/projects/:id/project`
(`apps/api/src/project.ts`), which owns no table.

The change mark on a project, a document or a History line is the server's answer, said one way, "Changed ·
<what>": unread news on its work, or a document version someone else saved after you last opened
that document (`document_seen`, migration 0064, `docChange()` in project.ts). Opening the
document clears it (`PUT /v1/projects/:id/documents/:doc/seen`). Nothing is kept in the browser. Deleting a project or a file asks in place at the foot
of Edit or on the file's row, naming what goes. There is no `/hub/projects`:
nothing outside the hub linked to it. See [projects.md](projects.md).

## Live

The hub keeps itself current while open (`useLive`, `GET /v1/events`): an event refreshes what it
touches, and anything that needs you arrives as a toast. See [notifications.md](notifications.md).

## Settings

Five pages, one topic each, at `/hub/settings/[[tab]]`:
- **Account** (`/hub/settings`): profile, sign-in, notifications (push, per device).
- **Plan**: your own plan, as facts (plan, work used, ends on, billing), sandbox badge when the key
  is a sandbox one.
- **Teams**: each team under its name — members as a register with remove/leave asked in place,
  invite link, groups and channels (owners), and the team's plan; checkout owner only, everyone
  else told who can.
- **Agents** (`/connections`, the address it had before the split): connected apps and API tokens,
  what acts as you.
- **Integrations** (`/integrations`): email, Sentry, PostHog and webhooks, what sends work to you.

It was one scroll of ten sections, and people found it overwhelming. Since 2026-10-30 the pages
are the hub's tabs (each its own address, an ink bar, a status dot on a tab with something broken)
under a heading and a one-line summary of facts, and each page opens with only the "Needs you"
items that belong to it. Every block is `HubSettingsSection` (a title over one ink rule, a line
saying what it is for) holding `HubSettingRow`s (label left, control right; stacked on a phone) or a
register; every destructive act asks in place and names what breaks. An old
`/hub/settings#anchor` link is forwarded to the page holding that anchor (`tabOf()`); a
`#token=` fragment is not an anchor. There is no Clean-up section: proof clean-up is a fixed rule
(work.md).

## Sources
- `apps/web/app/pages/hub/index.vue` (Needs you), `components/hub/Sidebar.vue`, `utils/projects.ts`, `apps/api/src/needs.ts`, `pages/hub/work.vue`, `composables/useWorkLists.ts`, `pages/hub/w/[id].vue`, `pages/hub/projects/`, `components/hub/ProjectDocument.vue`, `apps/api/src/project.ts`, `pages/hub/settings/[[tab]].vue`
- `apps/web/app/components/hub/Board.vue`, `BoardCard.vue`, `BulkBar.vue`, `CardMenu.vue`, `app/composables/useWorkLists.ts`, `app/utils/progress.ts`, `app/composables/useHub.ts`, `useLive.ts`
- [AGENTS.md](../../AGENTS.md): "A team's board is one board", "The hub shows a piece of work by framing it…", "The hub is live…"
