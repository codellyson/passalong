---
name: Passalong hub
description: The signed-in hub, drawn as a register of what moved and who must act, on cream with an ink rail.
colors:
  cream-ground: "#fffcfa"
  deeper-cream: "#f7f2ed"
  recessed-cream: "#f2ebe3"
  field-white: "#fffefe"
  ink: "#252522"
  muted-ink: "#6e6c68"
  hairline: "#efe6dc"
  rule: "#e0d4c7"
  coral: "#f2805d"
  coral-text: "#b8481f"
  rail-ink: "#252522"
  on-rail: "#f4efe9"
  on-rail-muted: "#aaa59d"
  project-amber: "#b07a12"
  project-green: "#3f7d52"
  project-blue: "#3e6fa6"
  project-violet: "#7a5bb0"
  project-teal: "#2f8582"
  project-stone: "#7b6e5f"
  ok: "#3a7a2a"
  warn: "#86750f"
  danger: "#b8322a"
  danger-soft: "#fbe3de"
typography:
  headline:
    fontFamily: "Onest, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  row-title:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25rem
  body:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.25rem
  meta:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    fontFeature: "tnum"
  label:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.05em"
  code:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
rounded:
  mark: "1px"
  r-1: "2px"
  r-2: "3px"
  r-3: "4px"
  dot: "999px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
  s-8: "64px"
  s-9: "96px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.r-3}"
    height: "40px"
    padding: "0 20px"
  button-hover:
    backgroundColor: "{colors.recessed-cream}"
  button-sm:
    textColor: "{colors.ink}"
    rounded: "{rounded.r-3}"
    height: "32px"
    padding: "0 14px"
  button-primary:
    backgroundColor: "{colors.coral-text}"
    textColor: "{colors.cream-ground}"
    rounded: "{rounded.r-3}"
    height: "40px"
    padding: "0 20px"
  button-rail-new:
    backgroundColor: "{colors.on-rail}"
    textColor: "{colors.rail-ink}"
    rounded: "{rounded.r-3}"
    height: "40px"
  input:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r-2}"
    height: "40px"
  input-focus:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r-2}"
  chip-chosen:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream-ground}"
    rounded: "{rounded.r-3}"
  rail:
    backgroundColor: "{colors.rail-ink}"
    textColor: "{colors.on-rail}"
    width: "240px"
    padding: "16px 12px 12px"
  rail-item:
    textColor: "{colors.on-rail-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.r-1}"
    height: "32px"
    padding: "4px 12px"
  register-row:
    textColor: "{colors.ink}"
    typography: "{typography.row-title}"
    padding: "12px 0 12px 16px"
  panel:
    backgroundColor: "{colors.deeper-cream}"
    rounded: "{rounded.r-3}"
    padding: "12px 16px 4px"
  project-mark:
    backgroundColor: "{colors.project-blue}"
    rounded: "{rounded.mark}"
    width: "3px"
    height: "14px"
  change-mark:
    backgroundColor: "{colors.ink}"
    width: "3px"
---

# Design System: Passalong hub

## Overview

**Creative North Star: "The Drawing Set"**

The hub is a register of what moved and who must act. It keeps Passalong's cream ground, ink and coral, and draws them with a drawing set's discipline: a solid ink rail down the left, one-pixel rules where other products put soft cards, corners of two to four pixels, a grotesque for every piece of chrome, and figures that line up in columns. Hierarchy comes from an ink rule over a list and a deeper cream behind a panel, never from shadow or fill colour.

Coral means active here: where you are, what you chose, and the one action to press. A change since you last looked is ink: a 3px ink bar at a row's left edge with a label naming what changed, and a light dot beside a project on the rail, held until the work is opened. Each project owns a line colour from a fixed set of six, shown as a short vertical mark wherever the project is named, so a project reads the same in the rail, in a register row and in a side panel.

