# Hub

The signed-in web app at `/hub`, and one of only three pages allowed to run script (with `/join` and
`/reset`). It covers everything a browser-only person needs. Guides are created by `share()`;
folder documents have a Markdown editor because their purpose is continuing work on a brief or script.

## Home

`/hub` is the overview: the board's five column counts (Draft, To do, In progress, In review, Done),
the same for everyone in the team; "How Passalong works", open; and the activity feed. A new account
gets the first-run steps here instead. The counts come from `useWorkLists`, the same composable the
Work page draws the board with, so the two pages cannot disagree. `/hub` used to be the Work page:
a link to it carrying `?tab=`, `?q=`, `?follows=` or `?done=` goes on to `/hub/work` with its query.

## Work

**Go to id** in the header (`HubGoTo`, ⌘K or Ctrl+K) opens a guide by the id an agent named it by — a bare id, one in backticks, or a share or hub link (`guideIdFrom()` in `utils/goto.ts`). Hidden on a phone, where the bar has no room.

`/hub/work` is the team board (`HubBoard`), like any shared task board: every task, handoff and bug
in scope is a card in one of five columns, and everyone in the team sees the same board. The column
is the server's — `stage` on every guide row, from its status and its claims (`boardPlace()` in
index.ts) — so a card moves when the work moves and never because of who is looking. A card says
its kind, who it is for (`@handle`, `#group`, the team, or private), who it is from and who holds it;
opening it goes to the guide page, where the actions are. From md the five columns sit side by
side, at least 15rem each and sharing the rest — the Work page and the top bar take a 90rem measure so
five fit at about 17rem on a wide screen — and the board scrolls sideways on its own when they do not; on a phone one column shows at a time, picked from tabs. A card's footer says who
has it — initials, ⚡ and the agent's name, and a dot for its `health` (working, went quiet, asked a
question, a person's hold, handed in), with a word when somebody should look — and who it is for,
which is also the **Give to…** control. Its age is since its holder was last heard from or its last
edit. Done is faded. **Show only mine** (`?mine=1`, and an old
`?tab=needs` link) narrows to cards about you — yours, sent to you or your group, held by you, or
yours to review — without moving any card. Done shows the newest twenty.
A round dot at a card's top-left (shown on hover, always on touch, and on every card once one is
selected) selects it for the floating bar that archives, unarchives or deletes several at once;
only cards you may manage have one. Right-clicking a card opens its quick actions (`HubCardMenu`):
Open, Ready for agents…, Move to Draft, Give to…, Stop this agent, copy link or pull command,
Archive or Unarchive, Delete — the guide page's acts under its rules. A card can also be dragged
to a column that means one of those acts (back to Draft, Stop this agent, Archive, Unarchive);
Draft to To do asks which repo where it was dropped (`HubReadyPrompt`, which Ready for agents… in
the menu opens too). A drop lands at once and goes back, with the hub's error, if the server
refuses; while dragging, a gap opens where the card would land. From md the columns are lanes the
height of the window, each scrolling its own cards under a fixed header.

It replaced four tabs (Needs you, Being worked on, Open, Done) worked out per viewer, which put the
same guide in different places for different teammates and counted it differently.

**Who may do what on a team guide:** anyone in the team moves it between Draft and Ready, stops an
agent, gives it to someone else (**Give to…** on every card that is not done), and reviews a hand-in (Approve / Accept / Ask for changes) — except whoever did the work:
`ownWork()` in claims.ts refuses a review of your own hand-in, and the card wears **Your review**
(`can_review`) for everyone else. Archiving and deleting stay with its author or a team admin. A
private guide (no team) is its author's alone, and its author reviews it.

A browser-only person can take an eligible task from its guide page,
post progress and hand it in there. These holds use the person's account identity and a week-long
lease; their hand-in may include prose and evidence without requiring a separate report guide.
Agent hand-ins still carry their report guide and their usual evidence contract.

"How Passalong works" (a disclosure, open on Home) holds the work loop as four steps: capture a task, bug or
handoff through CLI/MCP/API; route it to a person, group, team or queue; collaborate through progress,
questions and attachments; then review checks and evidence. Links below the diagram lead to project
folders, team settings and the activity feed.

The title's scope picker applies to guides, tasks, work being held, hand-ins and activity. Team
membership is checked at the API boundary, and each list narrows in SQL before its row limit. A
failed list shows an error and retry instead of an empty board. Marking activity read only marks the selected scope.
List rows show a compact image card when the guide carries a stored Passalong screenshot. The API
chooses the first image named in the guide document, then the oldest image in its evidence, and
only from shots still claimed by that guide. The hub loads it from its own origin.
Team admins can select, archive, unarchive and delete teammates' guides in the same lists as the
author; task review and ready actions also appear where the API already lets an admin decide.

## The guide page — `/hub/g/:id`

- **The document** is the share page at `?embed=1` in a sandboxed same-origin frame with no scripts. The
  hub never renders a stranger's markdown as its own HTML (see [security-model.md](security-model.md)).
- **Progress** leads the sidebar: what happened, in order — sent, opened, taken and where, what they
  said, what they handed in and showed, follow-ups — ending on a coral *Now* line. Built from
  `GET /v1/guides/:id/context`, which records no pull.
- **Who has it** and **Tied to** (what it follows, follow-ups, report, blockers) follow.

## Folders — `/hub/folders`

Private and team project folders hold Markdown documents, file assets and links to existing guides.
The document editor saves a new revision using the version it opened, and refuses a stale save.
The same documents are reachable through MCP; see [folders.md](folders.md).

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
- `apps/web/app/pages/hub/index.vue` (Home), `pages/hub/work.vue`, `composables/useWorkLists.ts`, `pages/hub/g/[id].vue`, `pages/hub/folders/`, `pages/hub/settings/[[tab]].vue`
- `apps/web/app/components/hub/Board.vue`, `app/composables/useWorkLists.ts`, `app/utils/progress.ts`, `app/composables/useHub.ts`, `useLive.ts`
- [AGENTS.md](../../AGENTS.md): "The board", "The hub shows a guide by framing it…", "The hub is live…"
