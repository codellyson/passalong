<!--
  One handed-over guide. Three lines at most: what state it is in, what it is, and — only when
  someone has said it does not work — why.

  The verdict is printed in full rather than folded behind a control. It is the single most
  valuable fact the product produces, it is capped at 280 characters server-side so it cannot run
  away, and a button saying "read the reason" would send the eye somewhere it has already been.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";
import type { Kind } from "./Handoffs.vue";

const props = defineProps<{ g: Guide; kind: Kind }>();
const { onStatus } = useHub();

const ghost =
  "cursor-pointer rounded-1 border border-line-strong px-3 py-2 font-ui text-sm font-medium text-fg no-underline whitespace-nowrap transition-colors hover:border-muted hover:bg-surface";

/** Who has it, for the person who handed it over. Nobody else is shown the list. */
const pulledBy = computed(() =>
  props.g.pulled_by?.length
    ? props.g.pulled_by.map((p) => (p.handle ? `@${p.handle}` : "link")).join(", ")
    : null,
);
</script>

<template>
  <li
    class="flex flex-wrap items-start gap-x-4 gap-y-2 border-t border-l-[3px] border-t-line border-b-0 border-r-0 bg-raised px-4 py-3.5 first:border-t-0"
    :class="kind.stripe"
  >
    <div class="min-w-0 flex-1 basis-64">
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
        <span
          class="rounded-1 px-1.5 py-0.5 font-ui text-xs font-semibold uppercase tracking-wide"
          :class="kind.badge"
          :title="kind.note"
        >{{ kind.label }}</span>
        <span v-if="g.pulls">{{ plural(g.pulls, "pull") }}</span>
        <span v-if="g.stale" class="font-medium text-warn">stale · over a week</span>
        <span>{{ rel(g.created) }}</span>
      </div>

      <a
        :href="g.url"
        target="_blank"
        rel="noopener"
        class="mt-1.5 block text-base font-semibold leading-snug text-fg no-underline hover:text-accent"
      >{{ g.title || g.id }}</a>

      <p v-if="g.failing && g.verdict" class="mt-1.5 mb-0 text-sm text-danger">
        <b class="font-semibold">{{ g.verdict.by ? `@${g.verdict.by}` : "someone" }} says it does not work.</b>
        {{ g.verdict.note || "No reason given." }}
      </p>

      <div class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
        <span v-if="g.team">to <b class="font-medium text-fg">{{ g.team }}{{ g.to ? ` / @${g.to}` : "" }}</b></span>
        <code class="font-code">{{ g.id }}</code>
        <span v-if="g.source_context" class="font-code">{{ g.source_context }}</span>
        <span v-if="pulledBy">pulled by {{ pulledBy }}</span>
      </div>
    </div>

    <!-- One move per row, plus a way to look at the thing. Everything else a guide can do still
         lives on its row in the full list further down the page. -->
    <div class="flex shrink-0 items-center gap-2">
      <a v-if="kind.action === 'open'" :href="g.url" target="_blank" rel="noopener" :class="ghost">open</a>
      <button
        v-else-if="kind.action === 'link'"
        :class="ghost"
        @click="copy(g.url, $event.currentTarget)"
      >
        copy link
      </button>
      <button v-else-if="kind.action === 'done'" :class="ghost" @click="onStatus(g, 'consumed')">
        done
      </button>
      <button
        v-else
        class="cursor-pointer rounded-1 border border-transparent bg-ok-soft px-3 py-2 font-ui text-sm font-semibold text-ok whitespace-nowrap transition-colors hover:border-ok"
        @click="onStatus(g, 'promoted')"
      >
        promote
      </button>

      <a
        v-if="kind.action !== 'open'"
        :href="g.url"
        target="_blank"
        rel="noopener"
        :class="ghost"
      >open</a>
      <button v-else :class="ghost" @click="copy(g.url, $event.currentTarget)">copy link</button>
    </div>
  </li>
</template>
