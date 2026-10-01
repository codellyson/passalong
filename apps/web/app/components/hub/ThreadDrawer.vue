<!--
  A conversation, as its own panel.

  It was a block that opened inside a row of a list, and a list row is the wrong place for a chat:
  the row grew by a screenful, the bubbles floated at the far edges of a page-wide card, and the box
  to answer sat in the middle of the page. A conversation wants a column of its own — a header that
  says what it is about, messages that scroll, and the box pinned underneath — so it opens here, over
  the right of the page, and the list underneath stays where it was.

  One panel for the whole hub, drawn by the shell. A row only says which conversation to open
  (useThread). Escape or a click outside closes it.
-->
<script setup lang="ts">
import type { ThreadTarget } from "~/composables/useThread";

const { target, close } = useThread();

// What the panel draws is the last conversation opened, not the current one: closing sets the target
// to nothing, and the panel has to keep its contents on screen for the length of its slide out.
const last = ref<ThreadTarget | null>(null);
watch(
  target,
  (t) => {
    if (t) last.value = t;
  },
  { immediate: true },
);

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && target.value) close();
}
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <!-- Stays mounted once opened, and stops catching clicks when closed, so the leave transition
         has something to run on. Slides in from the right and the page dims behind it; both are off
         for anybody who has asked for less motion. -->
    <div v-if="last" class="fixed inset-0 z-40" :class="target ? '' : 'pointer-events-none'">
      <Transition
        enter-active-class="transition-opacity duration-200 ease-out motion-reduce:transition-none"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-150 ease-in motion-reduce:transition-none"
        leave-to-class="opacity-0"
      >
        <div v-if="target" class="absolute inset-0 bg-black/40" aria-hidden="true" @click="close" />
      </Transition>
      <Transition
        enter-active-class="transition-transform duration-200 ease-out motion-reduce:transition-none"
        enter-from-class="translate-x-full"
        leave-active-class="transition-transform duration-150 ease-in motion-reduce:transition-none"
        leave-to-class="translate-x-full"
      >
        <aside
          v-if="target"
          role="dialog"
          aria-modal="true"
          :aria-label="`Conversation: ${last.title}`"
          class="absolute inset-y-0 right-0 flex w-[min(34rem,100vw)] flex-col bg-raised shadow-[-12px_0_40px_rgba(0,0,0,0.35)]"
        >
          <header class="flex items-start gap-4 border-b border-line px-5 py-4">
            <div class="min-w-0 flex-1">
              <p class="m-0 font-ui text-xs font-semibold tracking-widest text-muted uppercase">
                Conversation
              </p>
              <h2 class="m-0 mt-1 text-base leading-snug break-words">{{ last.title || last.id }}</h2>
              <p class="m-0 mt-1 flex items-center gap-3 text-xs text-muted">
                <code class="font-code">{{ last.id }}</code>
                <a v-if="last.url" :href="last.url" target="_blank" rel="noopener">The guide</a>
              </p>
            </div>
            <button class="btn sm shrink-0" type="button" aria-label="Close the conversation" @click="close">
              <AppIcon name="x" :size="14" />
            </button>
          </header>
          <HubThread
            :id="last.id"
            :stamp="last.stamp"
            :reply="last.reply"
            :noting="last.noting"
            fill
            class="min-h-0 flex-1"
          />
        </aside>
      </Transition>
    </div>
  </Teleport>
</template>
