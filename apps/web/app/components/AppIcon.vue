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
