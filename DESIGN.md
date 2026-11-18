# Passalong hub design

The look of the signed-in hub (`/hub`, `apps/web`), decided one question at a time. Every entry
says what was chosen, the exact values, and what was rejected. The landing, the share pages and
the prose pages keep their own `:root` tokens; this file is about `.hub-app`. The rules in
`AGENTS.md` under Contracts still hold; where this file and a rule there say the same thing, both
are kept true together.

Status: **all eleven locked, 2026-11-18,** and built into the hub the same day. Decided by the
person who runs Passalong, one board at a time; the boards were drawn from the hub's real work. A
later change to the look changes this file, the code and the matching AGENTS.md rule together.
Toasts keep their coloured dot for the kind of news rather than a status icon.

## 1. Colour (locked)

Kept as it is: white sheets, ink words, coral for what is active, a matte black rail.

| Token | Light | Dark |
|---|---|---|
| `--bg` page | `#ffffff` | `#191816` |
| `--surface-raised` card, panel | `#ffffff` | `#23211e` |
| `--surface` recessed (chip, code, hovered row) | `#f4f4f3` | `#2c2a26` |
| `--lane` board column | `#f4f4f3` | `#1e1d1a` |
| `--fg` ink | `#252522` | `#f4efe9` |
| `--muted` secondary text | `#6e6c68` | `#a39f98` |
| `--line` | `#ececea` | `#33302c` |
| `--line-strong` the one-pixel rule | `#dcdbd7` | `#45413c` |
| `--accent` coral, active | `#b8481f` | `#f2805d` |
| `--accent-fg` text on coral | `#ffffff` | `#1a1410` |
| `--coral` mark only, never text | `#f2805d` | `#f2805d` |
| `--rail` | `#141414` | `#141414` |
| `--on-rail` / `--on-rail-muted` | `#f4efe9` / `#aaa59d` | `#f4efe9` / `#9d988f` |

- **Coral means active**: the current place on the rail and dock, New, the one primary button,
  a chosen chip, a checked control, the current tab's 2px bar. Nothing else is coral.
- **Ink means changed**: a 6px ink dot before the "Changed · what" line (12px/500, `--fg`).
  No left bar on cards or rows any more (2026-11-18). Focus is a 2px ink ring.
- **Project colours** (a 3px line, never a fill): amber `#b07a12`, green `#3f7d52`, blue
  `#3e6fa6`, violet `#7a5bb0`, teal `#2f8582`, stone `#7b6e5f` (dark halves in `styles.css`).
  Nothing near coral or blue-as-link.
- **Status colours** — ok `#3a7a2a`, warn `#86750f`, danger `#b8322a` (dark `#7fcf6a`,
  `#d6c530`, `#ef7a6c`) — appear only as words and icons: "Went quiet", a failed check, a
  danger action. No tinted row, card or banner fills for status.
- **Dark mode** stays: it follows the system, Settings overrides it, warm layered browns as above.

Rejected: ink only (coral leaves the hub); coral as a mark only with ink buttons; a dark ground by
default.

## 2. Typography (locked)

Kept as it is: three faces, each with one job (2026-11-08).

- **Geist** (variable, self-hosted, `font-feature-settings: "rlig" 1, "calt" 0, "ss11" 1`): all
  chrome, meaning navigation, buttons, labels, rows, cards, titles of work and pages.
