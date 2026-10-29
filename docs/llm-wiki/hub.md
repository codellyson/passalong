# Hub

The signed-in web app at `/hub`, and one of only three pages allowed to run script (with `/join` and
`/reset`). It covers everything a browser-only person needs. The box at `/hub/new` writes work from
a person's own words, which the reader shapes ([notifications.md](notifications.md)); folder
documents have a Markdown editor for corrections. Everything a person reads says work, project,
document or file, never guide.

## Needs you

`/hub` is Needs you: what waits on the signed-in person, ranked by the server (`GET /v1/needs`,
`apps/api/src/needs.ts`) — customers waiting on us, an agent's question, a hold gone quiet, work
sent to you or your group that nobody took, your work that came back. It is a register: columns
(Work, Project, With, Waiting) labelled once above unboxed rows; a row has its title with
"Changed · what" after it, a line under it (the customer's own latest words, the question asked, or
the state where the action does not already say it), and one action on the title's line. Beside
it: work finished this week with **Reopen** (which asks why), then requests waiting on the customer.
A coral bar marks work with an unread notification on it; opening the work
(`markSeen`) clears it, and **Mark all seen** clears everything. Empty, it says nothing needs you
and lists what closed in the last day. A new account gets the first-run steps here instead. The old
Home (counter tiles, "How Passalong works", the activity feed) and the Activities page are gone.
`/hub` used to be the Work page: a link to it carrying `?tab=`, `?q=`, `?follows=` or `?done=` goes
on to `/hub/work` with its query.

## The rail

Every signed-in page sits beside a 240px solid ink rail (`HubSidebar`): the mark, **Go to id**,
Needs you with its count, Projects (each top-level folder, with its line colour, its open work and a
coral dot when something in it changed), Work, Support, **New** (the box at `/hub/new`), and
Settings and the account menu at the foot. On a phone it is a drawer behind a top bar with the
menu, the mark and New. The bottom tab bar and the top row of links are gone.

## Work

**Go to id** on the rail (`HubGoTo`, ⌘K or Ctrl+K) opens work by the id an agent named it by — a bare id, one in backticks, or a share or hub link (`guideIdFrom()` in `utils/goto.ts`). On a phone it is in the drawer, with no shortcut hint. A work page is under Work on the rail, and opens with a ← Work link back to the board.

`/hub/work` is the team board (`HubBoard`), like any shared task board: every piece of work
in scope is a card in one of four stage columns, and everyone in the team sees the same board. The column
is the server's — `stage` on every row, from its status and its claims (`boardPlace()` in
index.ts) — so a card moves when the work moves and never because of who is looking. A card shows
the label its agent gave it (`HubWorkTag`, the first tag), who it is for (`@handle`, `#group`, the team, or private), who it is from and who holds it;
opening it goes to the work page, where the actions are. From md the columns sit side by
side, at least 15rem each and sharing the rest — the Work page takes the whole width beside the rail — and the board scrolls sideways on its own when they do not fit; on a phone one column shows at a time, picked from tabs. A card's footer says who
has it — initials, ⚡ and the agent's name, and a dot for its `health` (working, went quiet, asked a
question, a person's hold), with a word when somebody should look — and who it is for,
which is also the **Give to…** control. Its age is since its holder was last heard from or its last
edit. Done is faded. In a team it is a Trello board with a list per person: Draft, To do, a
column per teammate and per group with work waiting, In progress, Done. Waiting work sits in the
column of whoever it was sent to (the server's `lanes`), or To do; several named people each see it,
as one card; dragging it to a column gives it there. **By person** is on by default, and off
(`?by=stage`) shows the four stages with everyone's work together. The page picks the viewer's team when they have
only one; "All teams" keeps the plain stage columns. **Show only mine** (`?mine=1`, and an old
`?tab=needs` link) narrows to cards about you — yours, sent to you or your group, or held by you — without moving any card. Done shows the newest twenty.
A round dot at a card's top-left (shown on hover, always on touch, and on every card once one is
selected) selects it for the floating bar that archives, unarchives or deletes several at once;
only cards you may manage have one. Right-clicking a card opens its quick actions (`HubCardMenu`):
Ready, Move to Draft, Give to…, Stop this agent, Reopen…, copy the share link or the take command,
Archive or Unarchive to Draft, Delete — the work page's acts under its rules. A card can also be dragged
to a column that means one of those acts (back to Draft, Stop this agent, Archive, Unarchive, Reopen,
and Ready from Draft to To do, which keeps the repo the work already names; its page is where to
change it). A drop lands at once and goes back, with the hub's error, if the server
refuses; while dragging, a gap opens where the card would land. From md the columns are lanes the
height of the window, each scrolling its own cards under a fixed header.

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

