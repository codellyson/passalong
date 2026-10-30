<!--
  A labelled row: what it is on the left, the control on the right; stacked on a phone. `for` makes
  the label a <label> for that control; without it the label names a group of controls.
-->
<script setup lang="ts">
defineProps<{ label: string; hint?: string; for?: string }>();
</script>

<template>
  <div class="grid gap-x-8 gap-y-2 border-b border-line py-4 last:border-b-0 md:grid-cols-[13rem_minmax(0,1fr)]">
    <div class="min-w-0">
      <label v-if="$props.for" :for="$props.for" class="font-ui text-sm font-medium text-fg">{{ label }}</label>
      <p v-else class="m-0 font-ui text-sm font-medium text-fg">{{ label }}</p>
      <p v-if="hint" class="m-0 mt-1 font-ui text-xs text-muted">{{ hint }}</p>
    </div>
    <div class="flex min-w-0 flex-col gap-3 font-ui text-sm">
      <slot />
    </div>
  </div>
</template>
