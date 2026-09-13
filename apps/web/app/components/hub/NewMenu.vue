<!--
  How a guide gets made, offered from every hub page.

  Writing one in the browser comes first, because until it existed a person without a terminal
  could receive work and never send any. Claude Code and the CLI are still how most guides are
  written, so they are offered here too, as the other way rather than the only one.
-->
<script setup lang="ts">
const open = ref(false);
const root = ref<HTMLElement | null>(null);

function onDocument(e: MouseEvent) {
  if (open.value && !root.value?.contains(e.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener("click", onDocument));
onBeforeUnmount(() => document.removeEventListener("click", onDocument));
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      class="btn primary sm"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      New
      <AppIcon name="reveal" />
    </button>
    <div v-if="open" class="menu" role="menu">
      <NuxtLink class="menu-item" to="/hub/write" @click="open = false">Write a guide</NuxtLink>
      <div class="menu-rule" />
      <p class="menu-note">In Claude Code, say “pass this along”. In a terminal:</p>
      <button class="menu-item" type="button" @click="copy('passalong share', $event.currentTarget)">
        <AppIcon name="copy" /><span data-label>Copy <code>passalong share</code></span>
      </button>
    </div>
  </div>
</template>
