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
    backgroundColor: "{colors.ink}"
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
    backgroundColor: "{colors.coral}"
    width: "3px"
---

# Design System: Passalong hub

## Overview

**Creative North Star: "The Drawing Set"**

The hub is a register of what moved and who must act. It keeps Passalong's cream ground, ink and coral, and draws them with a drawing set's discipline: a solid ink rail down the left, one-pixel rules where other products put soft cards, corners of two to four pixels, a grotesque for every piece of chrome, and figures that line up in columns. Hierarchy comes from an ink rule over a list and a deeper cream behind a panel, never from shadow or fill colour.

Coral means one thing here: changed since you last looked. It is a 3px bar at a row's left edge with a label naming what changed, and a dot beside a project on the rail, and it stays until the work is opened. Each project owns a line colour from a fixed set of six, shown as a short vertical mark wherever the project is named, so a project reads the same in the rail, in a register row and in a side panel.

This world covers every signed-in screen under `/hub`: `.hub-app` on `<body>` restates the root tokens. The landing, the blog and the share pages keep the root tokens (24px cards, pill buttons, the serif as an editorial accent) and are not part of this system.

**Key Characteristics:**
- Solid ink rail, 240px, in both themes; light-on-dark project marks on it.
- Registers, not cards: rows divided by hairlines under an ink rule, with column labels once at the top.
- Square-ish geometry (2, 3, 4px); nothing round but a dot.
- Onest for everything, JetBrains Mono for machine strings, no serif.
- Coral reserved for unseen change; six project line colours, none near coral.
- Tabular figures wherever a count or an age stands in a column.

## Colors

Warm cream and ink carry the whole interface; coral and the six project lines are marks, never fills of text blocks or buttons. Every colour except coral is a `light-dark()` pair; the frontmatter holds the light half and the sidecar holds the pair.

### Primary
- **Ink** (`ink`): text, the primary button's fill, the rule over a register or a panel heading. The highest-contrast thing on the page is the one to press.
- **Change Coral** (`coral`): the change mark (3px bar), the rail's unseen-change dot, the brand mark. At 2.6:1 on cream it is never used as text.
- **Coral Text** (`coral-text`): the same hue at a readable 5:1, for the "Changed · …" label beside a row's title.

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
**The One Meaning Rule.** Coral in the hub says "changed since you last looked" and nothing else. It appears as the left-edge bar, the "Changed" label and the rail dot, and it clears when the work is opened or marked seen.

**The Line Colour Rule.** A project's colour is one of six and never coral or near it; a folder someone coloured coral is drawn stone, and the folder colour picker does not offer coral.

**The Ink Focus Rule.** Keyboard focus is a 2px ink ring at a 2px offset (on the rail, the same ring in on-rail cream). A focused field takes an ink border and a 3px ink halo at 14%. Both are `--focus` and `--focus-halo`, which the root defines as coral for the landing and `.hub-app` redefines as ink.

**The Chosen Rule.** A thing someone picked is ink: a chosen chip or tile is an ink fill with cream text (a checkbox inside it takes the cream as its accent), a checked checkbox or radio is ink (`--chosen`), a selected or drop-target card has a 2px ink ring, the current tab is a 2px ink bar (under it in a tab row, beside it in a side list), and a menu's chosen item is an ink check.

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

A two-column shell: the 240px ink rail is sticky and full height from 768px up; below that it is a drawer over the page behind a 56px top bar holding the menu, the mark and New. The page's measure depends on what it holds: Needs you reads at 78rem, project, guide, support and settings pages at 70rem, the board takes the full width, everything else 54rem.

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

Square-ish throughout: 2px for a rail item or a small control, 3px for a field or a callout, 4px for a panel and every button (the hub redefines the pill radius as 4px, so no control is a pill). The project mark is a 3×14px bar at 1px. The only round shapes are dots: the coral change dot and a status dot.

## Components

### Buttons
Precise and quiet; the shape says "control" by its edge, not its roundness.
- **Shape:** 4px corners.
- **Default (ghost):** transparent with a 1px rule edge, ink text, 40px tall with 20px sides; `sm` is 32px with 14px sides and is the size inside a row.
- **Primary:** ink fill, cream text; one per view. Hover drops to 90% opacity, press to 80%.
- **Rail New:** the primary inverted on the rail: on-rail fill, rail-ink text.
- **States:** every button presses to `scale(0.96)` over 0.15s; outline danger for a retry inside a danger callout. A tonal or outline button with no status tone is ink (`--emphasis`). Focus is the 2px ink ring.

