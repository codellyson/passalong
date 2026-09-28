<!--
  The box a row carries while selecting. Present on every row in the mode so titles stay on one
  edge; switched off on a guide that is not yours, since only its author may archive or delete it.
-->
<script setup lang="ts">
const props = defineProps<{ id: string; title: string | null; archived: boolean; mine: boolean }>();
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
      :disabled="!props.mine"
      :aria-label="props.mine ? `Select ${props.title || props.id}` : `${props.title || props.id} is not yours to archive or delete`"
      @change="toggle({ id: props.id, title: props.title || '', archived: props.archived })"
    >
  </label>
</template>
