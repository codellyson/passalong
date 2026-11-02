<!--
  Other work, as a line you can follow to its own page: its label, its title, and where it has got
  to. Used for everything a piece of work is tied to — what it came from, what it blocks, what came
  out of it — so the chain is walked inside the hub rather than out through share links.
-->
<script setup lang="ts">
import type { Work } from "~/types/hub";

const props = defineProps<{ g: Work }>();
const where = computed(() => {
  const g = props.g;
  if (g.status === "done") return "done";
  if (g.status === "draft") return "draft";
  if (g.held_by?.length) return "being worked on";
  return rel(g.created);
});
</script>

<template>
  <NuxtLink
    :to="`/hub/w/${g.id}`"
    class="flex items-baseline gap-2 rounded-2 bg-field px-3 py-2 no-underline hover:shadow-edge"
  >
    <HubWorkTag :tags="g.tags" />
    <span class="min-w-0 flex-1 text-fg">{{ g.title || "Untitled" }}</span>
    <span class="shrink-0 text-xs text-muted">{{ where }}</span>
  </NuxtLink>
</template>
