<!--
  The icon set: Tabler outline (MIT, tabler.io/icons, v3.24.0), chosen 2026-11-18 (DESIGN.md §6).
  Inline SVG on Tabler's 24-unit grid at stroke 2, stroked in `currentColor` so an icon takes the
  colour of the button or label it sits in. Each path is copied from the icon's own file; to add one,
  copy its `d` attributes (all but the invisible `M0 0h24v24H0z` frame) into PATHS.

  Inline and hand-written for two reasons. An icon font or a sprite from a CDN is refused outright
  by the CSP (`font-src 'self'`, and no third-party origin is allowed), and a work page runs no
  script at all — so anything that resolves icons at runtime cannot exist there. These are markup,
  server-rendered like everything else.

  They replace text glyphs. A `⋯` or a `✓` in a button is whatever the reader's font decides it
  is: it shifts weight and baseline between platforms, it is read aloud by a screen reader as
  "midline horizontal ellipsis", and it cannot be aligned with the text beside it.
-->
<script setup lang="ts">
withDefaults(defineProps<{ name: keyof typeof PATHS; size?: number }>(), { size: 16 });

const PATHS = {
  /** Overflow: the rest of the actions on a row. */
  more: "M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  /** A step that is done. */
  check: "M5 12l5 5l10 -10",
  /** Add. */
  plus: "M12 5l0 14M5 12l14 0",
  /** Puts something on the clipboard: two sheets, the back one showing at the corner. */
  copy: "M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667zM4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1",
  /** Goes somewhere: a box the arrow is leaving. */
  open: "M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6M11 13l9 -9M15 4h5v5",
  /** Opens something below it, and turns over when it is open. */
  reveal: "M6 9l6 6l6 -6",
  /** Undoes a mark, the way check makes one. */
  x: "M18 6l-12 12M6 6l12 12",
  /** Appearance: follow the system. A screen on its stand. */
  system: "M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10zM7 20h10M9 16v4M15 16v4",
  /** Appearance: light. */
  sun: "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7",
  /** Appearance: dark. */
  moon: "M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z",
  /** The hub's places, in its sidebar. */
  inbox: "M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2zM4 13h3l3 3h4l3 -3h3",
  /** An attachment: a paper clip. */
  attach: "M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5",
  /** A project: a project, the one shape everybody reads as a place things are kept. */
  project: "M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2",
  board: "M4 4l6 0M14 4l6 0M4 8m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2zM14 8m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z",
  gear: "M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065zM9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0",
  menu: "M4 6l16 0M4 12l16 0M4 18l16 0",
  /** Back to the list this page came from. */
  back: "M5 12l14 0M5 12l6 6M5 12l6 -6",
  /** Hand it on: to a person or a group. */
  give: "M5 12l14 0M13 18l6 -6M13 6l6 6",
  /** Put away: a box with its lid. */
  archive: "M3 4m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2zM5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10M10 12l4 0",
  /** The rail, folded or opened: a panel with its left column marked. */
  rail: "M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2zM9 4l0 16",
  /** Look something up. */
  search: "M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M21 21l-6 -6",
  /** Narrow a list: three lines, each shorter than the last. */
  filter: "M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227z",
  /** An agent is asking you. */
  asking: "M8 9h8M8 13h6M14 18h-1l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v4.5M19 22v.01M19 19a2.003 2.003 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483",
  /** A hold that went quiet. */
  quiet: "M20.986 12.502a9 9 0 1 0 -5.973 7.98M12 7v5l3 3M19 16v3M19 22v.01",
  /** Stop this agent. */
  stop: "M5 5m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z",
} as const;

</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    class="shrink-0"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>
