<!-- A small copy button for one command in a docs row; it turns into a tick once copied. -->
<script setup lang="ts">
const props = defineProps<{ text: string }>();
const { state, copy } = useCopy();
const btn = ref<HTMLElement | null>(null);
// If the browser refuses both ways to copy, the command beside the button is selected for ⌘C.
const go = () => copy(props.text, btn.value?.previousElementSibling as HTMLElement | null);
</script>

<template>
  <button
    ref="btn"
    type="button"
    class="dcopy"
    :class="state"
    :aria-label="state === 'copied' ? 'Copied' : `Copy ${props.text}`"
    :title="state === 'copied' ? 'Copied' : 'Copy'"
    @click="go"
  >
    <svg v-if="state === 'copied'" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
    <svg v-else viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
    </svg>
  </button>
</template>

<style scoped>
.dcopy {
  display: grid;
  place-items: center;
  flex: none;
  width: 1.625rem;
  height: 1.625rem;
  margin: -0.125rem -0.25rem -0.125rem 0;
  padding: 0;
  border: 0;
  border-radius: var(--r-1);
  background: none;
  color: var(--muted);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}
.dcopy:hover {
  background: var(--line-strong);
  color: var(--fg);
}
.dcopy:active {
  scale: 0.92;
}
.dcopy.copied {
  color: var(--ok);
}
.dcopy svg {
  width: 0.9375rem;
  height: 0.9375rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