This world covers every signed-in screen under `/hub`: `.hub-app` on `<body>` restates the root tokens. The landing, the blog and the share pages keep the root tokens (24px cards, pill buttons, the serif as an editorial accent) and are not part of this system.

**Key Characteristics:**
- Solid ink rail, 240px, in both themes; light-on-dark project marks on it.
- Registers, not cards: rows divided by hairlines under an ink rule, with column labels once at the top.
- Square-ish geometry (2, 3, 4px); nothing round but a dot.
- Onest for everything, JetBrains Mono for machine strings, no serif.
- Coral for active (current place, chosen, primary action); ink for unseen change; six project line colours, none near coral.
- Tabular figures wherever a count or an age stands in a column.

## Colors

Warm cream and ink carry the whole interface; coral marks what is active, and the six project lines are marks, never fills of text blocks. Every colour except coral is a `light-dark()` pair; the frontmatter holds the light half and the sidecar holds the pair.

### Primary
- **Ink** (`ink`): text, the change mark (3px bar) and its "Changed · …" label, the rule over a register or a panel heading.
- **Active Coral** (`coral`): on the ink rail and dock, the current place's text and the New fill; the current tab's 2px bar; the brand mark. At 2.6:1 on cream it is never used as text there.
- **Coral Text** (`coral-text`, `--accent`): the same hue at a readable 5:1, the primary button's and a chosen chip's fill (with `--accent-fg` text), and a checked control. In dark mode it is the light coral with dark text.

### Secondary
- **Project line colours** (`project-amber`, `project-green`, `project-blue`, `project-violet`, `project-teal`, `project-stone`): one per project, shown as a 3×14px mark. A folder with its own colour keeps it; otherwise one is picked from its id, the same every time. On the rail they take their dark-theme halves, because they sit on ink in both themes.

### Neutral
- **Cream Ground** (`cream-ground`): the page.
- **Deeper Cream** (`deeper-cream`): side panels (Closed by the agent, Waiting on customers), so the ground has something against it.
- **Recessed Cream** (`recessed-cream`): a button's hover fill, code wells, tags.
- **Field White** (`field-white`): inputs and menus, the one near-white surface.
- **Muted Ink** (`muted-ink`): second lines, column labels, meta.
- **Hairline** (`hairline`): the rule between register rows and panel rows.
- **Rule** (`rule`): a panel's or a button's 1px edge.
- **Rail Ink / On Rail / On Rail Muted** (`rail-ink`, `on-rail`, `on-rail-muted`): the sidebar. Current and hover rows are white at 11% and 6% over the rail; its foot is divided by white at 10%.
- **Status** (`ok`, `warn`, `danger`, `danger-soft`): meaning only. A load failure is a danger-bordered danger-soft callout; a standing notice is a warn dot on a hairline row.