- **Newsreader** (variable, with its italic): only what is read as writing — a work's document
  (in the share page's iframe) and a project's documents, reading or editing, at 18px.
- **Geist Mono**: only the machine's words — ids, commands, code, paths, repo names. Never
  labels, tags, counts or headings. A handle or group (`@design-check`, `#frontend`, "the team")
  is how a person is addressed, not machine output: Geist in `--muted`, in brackets right after
  the name — "Design Check (@design-check)" — never mono and never pushed to the far right.
- Scale (hub): page title 24px/600, section 18px/600, UI body and labels 14px (400, 500 for a
  card title or button), caption and meta 13px, register column label 11px/500 uppercase at
  `0.05em`. Reading text 18px Newsreader at line-height 1.6.
- Counts, ages and anything in a column take `font-variant-numeric: tabular-nums`; prose keeps
  proportional figures.

Rejected: system SF Pro; Newsreader for work titles and headings too; the IBM Plex family.

## 3. Layout (locked)

Kept as it is.

- **Work board** (`/hub/work`): the rail, then four columns — Draft, Ready, In progress, Done —
  that always fit the page and never scroll sideways. Inside Ready, groups by who it is for: you,
  each teammate, each group, then Anyone. **By person** (`?by=person`) is the opt-in that scrolls.
- A card opens the full work page (`/hub/w/:id`); nothing opens beside the board.
- **Header**: page title left; filters right (project, Only mine, By person).
- **Actions sit with the work**: under its title on the work page, one primary act for its
  state, at most one beside it, the rest under **More**. Not in a sticky footer, not top-right.
- **Navigation**: the matte rail on desktop (places, then projects with their colour lines, New
  in coral) and a bottom dock below `md` (48rem). The rail is not collapsible.
- States each screen must also show: empty (what to do first, never a blank column), loading
  (skeletons in the shape of the rows), failed (what went wrong in words, and a retry).

Rejected: board with a side panel for the opened work; a register grouped by stage with a side
panel; Needs you as one "Next first" column replacing the board.

## 4. Shape (locked)

Soft: larger corners and a faint lift under cards. **This changes the hub as built** (today 6/8/12
and a ring with no shadow) and the AGENTS.md rules "A surface's edge is a one-pixel rule" and
the radii under "Coral is active"; update both when it is built.

| Element | Radius |
|---|---|
| Button, field, chip, filter, menu item (`--r-1`, `--r-pill`) | 8px |
| Tag (`bug`, `feature`), code span | 6px |
| Card, row inside a list (`--r-2`) | 12px |
| Panel, dialog, drawer, menu, board lane (`--r-3`) | 16px |

- **No pills.** Nothing is 999px except a dot and a face.
- **Edge**: a raised surface (card, panel, menu, dialog) keeps a 1px ring of `#e2e1dd`
  (dark `#45413c`) and adds `0 1px 2px rgba(0,0,0,.06)` (dark `0 1px 2px rgba(0,0,0,.4)`).
  Recessed things (chip, code, hovered row) are fill only, no ring, no shadow.
- **What floats** (menu, toast, the thread drawer, a dialog) adds the lift
  `0 6px 24px rgba(0,0,0,.08)` (dialog `0 12px 40px rgba(0,0,0,.12)`) on top of the ring.
- A dragged card keeps the 2deg tilt and takes the floating lift.
- Nested surfaces nest radii: inner = outer − padding (an 8px-padded 16px menu has 8px items;
  the board lane is the exception: 16px around 12px cards with 8px of padding, close enough to
  read as one family).

Rejected: keep current (6/8/12, ring only); sharp 3/4/6px; square 0px with ink rules.

## 5. Spacing and density (locked)

Comfortable: one step roomier than the hub as built, so 12px corners have room around them.

- **Scale**: 4px base, `--s-1`..`--s-9` = 4, 8, 12, 16, 24, 32, 48, 64, 96px. No half-steps
  (6, 10, 14px) except 2px inside a chip.
- **Board**: 12px between sibling cards; card inset 12px on every side; lane padding 8px;
  8px between a group label (YOU, ANYONE) and its first card; 16px above the next group (twice
  the card gap or more).
- **Controls**: full height 40px (`--control-h`), small 36px (`--control-h-sm`, was 32px); side
  padding 20px full, 16px small. A button beside a field is full height.
- **Register lists** (Needs you, Settings, project lists): rows flush, a 1px `--line` rule
  between them, 12px vertical / 12px horizontal row padding, hover and selected fills stop at the
  rule and round only the list's own outer corners.
- **Menus**: 8px menu padding, 2px between items, items 8px corners — tighter than content.
- **Panels and cards that hold blocks**: 16px padding; 16px between blocks in a column; 32px
  between sections; 8px between a label and its control.

Rejected: compact (4px gap, 28px controls); keep current (8px gap, 8px inset, 32px small
controls); airy (16px gap and inset). Rows with a gap between them in registers.

## 6. Icons (locked)

Tabler outline (MIT), replacing the hand-drawn set in `AppIcon.vue`.

- **Shipped as inline SVG paths** copied into `AppIcon.vue` (24-unit viewBox, `stroke-width` 2,
  round caps and joins, `fill="none"`, `stroke="currentColor"`). Never an icon font, a sprite
  from a CDN or a runtime loader: the CSP refuses them and share pages run no script.
- **Weight**: outline everywhere. A `-filled` Tabler variant only for a chosen state that has
  no other mark (for example a pinned project); never for decoration.
- **Sizes**: 16px in buttons, rows, menus and state lines; 20px on the rail and the phone dock.
  Colour always from `currentColor`.
- **Where icons appear**: the rail and dock (each place), menu items (card menu, More), state
  lines (asking, went quiet, archived) and icon-only buttons (more, close, copy, reveal), which
  carry an `aria-label`. Text buttons ("I'll do this", "Finish", "Copy the command for an agent")
  stay words only.
- **Names** (Tabler): more `dots`, done `check`, New `plus`, copy `copy`, open
  `external-link`, reveal `chevron-down` (turns over when open), close `x`, Needs you `inbox`,
  Work `layout-kanban`, project `folder`, Settings `settings`, Give to… `arrow-right`, Archive
  `archive`, attach `paperclip`, search `search`, filter `filter`, asking `message-question`,
  went quiet `clock-exclamation`, Stop this agent `player-stop`, back `arrow-left`, appearance
  `device-desktop` / `sun` / `moon`, rail fold `layout-sidebar`, menu `menu-2`.

Rejected: keep the hand-drawn set; Lucide; Phosphor.

## 7. Signature element (locked: none for now)

Deliberately left without a signature (2026-11-18). The hub's existing marks keep their meaning —
coral for active, the ink changed dot, project colour lines — and nothing new is added to be
recognisable until a direction is chosen.

Rejected: the proof receipt (perforated ink edge and an outlined FINISHED stamp on finished
work); the relay (round faces for people, square ink faces for agents, a line from sender to
holder, a coral dot while an agent works); both together. Directions not yet tried: a mark for the
moment work moves, something only the board's cards have, an identity through type or number
style.

## 8. Motion (locked)

Alive: things move only when something arrives or happens; everything else fades.

- **One curve**: `cubic-bezier(0.2, 0, 0, 1)` (`--ease-out`). No springs, no overshoot.
- **Durations**: 150ms (`--motion`) for anything already on screen changing — hover, focus,
  colour, a menu fading in; 180ms (`--enter`) for a small thing arriving; 240ms for a card or a
  toast arriving.
- **Arrival**: a new card fades in and slides 8px down into place; a toast fades in and rises
  8px from the bottom; a line on the thread fades in and slides 6px. Nothing slides on hover.
- **Changed**: when a change arrives live, the ink dot and the "Changed · what" line fade in
  (180ms). On page load they are simply there.
- **Working**: while an agent holds work and is working, three 4px coral (`--coral`) dots pulse
  in turn (1.2s cycle, 0.15s apart, opacity 0.25 to 1). No spinner anywhere else; loading is
  skeletons.
- **Press**: every `.btn` scales to 0.96 for 100ms (a primary also drops to 80% opacity);
  `.static` opts out.
- **Drag**: the lifted card tilts 2deg with the floating lift; the drop gap opens in 150ms.
- **Reduced motion**: every animation and transition is off; the dots hold still at full
  opacity, and arrivals simply appear.

Rejected: quiet (150ms fades only, the hub as built); lively (springs, 600ms, bounce).

## 9. Voice (locked)

Guide: say what happened, then the next step, in plain words.

- **Who speaks**: nobody. The hub never says "I" or "we" and is not a character. It addresses
  the reader as "you"; people are named ("Johnmark Nanzing"), an agent is "Johnmark Nanzing's
  agent" or "your agent".
- **Shape**: a state, a refusal or an error is one or two sentences — what happened, then the
  act that fixes it, named with the button's own words. Example: "The agent on this hasn't
  reported for two hours. Stop it and give the work to someone else, or wait."
- **Empty states** say what will appear and how it gets there: "Nothing needs you. New work sent
  to you, and any agent's question, will show here first."
- **Fixed words** (never paraphrased): I'll do this, Stop this agent, Finish, Reopen, Archive,
  Unarchive to Draft, Not for me, Give to…, Move to Draft, Make it private again, Copy the
  command for an agent, Needs you, Ready, In progress, Done, Draft.
- **Tense**: past for what happened ("finished", "went quiet"), present for state ("is waiting
  on you"), imperative for the fix ("Paste a new webhook in Settings → Team channel").
- **Menus and pickers carry no footnotes** (2026-11-18, the author's call: "too much story").
  A menu lists the choices and nothing else; what an act did is said after it happens, by the
  thread line or the notification, not explained in advance.
- **Times** as a person says them: "two hours", "three days ago", "18 Nov"; never an ISO string.
- **Banned**: exclamation marks; praise and cheer ("Great job", "All caught up!", emoji);
  jargon (lease, claim, payload, sync, status codes like 403) — say what it means; "sorry" and
  "please".
- **Outside the UI**: the server's sentences are hub copy too. A notification to one person (feed,
  toast, push) is `told()` in `notify.ts`: what happened (`line()`), then the next step from
  `NEXT` — "Reply and it carries on.", "Stop this agent and give it to someone else, or wait."
  The team channel, the log and mail subjects say only what happened, since "you" there is
  anyone. Refusals end in the fix ("This project has 100 files already. Delete one to add
  another."); `proofProblem()` is written for agents and keeps its own instructions.

Rejected: keep current (plain and short, often without the next step); a teammate speaking as
"I"; terse log fragments.

## 10. Imagery (locked)

Thumbnails: screenshots in proof (Finished with), the thread and replies sit in a row of small
pictures, and a click opens them large.

- **Thumbnail**: 150px wide, 94px tall, `object-fit: cover` from the top of the image, 8px
  corners, a hairline of `--image-edge` (black or white at 10%), no shadow. 8px between
  thumbnails; they wrap onto a second row.
- **Caption** under each, 12px `--muted`: the name the writer gave it (the `![name](…)` alt
  text). No name, no caption — never a guessed or generated one. No page address is shown: the
  server does not store one with a shot.
- **Large view**: an in-page viewer — a dark overlay (`#141414` at 92%), the whole image at its
  own size up to the viewport, its caption and "n of m" below, arrow keys (and ←/→) between the
  shots of the same proof or message, Open in a tab and Close; Esc or a click outside closes. It
  fades in at 150ms; no zoom animation.
- **Only our own pictures are drawn** (`/v1/shots/<id>`, through `evidenceParts`); any other
  image address stays text, as now.
- **No image**: nothing is drawn — no empty frame or placeholder.
- **Share pages** (`/w/**`) run no script, so the viewer is hub-only; there the thumbnail links
  to the image itself.

Rejected: keep current (full width as sent); a browser frame with the page address; a zoomed crop
with "See the whole screen".

## 11. Components (locked)

The sheet that puts every answer above together. Two calls made on it (2026-11-18): **every
button is a shiny key**, and **no ink borders on cards and rows** — the 3px changed bar and the
2px ink ring for a selected card or row are gone.

- **Buttons are keys**, as `.btn.primary` is drawn now: a fill a shade lighter at the top
  (`linear-gradient(to bottom, color-mix(in oklab, var(--primary) 88%, white), var(--primary))`),
  an edge a shade darker (`color-mix(in oklab, var(--primary) 92%, black)`), a 1px inner
  highlight at the top (`inset 0 1px 0` white at 28%) and `0 1px 2px rgba(0,0,0,.16)` under it.
  Hover lightens both stops (82% / 94% white mix); pressed is 0.96 scale at 80% opacity;
  disabled 55% opacity.
  - Primary: coral key, white text. **One per view.**
  - Secondary: a white key — `linear-gradient(to bottom, #fff, #f7f7f6)`, 1px `#dcdbd7` edge,
    a white inner highlight, `0 1px 2px rgba(0,0,0,.08)`. Not tonal grey (grey is for recessed
    things).
  - Plain: words in `--muted`, no key (for **More** beside a row of keys).
  - Danger: a white key with `--danger` words, only for what cannot be undone (Delete).
    Archive is reversible and stays a plain menu item or secondary key.
  - Icon-only: a square white key (36px), Tabler icon at 16px, `aria-label` always.
- **Filters** (All projects, Only mine, By person) are small keys; the chosen one is the coral key.
- **Fields**: 40px, 8px corners, 1px `--line-strong` edge, white; focus is an ink edge plus a 3px
  ink halo at 14%. No key treatment.
- **States** are icon + word, coloured by status (section 1), never a chip or fill: "Your agent
  is on it" (coral dots), "Waiting on you" (`message-question`, warn), "Went quiet · two hours"
  (`clock-exclamation`, warn), "Finished · 18 Nov" (`check`, ok), "Archived" (`archive`, muted),
  "Check failed · <command>" (`x`, danger). The word is never dropped.
- **Board card**: white, 12px corners, ring and faint shadow (section 4), 12px inset. Title
  14px/500; then the changed line (ink dot + "Changed · what") when there is one; then the holder
  line for In progress; then project line colour + name, tag, age right-aligned in tabular
  figures. Selected (bulk) is the recessed `--surface` fill and a ticked box, no ring.
- **Register rows** (Needs you): flush, 1px `--line` between; hover and selected are the
  `--surface` fill, no border, no bar; the changed dot leads the reason line.
- **Empty state**: a quiet box (1px inner `--line`, no shadow), the state in 16px/600 and the
  next step under it in `--muted` (voice, section 9).
- **Menu**: floating (ring + lift), 16px corners, 8px padding, 8px-cornered items with Tabler icons;
  hover is the `--surface` fill; a 1px `--line` divides groups. No red items except Delete.
- **Confirm**: always this dialog, never a browser `confirm()`. 16px corners, title as a
  question ("Archive this work?"), one sentence of what happens and how to undo it, then
  "Keep it" (secondary) and the act itself (primary), right-aligned.
- **Toast**: only for something that happened off screen (another person or an agent). Floating,
  16px corners, status icon + who in 600 + what; it leaves after 7s (`TOAST_MS`, as now).

Rejected: tonal grey secondary buttons; flat (non-key) buttons; the ink 3px changed bar on cards
and rows; a 2px ink ring for selected cards and rows; red for Archive.
