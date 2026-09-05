<!-- One bucket of the board. Renders nothing at all when empty: an empty queue is not news. -->
<script setup lang="ts">
import type { Guide } from "~/types/hub";

defineProps<{
  cls: string;
  title: string;
  note: string;
  guides: Guide[] | undefined;
  action: "pull" | "done" | "promote" | "link";
}>();
</script>

<template>
  <section v-if="guides?.length" :class="['card', cls]">
    <div class="head">
      <h2>{{ title }} · {{ guides.length }}</h2>
      <span class="muted">{{ note }}</span>
    </div>
    <ul class="card-rows">
      <HubCardRow v-for="g in guides" :key="g.id" :g="g" :action="action" />
    </ul>
  </section>
</template>
