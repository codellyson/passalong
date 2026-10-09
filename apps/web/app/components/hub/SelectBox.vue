<!--
  The box a row carries while selecting. Present on every row in the mode so titles stay on one
  edge; switched off where the viewer cannot manage the guide.
-->
<script setup lang="ts">
const props = defineProps<{
  id: string;
  title: string | null;
  archived: boolean;
  allowed: boolean;
}>();
const { on, has, toggle } = useSelection();
</script>

<template>
  <label
    v-if="on"
    class="flex shrink-0 cursor-pointer items-center self-center has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40"
  >
    <input
      type="checkbox"
      class="size-4 accent-[var(--accent)]"
      :checked="has(props.id)"
      :disabled="!props.allowed"
      :aria-label="props.allowed ? `Select ${props.title || props.id}` : `You cannot archive or delete ${props.title || props.id}`"
      @change="toggle({ id: props.id, title: props.title || '', archived: props.archived })"
    >
  </label>
</template>
