<!--
  Another guide, as a line you can follow to its own page: what kind it is, its title, and where it
  has got to. Used for everything a guide is tied to — what it follows, what it blocks, its
  follow-ups — so the chain is walked inside the hub rather than out through share links.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";

const props = defineProps<{ g: Guide }>();
const badge = computed(() => kindBadge(props.g.kind));
const where = computed(() => {
  const g = props.g;
  if (g.status === "consumed") return "done";
  if (g.status === "draft") return "draft";
  if (g.failing) return "didn't work";
  if (g.verdict?.ok) return "works";
  if (g.taken_by?.length) return "being worked on";
  return rel(g.created);
});
</script>

<template>
  <NuxtLink
    :to="`/hub/g/${g.id}`"
    class="flex items-baseline gap-2 rounded-2 bg-field px-3 py-2 no-underline hover:shadow-edge"
  >
    <span
      v-if="badge"
      class="shrink-0 rounded-1 border px-1 py-0.5 font-ui text-xs leading-none font-medium tracking-wide uppercase"
      :class="badge.class"
    >{{ badge.label }}</span>
    <span class="min-w-0 flex-1 text-fg">{{ g.title || "Untitled guide" }}</span>
    <span class="shrink-0 text-xs text-muted">{{ where }}</span>
  </NuxtLink>
</template>
