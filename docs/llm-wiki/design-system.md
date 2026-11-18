# Design system

A warm, low-glare look: the page is a pale cream, a card is a deeper cream laid on it, and the one
near-white surface is the thing you act on. Hierarchy comes from fill, not outlines.

## Colour — ink decides, coral means changed

- **Canvas** `--bg` (#fffcfa), **field** `--field` (#fffefe) for inputs, menus and command wells.
  Dark mode is a matching warm charcoal.
- **Ink** is the primary action outside the hub, where a card is a deeper cream at 24px and every
  button is a pill. Inside it (`.hub-app` on `<body>`) corners are soft — 8px controls, 12px cards
  and rows, 16px panels — nothing but a dot is round, and a raised surface has a 1px ring with a
  faint lift under it; grey is for recessed things (chips, code, a chosen row). Every button there is
  a pressable key: the coral primary and white keys for the rest (2026-11-18, `DESIGN.md`).
- **Coral** `--coral` (#f2805d) is 2.6:1 on the canvas, so it is only ever a mark or a fill. In the
  hub it means active: the current place, New, the primary, a chosen chip, the current tab, and
  three dots while an agent works. `--accent` is the readable 5:1 fill. **Changed since you last
  looked is ink**: a dot before "Changed · what", never a bar at the edge (2026-11-18). Focus, a
  link's hover and `.linkish` are ink in the hub and coral on the landing; shared rules read
  `--focus`, `--focus-halo`, `--chosen`, `--link-hover` and `--emphasis`.
- **The whole look**, decided one question at a time with exact values and what was rejected, is
  [DESIGN.md](../../DESIGN.md) at the root.
- **The rail** (`--rail`) is solid ink in both themes. **Project colours** are six line colours
  (`--project-*`; `toneOf()` in `app/utils/projects.ts`), drawn as 3px lines, never coral or near it.
- Status colours (`--ok`, `--warn`, `--danger`) are separate from the brand and carry meaning.

- **Tints** (`.tint[data-tone]`, hub only): a stage or a project as a chip, its colour at 14% on
  the ground with its words pulled toward ink, and a faint ring of the same colour. Stages: Ready
  blue, In progress coral (active), Done green, Draft and Archived stone. A person is `.avatar`:
  two letters, their hue from their name.

## Type

- **Onest** for the interface — headings at 480 with negative tracking, never 600+. The hub uses it for everything and has no serif; counts and ages are tabular figures.
- **Newsreader** for work and document prose and the italic turn in a headline — a reading face with a real italic.
- **JetBrains Mono** for everything the machine wrote: ids, tags, commands, code.
- All three self-hosted: `font-src 'self'`.

## Spacing and shape

A 4px scale, and the relationship decides the step: `gap-2` label to control, `gap-3` rows in a block,
`gap-4` blocks in a column, `px-5 py-4` a row, `mt-8` between sections. No half-steps. Nested radii
nest: outer = inner + padding.

## Rows

Every row in a list has the same anatomy: label and title on one line, then who, where, when and
state in muted text — the state last, in its tone — and sentence-case actions on the right. No
stripes, no filled state pills in front of titles.

## The mark

A rust squircle with a white P (`public/favicon.svg`, app icons, `favicon.ico`). The unfurl card draws
it inline in `og.ts`.

## Sources
- `apps/web/app/assets/css/styles.css` (tokens), `tailwind.css` (the bridge to utilities)
- [AGENTS.md](../../AGENTS.md): "Ink decides, coral means changed", "Spacing comes from the scale…", "A surface's edge is a one-pixel rule", "Every row in a list has the same anatomy"
