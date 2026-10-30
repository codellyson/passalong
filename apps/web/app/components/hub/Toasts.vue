<!--
  What just happened, in the corner: a notification as it arrives, from useLive(). One line each,
  the server's own sentence, and a click opens the work. They leave on their own after a few
  seconds; the Activity feed keeps them. Polite, not assertive: news, not an alarm.
-->
<script setup lang="ts">
const { toasts, dismiss } = useLive();
const DOT: Record<string, string> = {
  blocked: "bg-danger",
  sent_back: "bg-danger",
  stuck: "bg-danger",
  declined: "bg-warn",
  stalled: "bg-warn",
  untaken: "bg-warn",
  task_finished: "bg-ok",
};
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
        class="pointer-events-auto flex items-start gap-3 rounded-2 bg-field px-4 py-3 font-ui text-sm shadow-[0_0_0_1px_var(--edge-ring),var(--shadow-2)]"
      >
        <!-- A toast is news you have not looked at yet, so a kind with no status colour wears the change mark. -->
        <span class="mt-1.5 size-2 shrink-0 rounded-pill" :class="DOT[t.kind] || 'bg-changed'" aria-hidden="true" />
        <NuxtLink
          v-if="t.guide"
          :to="`/hub/g/${t.guide}`"
          class="min-w-0 flex-1 text-fg no-underline hover:underline"
          @click="dismiss(t.key)"
        >{{ t.text }}</NuxtLink>
        <span v-else class="min-w-0 flex-1 text-muted">{{ t.text }}</span>
        <button
          type="button"
          class="-mt-0.5 -mr-1 cursor-pointer rounded-pill border-0 bg-transparent px-1.5 text-muted hover:text-fg"
          aria-label="Dismiss"
          @click="dismiss(t.key)"
        >×</button>
      </div>
    </TransitionGroup>
  </div>
</template>