## The work page — `/hub/g/:id`

- **The document** is the share page at `?embed=1` in a sandboxed same-origin frame with no scripts. The
  hub never renders a stranger's markdown as its own HTML (see [security-model.md](security-model.md)).
- **Progress** leads the sidebar: what happened, in order — sent, opened, taken and where, what they
  said, what they handed in and showed, work made from it — ending on a coral *Now* line. Built from
  `GET /v1/guides/:id/context`, which records no pull.
- **The thread** (`HubThread`, `GET /v1/guides/:id/thread`) is the conversation: every
  `task_event` line as chat, and a reply box to whoever holds it.
- **Who has it** and **Tied to** (its parent, work made from it, blockers, folders) follow.

## Projects — `/hub/projects`

A project is a folder (docs/LOOP.md §0); the hub never says "folder". `/hub/projects` is a register
like Needs you: each top-level project with its line colour, its line of description, open work,
documents and last change rolled up over the folders inside it (`projectsFrom()`), coral when
something in it changed since you last looked, a plain create form and the agent's ask.
`/hub/projects/:id` has three tabs at their own addresses (`?tab=documents|work|history`):
**Documents** leads with the README rendered in full, then the other documents (last editor, person
or agent, and when), folders inside it listed quietly, and files; a document opens in place
(`?doc=`, `HubProjectDocument`), is edited as rich text (`HubDocEditor`, Markdown on the server), saves a new version with the version it opened and refuses a stale
one, and an earlier version is read-only at `?doc=…&v=…` with "Put this version back". **Work** is
the project's register (Work · With · State · Age · one action), Open then Done recently; "New work"
opens the box with `?project=`, which files into that project's team and links it here.
**History** merges work finished (who, person or agent, and what was shown) and document versions,
newest first, with no counts. Work and History come from one read, `GET /v1/folders/:id/project`
(`apps/api/src/project.ts`), which owns no table.

Coral on a project, a document or a History line is the server's answer, said one way, "Changed ·
<what>": unread news on its work, or a document version someone else saved after you last opened
that document (`folder_document_seen`, migration 0064, `docChange()` in project.ts). Opening the
document clears it (`PUT /v1/folders/:id/documents/:doc/seen`); "Mark all seen" on Needs you clears
documents too. Nothing is kept in the browser. Deleting a project or a file asks in place at the foot
of Edit or on the file's row, naming what goes. There is no `/hub/folders`:
nothing outside the hub linked to it. See [folders.md](folders.md).

## Live

The hub keeps itself current while open (`useLive`, `GET /v1/events`): an event refreshes what it
touches, and anything that needs you arrives as a toast. See [notifications.md](notifications.md).

## Settings

Five pages, one topic each, at `/hub/settings/[[tab]]`:
- **Account** (`/hub/settings`): profile, sign-in, notifications (push, per device), clean-up.
- **Plan**: the plan.
- **Teams**: the team cards.
- **Agents** (`/connections`, the address it had before the split): connected apps and API tokens,
  what acts as you.
- **Integrations** (`/integrations`): email, Sentry, PostHog and webhooks, what sends work to you.

It was one scroll of ten sections, and people found it overwhelming. The sidebar lists the four
pages, each with its own state ("2 need you", "1 failing"), and each page opens with only the
"Needs you" items that belong to it. An old `/hub/settings#anchor` link is forwarded to the page
holding that anchor (`tabOf()`).

## Sources
- `apps/web/app/pages/hub/index.vue` (Needs you), `components/hub/Sidebar.vue`, `utils/projects.ts`, `apps/api/src/needs.ts`, `pages/hub/work.vue`, `composables/useWorkLists.ts`, `pages/hub/g/[id].vue`, `pages/hub/projects/`, `components/hub/ProjectDocument.vue`, `apps/api/src/project.ts`, `pages/hub/settings/[[tab]].vue`
- `apps/web/app/components/hub/Board.vue`, `app/composables/useWorkLists.ts`, `app/utils/progress.ts`, `app/composables/useHub.ts`, `useLive.ts`
- [AGENTS.md](../../AGENTS.md): "A team's board is one board", "The hub shows a guide by framing it…", "The hub is live…"
