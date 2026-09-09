<!--
  Lane A: the only queue on this page that is blocked on you. It gets the tinted band, the largest
  type and the only filled button on the board, because the brief's whole complaint about the old
  grid was that "someone is waiting for you" and "this went well" looked identical.

  Two controls, deliberately. The command *is* the button — one target, and it teaches the CLI to
  someone who arrived by invite link — with `open` beside it for the people who have never used a
  terminal and are not going to start now.
-->
<script setup lang="ts">
const { data } = useHub();
const waiting = computed(() => data.value.board?.waiting ?? []);
</script>

<template>
  <section
    v-if="waiting.length"
    class="mb-6 rounded-3 border border-accent bg-accent-soft px-5 py-5"
  >
    <div class="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <div class="flex flex-wrap items-baseline gap-3">
        <h2 class="m-0 text-h2 font-bold tracking-tight text-fg">Waiting on you</h2>
        <span class="text-sm text-accent">handed to you, not pulled yet</span>
      </div>
      <span class="text-sm text-muted">Pull it, then say whether it worked.</span>
    </div>

    <div class="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
      <article
        v-for="g in waiting"
        :key="g.id"
        class="flex flex-col gap-3 rounded-2 border border-line-strong border-l-[3px] border-l-accent bg-raised p-4 shadow-raise"
      >
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <!-- Leading the line, the way it does on a row: this lane is the only one where a
               blocker and a cosmetic bug sat looking identical, and it is the lane where the
               difference decides what you pick up first. Never in front of the title — a fact
               only some cards carry must not move where every title starts. -->
          <span
            v-if="g.severity"
            class="rounded-pill px-2 py-0.5 font-ui text-xs font-semibold tracking-wide uppercase"
            :class="severityTone(g.severity)"
          >{{ severityLabel(g.severity) }}</span>
          <code class="rounded-1 border border-line bg-surface px-2 py-0.5 font-code text-xs text-fg">{{ g.id }}</code>
          <span>from <b class="font-medium text-fg">@{{ g.from || "?" }}</b> · {{ rel(g.created) }}</span>
        </div>

        <a
          :href="g.url"
          target="_blank"
          rel="noopener"
          class="text-h2 font-semibold leading-snug tracking-tight text-fg no-underline hover:text-accent"
        >{{ g.title || g.id }}</a>

        <!-- Two labelled lines, not one run-on. These are the two longest things a guide carries:
             set inline with a `·` between them they wrapped into four lines of mono with the
             separator stranded on a line of its own, and the card read as a wall. Each is
             shortened to whole units and opens where it stands, and the label says which is which
             in the same words the guide page uses. -->
        <dl
          v-if="g.source_context || g.stack_assumptions?.length"
          class="m-0 flex flex-col gap-2 text-xs leading-relaxed text-muted"
        >
          <div v-if="g.source_context" class="flex gap-3">
            <dt class="w-14 shrink-0 font-ui">out of</dt>
            <dd class="m-0 min-w-0 font-code"><AppShorten :value="g.source_context" :max="40" /></dd>
          </div>
          <div v-if="g.stack_assumptions?.length" class="flex gap-3">
            <dt class="w-14 shrink-0 font-ui">assumes</dt>
            <dd class="m-0 min-w-0 font-code">
              <AppShorten :value="g.stack_assumptions.join(', ')" :max="40" />
            </dd>
          </div>
        </dl>

        <!-- At the foot, not after the last paragraph. The grid stretches these to a common
             height, so a card with no `out of` line used to put its command halfway up the card
             beside a neighbour whose command was at the bottom. -->
        <div class="mt-auto flex items-center gap-2 pt-1">
          <!-- It wears the clipboard mark like every other copy on the page, and so it no longer
               needs a tooltip to admit what it does. This could not hold an icon until copy()
               learned to swap `[data-label]` instead of the button's whole textContent. -->
          <button
            class="flex flex-1 cursor-pointer items-center gap-2 rounded-1 border border-accent bg-accent px-3 py-3 text-left font-code text-sm text-accent-fg transition-colors hover:bg-accent-hover"
            @click="copy(`passalong pull ${g.id}`, $event.currentTarget)"
          >
            <AppIcon name="copy" /><span data-label>$ passalong pull {{ g.id }}</span>
          </button>
          <a
            :href="g.url"
            target="_blank"
            rel="noopener"
            class="btn sm"
          ><AppIcon name="open" />open</a>
        </div>
      </article>
    </div>
  </section>
</template>