### Named Rules
**The Active Rule.** Coral in the hub says "this is active": where you are, what you chose, the one action to press (2026-10-30, the author's call: white as the active state in dark mode said nothing). A change since you last looked is ink (`--changed`; on-rail cream on the rail): the left-edge bar, the "Changed" label and the rail dot, cleared when the work is opened or marked seen.

**The Line Colour Rule.** A project's colour is one of six and never coral or near it; a folder someone coloured coral is drawn stone, and the folder colour picker does not offer coral.

**The Ink Focus Rule.** Keyboard focus is a 2px ink ring at a 2px offset (on the rail, the same ring in on-rail cream). A focused field takes an ink border and a 3px ink halo at 14%. Both are `--focus` and `--focus-halo`, which the root defines as coral for the landing and `.hub-app` redefines as ink.

**The Chosen Rule.** A thing someone picked is coral: a chosen chip or tile is an `--accent` fill with `--accent-fg` text (`--primary`), a checked checkbox or radio is coral (`--chosen`), the current tab is a 2px coral bar (under it in a tab row, beside it in a side list). A selected or drop-target card keeps its 2px ink ring and a menu's chosen item its ink check.

## Typography

**Display Font:** none in the hub.
**Body Font:** Onest (with ui-sans-serif, system-ui)
**Label/Mono Font:** JetBrains Mono, for ids, tags and commands

**Character:** One soft grotesque at low weights carries every heading, label and row; the mono marks what a machine wrote. The hub maps `--font-serif` to the sans, so nothing in the app falls back into Newsreader.

### Hierarchy
- **Headline** (500, 1.5rem, 1.3): a page's heading ("Needs you"), with a one-line muted summary under it.
- **Title** (500, 1.125rem, 1.4): an empty state's statement ("Nothing needs you.").
- **Row title** (500, 0.875rem): a register row's link; a panel heading is the same size at 550.
- **Body** (400, 0.875rem, 1.25rem): rail items, summaries, quoted customer words.
- **Meta** (400, 0.8125rem, tabular figures): ages, counts, "by agent-dev1", "Changed · …".
- **Label** (500, 0.6875rem, 0.05em, uppercase): column headers over a register and the rail's Projects group. Labels name a column or a group; they never sit above a heading as a kicker.

### Named Rules
**The Tabular Column Rule.** A count or an age that stands in a column (12m, 5h, 3d, 6w) takes `tabular-nums`; prose keeps proportional figures.

**The No Serif Rule.** No serif anywhere in the app chrome. Weight stays at or below 550.

## Layout

A two-column shell: the 240px ink rail is sticky and full height from 768px up; below that the places (Needs you with its count, Projects, New, Work, Support) are a 56px solid ink dock fixed along the bottom, as in a phone app — each a 28px mark holder over a `text-xs` label, the current one coral at 500 with a 2px coral bar along its top edge, New's holder filled coral — and the rest of the rail is a drawer behind a 56px top bar holding the menu and the mark. `--dock` (its height plus the safe-area inset, 0 from 768px) is what toasts, the bulk bar and a conversation's composer stand clear of. The page's measure depends on what it holds: Needs you reads at 78rem, project, guide, support (the register and a request) and settings pages at 70rem, the board takes the full width, everything else 54rem.

Needs you is a register beside a side column (18rem from 1280px up). The register becomes a five-column grid when its own container passes 42rem: work, project (8.5rem), with (8rem), waiting (3.5rem, right-aligned), action (4.75rem). Below that each row wraps into a title, its second line, and a single muted fact line separated by middots.

Spacing is the 4px scale and the relationship picks the step: 8px between a label and its control, 12px between rows, 16px between blocks, 32px between sections, 12px of vertical padding inside a register row with 16px on its left for the change mark.

## Elevation & Depth

The hub is flat. A raised surface's edge is a one-pixel ring in the stronger rule colour, and side panels are a deeper cream with a 1px hairline border. The only shadow is the lift under a floating menu, because it sits over the page.

### Shadow Vocabulary
- **Edge** (`box-shadow: 0 0 0 1px var(--line-strong)`; hover `#cbbcab` light, `#57524b` dark): the edge of a card-like surface.
- **Menu lift** (`box-shadow: 0 0 0 1px var(--edge-ring), 0 6px 24px rgb(0 0 0 / 0.05)`): menus and popovers only.

### Named Rules
**The Hairline Rule.** Structure is drawn with 1px rules: ink over a register or under a panel's heading, hairline between rows. No in-page surface carries a soft shadow.

## Shapes

Square-ish throughout: 2px for a rail item or a small control, 3px for a field or a callout, 4px for a panel and every button (the hub redefines the pill radius as 4px, so no control is a pill). The project mark is a 3×14px bar at 1px. The only round shapes are dots: the change dot and a status dot.

## Components

### Buttons
Precise and quiet; the shape says "control" by its edge, not its roundness.
- **Shape:** 4px corners.
- **Default (ghost):** transparent with a 1px rule edge, ink text, 40px tall with 20px sides; `sm` is 32px with 14px sides and is the size inside a row.
- **Primary:** coral fill (`--accent`), `--accent-fg` text; one per view. Hover drops to 90% opacity, press to 80%.
- **Rail New:** coral fill, rail-ink text, on the rail and in the phone dock.
- **States:** every button presses to `scale(0.96)` over 0.15s; outline danger for a retry inside a danger callout. A tonal or outline button with no status tone is ink (`--emphasis`). Focus is the 2px ink ring.

### Chosen chips
Coral fill (`--accent`), `--accent-fg` text, 4px corners; unchosen is a 1px hairline edge with muted text. Used for an app picked in Connections, the people picked for a group and where work comes from in Integrations.

### Shown-once callout
A secret the server cannot give back (a new token, a client secret, an admin's credentials) sits in a deeper-cream box with a 1px ink border, and the "Copy it now" line is ink at 500.

### Inputs / Fields
- **Style:** field-white fill, 1px rule border, 3px corners, 40px tall (32px inside a row's inline form).
- **Focus:** an ink border and a 3px ink halo at 14% (`--focus`, `--focus-halo`); see the Ink Focus Rule.

### Navigation
The rail: the Passalong mark and name, Go to (⌘K), Needs you with its count, the Projects group (each with its line mark, an unseen-change dot when something changed, and its open count), Work, Support, New, then Settings and the account below a white-10% rule. Items are 32px rows at 14px; the current one is coral text at 500 over white 11%, the rest on-rail-muted until hovered (white 6%).

### Register row
The signature list. Column labels once over the top, an ink rule under them, hairlines between rows. Each row: the title as a link, an optional "Changed · what" in ink at 500, a second muted line (a state such as "Went quiet" in ink, then the customer's own words in quotes), the project with its mark (or "Not in a project" in muted), who it is with, how long it has waited, and one verb (Reply, Answer, Open).

### Work board
Four columns, people inside, and never a sideways scroll. Draft, To do, In progress and Done sit
side by side once the board's own container passes 44rem — a 1024px window — in equal columns
16px apart, and from 60rem at 4fr · 5fr · 5fr · 4fr, 24px apart; below 44rem they stack as
sections 40px apart, and under 768px they are one column at a time under a row of tabs. Each
column is a heading at 550 with a muted tabular count over an ink rule, like a register's head,
and the head is sticky on the cream ground so the four names stay in view while To do scrolls;
there are no column boxes. Inside To do, work is grouped under who it is for — You, each person,
each group, Anyone — each group named by an uppercase label over a hairline; You leads, its label
in ink at 550 over an ink rule, because being named outranks being in the room. Each group shows three
cards and a quiet "N more in <group>" link that opens the rest in place ("Show fewer" closes them);
You is always shown in full, and the label keeps the whole count. Cards stack 4px apart inside a
group and 8px apart elsewhere, with groups 12px apart; in the stacked layout they run two to a row
from a 28rem board. In progress never cuts a holder's name: the line wraps, and in a column
narrower than the 60rem board's the progress note is the part left out.

A card is deeper cream at 3px corners with the Edge ring and 8px of vertical padding, as short as
a title and one fact line allow (a 24px menu button sets the first line): the title at 500 (the whole card opens it), then "Changed · <what>" in ink
at 500 with the 3px ink bar at its left edge, then the project's 3×14 mark and name — or "Not in a
project" in muted, the one phrase the hub uses for work in no project — with the age
right-aligned in tabular figures. In progress adds one
muted line — a state word in ink at 500 when the hold needs somebody ("Went quiet", "Waiting on
you"), who holds it ("Bola, an agent"), and their last note in quotes. Done cards are quiet: the
title muted, "Finished" or "Archived" beside the project unless the change label already says it.
The card's controls are a 28px ghost menu button (the "more" glyph) at its top right — the menu is
the keyboard's way to every drag — and, before it, a quiet tick that takes no room until hover,
focus or any card being ticked (always shown on touch). A ticked card has the 2px ink ring.

The bulk bar floats over the foot of the page once a card is ticked, taking no room before: ink,
flat, 4px corners, a 1px ink edge and no shadow. It says "3 pieces of work selected" and offers
Give to…, Move to… and Archive N… as ghost buttons in on-ink with a white-25% edge, and Clear as a
link. A choice opens a second row under a white-15% rule (the people and groups, or To do and
Draft with how many each applies to); every act then asks in that row ("Archive 3 pieces of work?
They go to Done; nothing is deleted.") with the act as a cream button and Keep them. Escape steps
back, then clears. What happened is said in the live region, and the board reloads.

Dragging: the column or group a card can go to takes a 2px ink outline, the ones it cannot fade to
50%, and the dragged card fades to 60% where it was; a moved card stays faded until the board has
reloaded, then settles into its new place with a 200ms rise (none under reduced motion). A question before an act (stop an agent, why to reopen) is a hairline-ruled strip above
the board. Above it all: the heading with its summary line ("13 to do · 1 in progress · 2 changed
since you last looked"), then the project picker, Only mine and the search on one line. Empty
board: "Nothing on the board" at the title size over an ink rule, a line saying what will show,
and New work; a filter that leaves nothing names itself ("Nothing in Billing app") with Clear
filter; an empty column says so in one muted line.

### Support register
The Needs you register with a customer's columns: Customer (name, the tracking number muted under
it) 10rem, Request (the title at 500 as the row's link, the customer's latest words in quotes under
it), Project 8rem, State 8.5rem, Waiting 3.5rem right-aligned. The state is a word, ink at 500 when
the next word is ours (New, Needs reply) and muted otherwise. The waiting age is ink at 500 in
tabular figures, as on Needs you; no colour marks a long wait — the summary line counts it ("10
waiting on us, all for more than 4 hours"); the request's header shows the age alone. Tabs over
it (Waiting on us, With development, Waiting on them, Solved, All) carry their counts; on a phone
the tab row scrolls sideways and fades at its right edge to say it continues. The search sits
beside the heading. On a phone each row is the name with the age at its right, the
title, the quote and one muted fact line.

### Conversation
A customer request reads like Front: the thread is the page, the reply box is pinned to the
window's foot (sticky, cream ground, a hairline above), and the facts are a side panel (17rem from
1024px, 19rem from 1280px, sticky; under the thread on a phone). Each message is a block up to
40rem, every one on the same left edge and width, as in Front: a header line — who said it at 500
(the customer's name, or "You", or the teammate's name), "customer" or "to Kemi Ade" muted, and an
exact time ("Oct 28, 08:34 PM") right-aligned in tabular figures — over a 1px-ruled, 4px-cornered
body: field white with the stronger rule for the customer, deeper cream for ours. The fill and the
header carry the speaker, not a side. Pictures are drawn inside the body; a picture whose file is
gone is a muted line ("invoice-fixed.png · no longer available"); files are `sm` buttons under the
body, at its left ("INV-1042.pdf Download"). The page opens on the latest message, its foot the reply box's height above the bottom of
whatever scrolls (the window on a phone), placed again while the editor and pictures settle; the
page's scroll-padding-bottom is the box's height; it returns there after a send. After Send or Mark solved it offers "Next waiting · <name>": the request waiting on us
longest, one at a time. The reply box is the TipTap writer at 0.9375rem, 6rem
tall and scrolling inside itself past 40vh, with Picture and Draft again as ghost `sm` buttons and
**Send** as the one primary. The agent's draft arrives in it when the next word is ours, and the
line under it says "**Drafted by the agent** from the conversation…" until someone changes a word.
The panel's facts are uppercase labels over values, divided by hairlines: Customer, Project (with
Move…), On it / For (with Give to…; "Went quiet ·" in ink when the hold lapsed), Work made from it
(live rows with the change mark), The work, then Mark solved or Reopen at the foot. Each act opens
in place under its fact as a menu surface set static in the panel; a refusal is said there.

### The box
"What do you need?" (`/hub/new`) is a writing surface at the 70rem measure: the heading with one
muted line, then the editor as the page's centre — the TipTap writer in its field-white well,
20rem tall from 1024px (11rem on a phone), Picture, @ Person and # Group as borderless ghost `sm`
buttons inside its foot (a picture mark, `@` and `#`; below 640px the marks alone, the words kept
for screen readers, so the foot stays one row) and **File it** as the one primary at its right with
the shortcut beside it in muted text ("⌘ Enter", "Ctrl Enter" elsewhere). While it is empty, starter lines sit under it as
quiet underlined words after "Start from", middot-separated, never pills. A team picker sits beside
the heading only for someone in several teams. Beside the editor (19rem from 1024px, sticky; under
it on a phone) the agent's reading is a side panel, not a chat: "The agent will file" at 550 over an
ink rule with its state at the right in muted text (Waiting for you, Reading…, Ready to file, Not
sure, Filing…), then uppercase-labelled facts divided by hairlines — Work (the title at 500 and its
tag as a quiet outlined label), Project (the 3×14 mark and name, or "Not in a project"), For (the
group, a person, or "Everyone in <team>" — the one phrase for the whole team on every line of the
box, as Give to says it — with the reason muted under it), Worth checking (a warn dot and the
question) when unsure, Kept as it came, and Looks like: work already on the board, each a link over
one muted fact line in register form (the project's mark and name or "Not in a project", who holds
it or its state, its age in tabular figures), so two works with one title are told apart. Under
1024px the panel falls below the fold, so the editor's foot carries its reading in one muted line
above the buttons (state · title · project) before File it.
Before there is anything to read each fact says what will appear there in muted text. Values fade
to 60% while a new reading is on its way. With no reader on the server the panel says "Writing it
down here isn't set up" and File it is disabled. A refusal is the danger callout under the editor
with Try again.

Filed, the page becomes a confirmation in place: "Filed:" muted before the title at the headline
size, the tag beside it, the summary under it, an ink rule, then Project · For · Why as labelled
values in a row, Worth checking on hairlines when unsure, and Open it (primary), Write another and
Move…, then a hairline divider and Undo as a borderless muted `sm` control at the end — the quiet
reversal, not a peer of Move. The confirmation settles in (the 200ms `settle` rise, none under
reduced motion) and the new filing settles into the top of the register below. Move… opens two static menus side by side: the team's
projects with a check on the current one and "Not in a project" under a menu rule, and the Give to
list. Undo deletes it in one press and puts the words back in the editor with one muted line saying
only what holds: "Undone: it's deleted. Your words are still here.", and, when someone may already
have heard, "2 people may already have been told by email or on their phone." Below everything, "Filed from here by you" is a short register — Work, Project 9rem, For 9rem,
Filed 3.5rem right-aligned in tabular figures — collapsing on a phone like every register.

### Settings
Settings (`/hub/settings/[[tab]]`, 70rem) is "Settings" at the headline size over one muted line of
facts for the page in view ("Ada Lovelace · @ada", "Free plan · 19 of 25 pieces of work used"), then
the five pages — Account, Plan, Teams, Agents, Integrations — as the world's Tabs, each its own
address. A tab with something broken carries a 6px warn or danger dot instead of a count; Plan and
Teams carry a muted tabular fact. The page's "Needs you" items lead it as standing notices: a status
dot, the sentence, where it is muted, and one `sm` verb, on hairline rows.

Each block is a section title at 550 (1rem; 0.875rem for a block inside a team) over the block's one
ink rule, an optional action at the rule's right ("Connect an app", "New token", "Copy invite
link"), one muted line saying what it is for, then labelled rows: the label at 500 with a muted hint
under it in a 13rem column on the left and the control on the right, 32px apart, rows divided by
hairlines; stacked under 768px. A register inside a block names its columns once in uppercase
labels over a hairline, not an ink rule — one ink rule per block — and wraps into a title, a muted
fact line and its verbs in a container under 42rem. A team is its name at the title size with a
muted fact line ("You're an admin · 4 people · 12 pieces of work") over its blocks (Members,
Groups, Channels, Plan), 48px between teams. A plan is facts, never a badge: Plan (and the "Test
mode · no real money is charged" label, 1px warn edge, 2px corners, when the key is a sandbox one),
Seats or Work used, Ends on, and Billing with the one primary action; for anyone who cannot change
it, a line naming who can. Every destructive act — revoke, disconnect, remove, leave, turn off —
is a quiet `sm` control ending in "…" that opens a line under its row naming what breaks and what
stays, with the act in outline danger and Keep it. A register leads its block and how to add another sits under it (the connect sheet under connected apps, its client-ID form a hairline-divided region opened by a drawn `reveal` chevron, never a box in a box). Dates in a register are dates ("29 Oct", the year when not this one); a fact is said once on a page. A new secret is the Shown-once callout. Choices
among a few (where work comes from) are chosen chips. Loading is the skeleton, a failed load is the
danger callout with Try again, and an empty register says what will appear and how.

### Setup
First-run setup (`/hub/start`, 70rem) is a calm page, never a modal: "Set up <team>" at the headline
size over one muted line ("2 of 7 done · skip anything, it's saved as you go") with **Finish later**
as a muted link at its right, then a 13rem step rail beside a 44rem step column. The rail is an
ordered side list over a 1px hairline at its left edge: each step a 32px row with its number in muted
tabular figures, or an ink check once done; the current step is ink at 500 with the 2px ink bar
beside it (the Chosen Rule); a skipped step adds "Skipped" in muted text. Under 768px the rail is a
row of 40px steps over a hairline that scrolls sideways, snapping each step to its left edge, fading
out at its right edge so no step reads as a fragment, the bar under the current step, which is kept
in view. Each step is its name at the title size, one muted line saying why, its controls (fields,
settings rows, a register of what is already made with ink checks), then a hairline and **Continue**
as the one primary with **Skip** beside it. Continue is the step's act and is disabled until there is
something to act on; on the last step it says **Finish**, or **Finish without an agent** when nothing
can act as the person yet. Skipping what someone typed asks in place, in that same strip ("Skip and
lose what you wrote for Website?", **Skip and lose it** in outline danger, **Keep writing**). A
project row's 3×14 mark appears as soon as it has a name, in the tone it keeps. Choosing who is in a
group is a row of toggle chips (`aria-pressed`, ink when chosen). Per project, what to know is a block
divided by hairlines: the 3×14 mark and name, then either the sentence for the person's agent in a
field-white well with Copy as a flush `sm` button at its right, or two chosen chips (Answer three
questions, Paste what you have) over full-width answers that grow with what is typed (no resize
handle). A field for a machine string (a repo, an invite link) shows its value in mono and its hint in
the sans. The inbound addresses wrap only between their parts, after each `+` and before the `@`.
On Needs you, setup is the seven steps as a short register in two columns over hairlines: done steps
in ink with a check and what they made where cheap ("Your team · Northwind", "2 projects"), steps
left as muted links with an open mark. Its heading is "You're set up." only when nothing is left, and
"Finish setting up" with how many steps are left otherwise, with Continue setup and Dismiss as `sm`
buttons. No celebration, no progress bar, no coral.

### Back link
A page reached from a list leads with a muted link back to it ("Support", "Work", "All
documents") behind the drawn back arrow (`AppIcon` `back`, 14px at the icon set's 1.75 stroke),
never a "←" glyph.

### Tabs
A page with several views of one thing (a project's Documents, Work and History) is a row of links,
each its own address (`?tab=`), over a hairline: the current one is ink at 500 with a 2px coral bar
under it, the rest muted until hovered. A count beside a tab is muted, tabular. Never a pill group.

### Change mark
A 3px ink bar the full height of a row at its left edge (on-rail cream on the rail), with the label "Changed · <what>" in ink at 500 beside the title: what changed on work ("Changed · Finished"), on a document ("Changed · version 3 by Bola"), in a project ("Changed · Pricing"). One wording everywhere; never "New" or "Changed" alone. Used in the register and in side-panel rows; persists until that thing is opened. Whether something changed is always the server's answer (unread notifications for work, `folder_document_seen` for documents), never kept in the browser.

### Danger
A destructive control is never a peer of the everyday ones. It sits alone at the foot of the form that edits the thing (a project's Delete at the foot of Edit), or in a row's own place for a row (a file's Delete), outline danger, and pressing it asks in place: a line naming what goes and what stays ("Delete Billing app and its 3 documents and 1 file? Work in it is kept."), then Delete and Keep it. The same holds for every question the hub asks before an act: stopping an agent or reopening finished work (a strip above the board when a card is dragged out of In progress or Done), stopping sharing, discarding edits, loading a newer version over yours. No browser `confirm()` anywhere in the hub.

### Document editor
A project document is edited as it reads: a rich-text field (TipTap, `components/hub/DocEditor.vue`) in a field-white well with a 1px edge, Onest at 0.9375rem/1.65, headings on the document scale (h1 1.125rem/500, h2 1rem/550, h3 0.875rem/550), mono only inside code. Above it, one hairline-ruled toolbar of plain words (Heading, Subheading, Bold, Italic, List, Numbered, Quote, Code); a pressed tool is ink. "Markdown" at the toolbar's end switches to the source for those who want it, off by default; a document the editor cannot hold faithfully (a table, a task list, HTML) opens as Markdown with one line saying why. The server keeps Markdown either way (`utils/doc-markdown.ts`).

### README panel
A project's Documents tab opens on its README in a deeper-cream panel under a "README" heading over an ink rule, with its last edit and Open. Only the opening section shows, up to the first second-level heading, with "Read all" for the rest, so the documents register below is in the first screen. A document's headings sit below the page's: h1 1.125rem/500 (dropped when it repeats the project's name), h2 1rem/550, h3 0.875rem/550.

### Who did it
A person is named plainly ("by Bola"); an agent is named with what it is ("by Bola, an agent"). Unknown provenance is named plainly too, never guessed, and "(person)" is never written.

### Side panel
Deeper cream, 4px corners, 1px hairline border, 12px 16px padding; a 14px heading at 550 over an ink rule; rows divided by hairlines, the last without one. Each closed item carries its age and a small Reopen that opens an inline reason field.

## Do's and Don'ts

### Do:
- **Do** use coral for what is active: the current place on the rail and the dock, the current tab's bar, a chosen chip or checkbox, the primary button and New.
- **Do** show a project by its 3×14px line mark in one of the six tones, wherever it is named.
- **Do** draw structure with 1px rules: ink over a list's head, hairline between rows.
- **Do** keep corners at 2, 3 or 4px; only dots are round.
- **Do** set ages and counts in a column with tabular figures, in the one unit that reads at a glance (12m, 5h, 3d, 6w).
- **Do** give a row one verb, at `sm` size, in its last column.
- **Do** draw focus, a change mark and an emphasised link in ink.

### Don't:
- **Don't** use coral for a change since you last looked (that is ink), a project, a focus ring, a link, a progress fill or an emphasis; and never as small text on cream, where `--coral` is 2.6:1 — a coral fill takes `--accent` with `--accent-fg` text.
- **Don't** give an in-page surface a soft shadow; only floating menus lift.
- **Don't** use pill shapes or 24px card corners in the hub; those belong to the landing and share pages.
- **Don't** set any hub text in the serif, or a heading above 550.
- **Don't** put an uppercase label above a heading as a kicker; uppercase labels head columns and groups only.
- **Don't** build a page of counter tiles; the count lives in the heading's summary line and beside the rail item.
