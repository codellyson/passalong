<!-- The install command as the page's main action: one click copies it. -->
<script setup lang="ts">
const COMMAND = "npm i -g passalong && passalong setup";

const copied = ref(false);
let reset: ReturnType<typeof setTimeout> | undefined;
async function copy() {
  try {
    await navigator.clipboard.writeText(COMMAND);
    copied.value = true;
    clearTimeout(reset);
    reset = setTimeout(() => (copied.value = false), 1800);
  } catch {
    copied.value = false;
  }
}
onBeforeUnmount(() => clearTimeout(reset));
</script>

<template>
  <div class="lc">
    <button type="button" class="pill" :class="{ copied }" @click="copy">
      <span class="prompt" aria-hidden="true">$</span>
      <code>npm i -g passalong</code>
      <span class="act">
        <Transition name="swap" mode="out-in">
          <span v-if="copied" key="done" class="state">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>Copied
          </span>
          <span v-else key="copy" class="state">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></svg>Copy
          </span>
        </Transition>
      </span>
    </button>
    <p class="then" aria-live="polite">
      <template v-if="copied">Paste it in your terminal. <code>passalong setup</code> runs right after.</template>
      <template v-else>Copies the install and setup together. <a href="/connect">Other ways to connect</a></template>
    </p>
  </div>
</template>

<style scoped>
.lc {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
}
.pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--s-3);
  height: 3.5rem;
  padding: 0 var(--s-2) 0 var(--s-5);
  border: 0;
  border-radius: var(--r-pill);
  background: var(--fg);
  color: var(--bg);
  cursor: pointer;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
  transition:
    scale 0.15s ease-out,
    box-shadow 0.25s ease;
}
.pill:hover {
  background: color-mix(in oklab, var(--fg) 88%, var(--bg));
}
.pill:active {
  scale: 0.97;
}
.pill:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}
.prompt {
  font: 600 1.0625rem / 1 var(--font-mono);
  color: var(--coral);
}
code {
  padding: 0;
  background: none;
  color: inherit;
  font: 500 1.0625rem / 1 var(--font-mono);
  letter-spacing: -0.01em;
}
.act {
  display: inline-grid;
  min-width: 6.25rem;
  height: 2.5rem;
  margin-left: var(--s-2);
  padding: 0 var(--s-4);
  border-radius: var(--r-pill);
  background: color-mix(in oklab, var(--bg) 14%, var(--fg));
  place-items: center;
  font: 500 var(--t-sm) / 1 var(--font-sans);
  transition: background-color 0.2s ease;
}
.pill:hover .act {
  background: color-mix(in oklab, var(--bg) 22%, var(--fg));
}
.copied .act {
  background: var(--coral);
  color: #1a1410;
}
.state {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
}
.state svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.then {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--muted);
}
.then code {
  font: var(--t-xs) / 1 var(--font-mono);
  padding: 0.125rem var(--s-1);
  border-radius: 4px;
  background: var(--surface);
}
.swap-enter-active,
.swap-leave-active {
  transition:
    opacity 0.16s ease,
    translate 0.16s ease,
    filter 0.16s ease;
}
.swap-enter-from {
  opacity: 0;
  translate: 0 4px;
  filter: blur(2px);
}
.swap-leave-to {
  opacity: 0;
  translate: 0 -4px;
  filter: blur(2px);
}
@media (max-width: 30rem) {
  .pill {
    height: 3.25rem;
    padding-left: var(--s-4);
  }
  code,
  .prompt {
    font-size: 0.9375rem;
  }
  .act {
    min-width: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .swap-enter-from,
  .swap-leave-to {
    translate: none;
    filter: none;
  }
}
</style>
