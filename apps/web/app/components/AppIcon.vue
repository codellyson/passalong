<!--
  The icon set. Inline SVG, drawn on a 16-unit grid, stroked in `currentColor` so an icon takes the
  colour of the button or label it sits in.

  Inline and hand-written for two reasons. An icon font or a sprite from a CDN is refused outright
  by the CSP (`font-src 'self'`, and no third-party origin is allowed), and a guide page runs no
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
  more: "M4 8h.01M8 8h.01M12 8h.01",
  /** A step that is done. */
  check: "M3.5 8.5l3 3 6-7",
  /** Add. */
  plus: "M8 3.5v9M3.5 8h9",
  /** Puts something on the clipboard: two sheets, the back one showing at the corner. */
  copy: "M5.75 5.75h6.5v6.5h-6.5zM10.25 3.75H3.75v6.5",
  /** Goes somewhere: a box the arrow is leaving. */
  open: "M7.75 3.75H3.75v8.5h8.5v-4M10 3.75h2.25V6M12.25 3.75l-4.25 4.25",
  /** Opens something below it, and turns over when it is open. */
  reveal: "M4.5 6.5L8 10l3.5-3.5",
  /** Undoes a mark, the way check makes one. */
  x: "M5 5l6 6M11 5l-6 6",
  /** Appearance: follow the system. A screen on its stand. */
  system: "M2.75 3.25h10.5v7H2.75zM6 13.25h4M8 10.25v3",
  /** Appearance: light. */
  sun: "M8 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M8 1.75v1.25M8 13v1.25M1.75 8H3M13 8h1.25M3.6 3.6l.9.9M11.5 11.5l.9.9M3.6 12.4l.9-.9M11.5 4.5l.9-.9",
  /** Appearance: dark. */
  moon: "M13 9.75A5.25 5.25 0 1 1 6.25 3a4.25 4.25 0 0 0 6.75 6.75z",
} as const;

/** Dots are drawn as zero-length strokes with a round cap, so their weight *is* the stroke width —
    at the line weight the other icons use they come out too faint to read at 16px. */
const WIDTHS: Partial<Record<keyof typeof PATHS, number>> = { more: 2.25 };
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    :stroke-width="WIDTHS[name] ?? 1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    class="shrink-0"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>
