<!--
  What just happened, in the corner: a notification as it arrives, from useLive(). One line each,
  the server's own sentence, and a click opens the work. They leave on their own after a few
  seconds; the Activity feed keeps them. Polite, not assertive: news, not an alarm.
-->
<script setup lang="ts">
const { toasts, dismiss } = useLive();
/**
 * Each kind of news wears its status icon in its status colour (DESIGN.md §11, 2026-11-18): what needs
 * you in warn or danger, finished in ok, and anything else as plain news in ink.
 */
type Mark = {
  icon: "asking" | "quiet" | "reopen" | "check" | "take" | "inbox" | "bell";
  tone: string;
};
const MARK: Record<string, Mark> = {
  asked: { icon: "asking", tone: "text-warn" },
  blocked: { icon: "asking", tone: "text-danger" },
  stalled: { icon: "quiet", tone: "text-warn" },
  stuck: { icon: "quiet", tone: "text-danger" },
  reopened: { icon: "reopen", tone: "text-danger" },
  passed: { icon: "reopen", tone: "text-warn" },
  untaken: { icon: "inbox", tone: "text-warn" },
  sent_to_you: { icon: "inbox", tone: "text-changed" },
  task_claimed: { icon: "take", tone: "text-changed" },
  task_finished: { icon: "check", tone: "text-ok" },
  child_done: { icon: "check", tone: "text-ok" },
};
const NEWS: Mark = { icon: "bell", tone: "text-changed" };
</script>

<template>
  <div
    class="pointer-events-none fixed right-4 bottom-[calc(var(--dock)+1rem)] z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup
      enter-from-class="translate-y-2 opacity-0"
      leave-to-class="opacity-0"
      enter-active-class="transition-[opacity,translate] duration-200 ease-out"
      leave-active-class="transition-[opacity,translate] duration-150 ease-out"
    >
      <div
        v-for="t in toasts"
        :key="t.key"
        class="pointer-events-auto flex items-start gap-3 rounded-3 bg-field px-4 py-3 font-ui text-sm shadow-[0_0_0_1px_var(--edge-ring),var(--shadow-2)]"
      >
        <AppIcon :name="(MARK[t.kind] ?? NEWS).icon" class="mt-0.5" :class="(MARK[t.kind] ?? NEWS).tone" />
        <NuxtLink
          v-if="t.work"
          :to="`/hub/w/${t.work}`"
          class="min-w-0 flex-1 text-fg no-underline hover:underline"
          @click="dismiss(t.key)"
        ><AppLinked :text="t.text" inert /></NuxtLink>
        <span v-else class="min-w-0 flex-1 text-muted"><AppLinked :text="t.text" /></span>
        <button
          type="button"
          class="-mt-0.5 -mr-1 grid cursor-pointer place-items-center rounded-1 border-0 bg-transparent p-0.5 text-muted hover:text-fg"
          aria-label="Dismiss"
          @click="dismiss(t.key)"
        ><AppIcon name="x" :size="14" /></button>
      </div>
    </TransitionGroup>
  </div>
</template>
