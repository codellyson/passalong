<!--
  The shape of what is loading, drawn before it arrives.

  "Loading your guides…" was a sentence where a list was about to be, so the page jumped when the
  list replaced it. This draws rows at the size real rows will be, so the arrival changes what is
  in the space rather than the space itself.

  It does not pulse or shimmer. The stylesheet's rule is that nothing loops and nothing moves that
  the person did not just act on, and a placeholder is not an exception to that.
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    rows?: number;
    /** Said to screen readers, which get nothing from grey bars. */
    label?: string;
    /** Rows in a bordered list like the guides page, or bare lines inside a settings section. */
    variant?: "list" | "lines";
  }>(),
  { rows: 3, label: "Loading", variant: "list" },
);

/** Varied widths, so the placeholder does not read as a table of identical blanks. */
const WIDTHS = ["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-1/3"];
</script>

<template>
  <div role="status" :aria-label="label">
    <span class="sr-only">{{ label }}…</span>
    <ul
      v-if="variant === 'list'"
      aria-hidden="true"
      class="m-0 list-none rounded-3 border border-line bg-raised p-0"
    >
      <li
        v-for="i in rows"
        :key="i"
        class="flex items-center gap-4 px-4 py-3 shadow-[inset_0_1px_0_var(--line)] first:shadow-none"
      >
        <div class="min-w-0 flex-1">
          <span class="block h-3.5 rounded-pill bg-line-strong" :class="WIDTHS[(i - 1) % WIDTHS.length]" />
          <span class="mt-2.5 block h-2.5 w-1/4 rounded-pill bg-line" />
        </div>
        <span class="h-8 w-20 shrink-0 rounded-1 border border-line" />
      </li>
    </ul>
    <div v-else aria-hidden="true" class="flex flex-col gap-3 py-1">
      <span
        v-for="i in rows"
        :key="i"
        class="block h-3 rounded-pill bg-line"
        :class="WIDTHS[(i - 1) % WIDTHS.length]"
      />
    </div>
  </div>
</template>
