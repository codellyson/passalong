<!--
  The label an agent gave a piece of work — `bug`, `feature`, `question` — beside its title. It is
  description and nothing turns on it, so it is one quiet outline whatever the word: the first tag,
  or nothing.
-->
<script setup lang="ts">
const props = defineProps<{ tags?: string[] }>();
const tag = computed(() => props.tags?.[0] ?? "");
</script>

<template>
  <span
    v-if="tag"
    class="shrink-0 rounded-1 border border-line-strong px-1 py-0.5 font-ui text-xs leading-none font-medium tracking-wide text-muted"
  >{{ tag }}</span>
</template>