### Chosen chips
Ink fill, cream text, 4px corners; unchosen is a 1px hairline edge with muted text. Used for an app picked in Connections and the people picked for a group.

### Shown-once callout
A secret the server cannot give back (a new token, a client secret, an admin's credentials) sits in a deeper-cream box with a 1px ink border, and the "Copy it now" line is ink at 500.

### Inputs / Fields
- **Style:** field-white fill, 1px rule border, 3px corners, 40px tall (32px inside a row's inline form).
- **Focus:** an ink border and a 3px ink halo at 14% (`--focus`, `--focus-halo`); see the Ink Focus Rule.

### Navigation
The rail: the Passalong mark and name, Go to (⌘K), Needs you with its count, the Projects group (each with its line mark, an unseen-change dot when something changed, and its open count), Work, Support, New, then Settings and the account below a white-10% rule. Items are 32px rows at 14px; the current one is on-rail text at 500 over white 11%, the rest on-rail-muted until hovered (white 6%).

### Register row
The signature list. Column labels once over the top, an ink rule under them, hairlines between rows. Each row: the title as a link, an optional "Changed · what" in coral text, a second muted line (a state such as "Went quiet" in ink, then the customer's own words in quotes), the project with its mark (or "Not in a project" in muted), who it is with, how long it has waited, and one verb (Reply, Answer, Open).

### Work board
Four columns, people inside, and never a sideways scroll. Draft, To do, In progress and Done sit
side by side once the board's own container passes 44rem — a 1024px window — in equal columns
16px apart, and from 60rem at 4fr · 5fr · 5fr · 4fr, 24px apart; below 44rem they stack as
sections 40px apart, and under 768px they are one column at a time under a row of tabs. Each
column is a heading at 550 with a muted tabular count over an ink rule, like a register's head,
and the head is sticky on the cream ground so the four names stay in view while To do scrolls;
there are no column boxes. Inside To do, work is grouped under who it is for — You, each person,
each group, Anyone — each group named by an uppercase label over a hairline; You leads, its label
in ink at 550 over an ink rule, because being named outranks being in the room. Cards stack 8px
apart; in the stacked layout they run two to a row from a 28rem board.

A card is deeper cream at 3px corners with the Edge ring and 8px of vertical padding, the
register's density: the title at 500 (the whole card opens it), then "Changed · <what>" in coral
text with the 3px coral bar at its left edge, then the project's 3×14 mark and name — or "Not in a
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

### Tabs
A page with several views of one thing (a project's Documents, Work and History) is a row of links,
each its own address (`?tab=`), over a hairline: the current one is ink at 500 with a 2px ink bar
under it, the rest muted until hovered. A count beside a tab is muted, tabular. Never a pill group,
never coral.

### Change mark
A 3px coral bar the full height of a row at its left edge, with the label "Changed · <what>" in coral text beside the title: what changed on work ("Changed · Finished"), on a document ("Changed · version 3 by Bola"), in a project ("Changed · Pricing"). One wording everywhere; never "New" or "Changed" alone. Used in the register and in side-panel rows; persists until that thing is opened. Whether something changed is always the server's answer (unread notifications for work, `folder_document_seen` for documents), never kept in the browser.

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
- **Do** reserve coral for change since you last looked: the 3px left-edge bar, the "Changed · …" label, the rail dot.
- **Do** show a project by its 3×14px line mark in one of the six tones, wherever it is named.
- **Do** draw structure with 1px rules: ink over a list's head, hairline between rows.
- **Do** keep corners at 2, 3 or 4px; only dots are round.
- **Do** set ages and counts in a column with tabular figures, in the one unit that reads at a glance (12m, 5h, 3d, 6w).
- **Do** give a row one verb, at `sm` size, in its last column.
- **Do** draw focus, a chosen state, a current tab and an emphasised link in ink.

### Don't:
- **Don't** use coral for a project, a selected or current state, a focus ring, a link, a primary button, a progress fill or an emphasis. The one coral outside a change mark is the dot on a toast with no status colour, because a toast is news you have not looked at yet.
- **Don't** give an in-page surface a soft shadow; only floating menus lift.
- **Don't** use pill shapes or 24px card corners in the hub; those belong to the landing and share pages.
- **Don't** set any hub text in the serif, or a heading above 550.
- **Don't** put an uppercase label above a heading as a kicker; uppercase labels head columns and groups only.
- **Don't** build a page of counter tiles; the count lives in the heading's summary line and beside the rail item.
