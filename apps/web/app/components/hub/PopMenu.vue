<!--
  A button that opens a menu under it, for the overflow behind a page's own actions (a project's
  Shared and More, a document's More). Escape, a click outside, or `close()` from the slot shuts it.
  `open` is a model so a page can open it itself, as Share does once the link exists.
-->
<script setup lang="ts">
const props = defineProps<{ label: string; buttonClass?: string; menuClass?: string }>();
const open = defineModel<boolean>("open", { default: false });
const root = ref<HTMLElement | null>(null);

function outside(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) open.value = false;
}
watch(open, (on) => {
  if (on) document.addEventListener("pointerdown", outside, true);
  else document.removeEventListener("pointerdown", outside, true);
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside, true));
const close = () => {
  open.value = false;
};
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="close">
    <button
      class="btn sm"
      :class="props.buttonClass"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="$slots.button ? undefined : props.label"
      @click="open = !open"
    >
      <slot name="button"><AppIcon name="more" /></slot>
    </button>
    <div v-if="open" class="menu" :class="props.menuClass" role="menu" :aria-label="props.label">
      <slot :close="close" />
    </div>
  </div>
</template>
