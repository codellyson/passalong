# Design system

A warm, low-glare look: the page is a pale cream, a card is a deeper cream laid on it, and the one
near-white surface is the thing you act on. Hierarchy comes from fill, not outlines.

## Colour — ink decides, coral means changed

- **Canvas** `--bg` (#fffcfa), **field** `--field` (#fffefe) for inputs, menus and command wells.
  Dark mode is a matching warm charcoal.
- **Ink** is the primary action. Outside the hub a card is a deeper cream at 24px and every button
  is a pill; inside it (`.hub-app` on `<body>`) corners are 2–4px, nothing but a dot is round, a
  surface's edge is a one-pixel rule, and a card is near-white on the cream.
- **Coral** `--coral` (#f2805d) is 2.6:1 on the canvas, so it is only ever a mark. In the hub it
  means one thing: changed since you last looked (a 3px bar at a row's left edge, a dot on a
  project). `--accent` is the same hue at a readable 5:1 for the word "Changed".
- **The rail** (`--rail`) is solid ink in both themes. **Project colours** are six line colours
  (`--project-*`; `toneOf()` in `app/utils/projects.ts`), never coral.
- Status colours (`--ok`, `--warn`, `--danger`) are separate from the brand and carry meaning.

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
- [docs/DESIGN_BRIEF.md](../DESIGN_BRIEF.md)
