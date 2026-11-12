<!--
  A project, as a chip tinted in its own colour (toneOf in utils/projects.ts), with its line mark.
  One line: a long name ends in "…".
-->
<script setup lang="ts">
import { toneOf } from "~/utils/projects";

const props = defineProps<{ project: { id: string; title: string; color?: string | null } }>();
const tone = computed(() => toneOf(props.project));
</script>

<template>
  <span class="tint min-w-0" :data-tone="tone">
    <span class="project-mark h-2.5 w-[3px] shrink-0 rounded-[1px]" :data-tone="tone" aria-hidden="true" />
    <span class="min-w-0 truncate">{{ project.title }}</span>
  </span>
</template>
