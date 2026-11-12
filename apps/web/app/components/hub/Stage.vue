<!--
  Where a piece of work stands, as a tinted chip in the board's own words (workStage in
  utils/link-kind.ts): Draft and Archived stone, Ready blue, In progress coral (coral is active
  in the hub), Done green. Colour helps it read at a glance; the word says it.
-->
<script setup lang="ts">
const props = defineProps<{ work: { status: string; outcome?: string; held_by?: unknown[] } }>();
const word = computed(() => workStage(props.work));
const TONE: Record<string, string> = {
  Draft: "stone",
  Ready: "blue",
  "In progress": "coral",
  Done: "green",
  Archived: "stone",
};
</script>

<template>
  <span class="tint" :data-tone="TONE[word]">{{ word }}</span>
</template>
