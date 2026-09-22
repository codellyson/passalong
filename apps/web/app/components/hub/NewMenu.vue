<!--
  How a guide gets made, offered from every hub page.

  Passalong is agent first: the agent that has the context writes the guide, so there is no form
  here. Each item copies the sentence to say to it (app/utils/asks.ts). The CLI is the other way,
  for a terminal without an agent.
-->
<script setup lang="ts">
import { ASKS } from "~/utils/asks";

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const ITEMS = [
  { label: "A task", text: ASKS.task },
  { label: "A plan of tasks", text: ASKS.plan },
  { label: "A handoff of finished work", text: ASKS.handoff },
];

const CLI = 'passalong task "what needs doing"';

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
      class="btn primary sm max-sm:size-8 max-sm:p-0"
      :aria-expanded="open"
      aria-haspopup="menu"
      aria-label="New"
      @click="open = !open"
    >
      <AppIcon name="plus" class="sm:hidden" />
      <span class="max-sm:hidden">New</span>
      <AppIcon name="reveal" class="max-sm:hidden" />
    </button>
    <div v-if="open" class="menu w-80 max-sm:fixed max-sm:inset-x-4 max-sm:top-14 max-sm:w-auto" role="menu">
      <p class="menu-note mt-0 mb-1">Ask your agent. Click one to copy what to say:</p>
      <button
        v-for="item in ITEMS"
        :key="item.label"
        class="menu-item items-start"
        type="button"
        role="menuitem"
        @click="copy(item.text, $event.currentTarget)"
      >
        <AppIcon name="copy" class="mt-0.5 shrink-0 text-muted" />
        <span class="flex min-w-0 flex-col">
          <span class="font-medium" data-label>{{ item.label }}</span>
          <code class="font-code text-xs break-words text-muted">{{ item.text }}</code>
        </span>
      </button>
      <div class="menu-rule" />
      <button
        class="menu-item"
        type="button"
        role="menuitem"
        @click="copy(CLI, $event.currentTarget)"
      >
        <AppIcon name="copy" class="shrink-0 text-muted" />
        <span>From a terminal: <code data-label>passalong task</code></span>
      </button>
    </div>
  </div>
</template>
