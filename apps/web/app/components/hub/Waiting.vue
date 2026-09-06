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
          <code class="rounded-1 border border-line bg-surface px-1.5 py-0.5 font-code text-xs text-fg">{{ g.id }}</code>
          <span>from <b class="font-medium text-fg">@{{ g.from || "?" }}</b> · {{ rel(g.created) }}</span>
        </div>

        <a
          :href="g.url"
          target="_blank"
          rel="noopener"
          class="text-h2 font-semibold leading-snug tracking-tight text-fg no-underline hover:text-accent"
        >{{ g.title || g.id }}</a>

        <div
          v-if="g.source_context || g.stack_assumptions?.length"
          class="flex flex-wrap items-center gap-2 font-code text-xs text-muted"
        >
          <span v-if="g.source_context">{{ g.source_context }}</span>
          <span v-if="g.source_context && g.stack_assumptions?.length">·</span>
          <span v-if="g.stack_assumptions?.length">{{ g.stack_assumptions.join(", ") }}</span>
        </div>

        <div class="mt-0.5 flex items-center gap-2">
          <button
            class="flex flex-1 cursor-pointer items-center gap-2 rounded-1 border border-accent bg-accent px-3 py-2.5 text-left font-code text-sm text-accent-fg transition-colors hover:bg-accent-hover"
            :title="`copy: passalong pull ${g.id}`"
            @click="copy(`passalong pull ${g.id}`, $event.currentTarget)"
          >
            <!-- One text node and nothing else: copy() swaps the label to "copied" and back
                 through textContent, which would eat any element nested in here. -->
            $ passalong pull {{ g.id }}
          </button>
          <a
            :href="g.url"
            target="_blank"
            rel="noopener"
            class="cursor-pointer rounded-1 border border-line-strong px-3 py-2.5 font-ui text-sm font-medium text-fg no-underline transition-colors hover:border-muted hover:bg-surface"
          >open</a>
        </div>
      </article>
    </div>
  </section>
</template>
