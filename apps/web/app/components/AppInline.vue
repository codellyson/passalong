<!--
  One line of somebody's markdown, with its `code` and **bold** — as text nodes, never HTML. See
  inlineParts() in utils/task-docs.ts for why only those two.
-->
<script setup lang="ts">
const props = defineProps<{ text: string }>();
const parts = computed(() => inlineParts(props.text));
</script>

<template>
  <span
    ><template v-for="(p, i) in parts" :key="i"
      ><code v-if="p.kind === 'code'" class="font-code text-xs">{{ p.text }}</code
      ><b v-else-if="p.kind === 'bold'" class="font-semibold">{{ p.text }}</b
      ><template v-else>{{ p.text }}</template></template
    ></span
  >
</template>
