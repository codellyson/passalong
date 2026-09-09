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
/** Who has it, for the person who handed it over. Nobody else is shown the list. */
const pulledBy = computed(() =>
  props.g.pulled_by?.length
    ? props.g.pulled_by.map((p) => (p.handle ? `@${p.handle}` : "link")).join(", ")
    : null,
);
</script>

<template>
  <!-- The separator is an inset shadow, not a top border: a border mitres against the 3px stripe
       and bites a diagonal notch out of the left edge at every row boundary. -->
  <li
    class="m-0 flex flex-wrap items-start gap-x-4 gap-y-2 border-t-0 border-r-0 border-b-0 border-l-[3px] bg-raised px-4 py-4 shadow-[inset_0_1px_0_var(--line)] first:shadow-none"
    :class="kind.stripe"
  >
    <div class="min-w-0 flex-1 basis-64">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span
          class="rounded-pill px-2 py-0.5 font-ui text-xs font-semibold uppercase tracking-wide"
          :class="kind.badge"
          :title="kind.note"
        >{{ kind.label }}</span>
        <!-- With the other pill, not in front of the title: a fact only bug rows carry must not
             decide where every row's title starts. -->
        <span
          v-if="g.severity"
          class="rounded-pill px-2 py-0.5 font-ui text-xs font-semibold uppercase tracking-wide"
          :class="severityTone(g.severity)"
        >{{ severityLabel(g.severity) }}</span>
        <!-- Only when nobody is named below it. "1 pull" and "pulled by @someone" are one fact,
             and printing both put the badge, the count and the name all saying "landed". -->
        <span v-if="g.pulls && !pulledBy">{{ plural(g.pulls, "pull") }}</span>
        <span v-if="g.stale" class="font-medium text-warn">stale · over a week</span>
        <span>{{ rel(g.created) }}</span>
      </div>

      <!-- Nothing precedes the title, so every title in the list shares one left edge. -->
      <a
        :href="g.url"
        target="_blank"
        rel="noopener"
        class="mt-2 block text-base font-semibold leading-snug text-fg no-underline hover:text-accent"
      >{{ g.title || g.id }}</a>

      <p v-if="g.failing && g.verdict" class="mt-2 mb-0 text-sm text-danger">
        <b class="font-semibold">{{ g.verdict.by ? `@${g.verdict.by}` : "someone" }} says it does not work.</b>
        {{ g.verdict.note || "No reason given." }}
      </p>

      <!-- One line, always. Left to wrap, these four ran into a three-line grey paragraph under
           the title with nothing to say where one fact ended and the next began. The repo it came
           out of is the only one of them that runs long, so it is the one that gives — shortened
           to whole units here, openable in place, and in full on the guide itself. -->
      <!-- One line where there is room for one. On a phone a fourth fact (the report it was filed
           with) has nowhere to go, and nowrap put it off the edge of the card rather than
           truncating — so below `sm` the tail wraps instead. -->
      <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted sm:flex-nowrap">
        <span v-if="g.team" class="shrink-0">to <b class="font-medium text-fg">{{ g.team }}{{ g.to ? ` / @${g.to}` : "" }}</b></span>
        <code class="shrink-0 font-code">{{ g.id }}</code>
        <span v-if="g.source_context" class="min-w-0 flex-1 font-code break-words">
          <AppShorten :value="g.source_context" :max="28" />
        </span>
        <span v-if="pulledBy" class="shrink-0">pulled by {{ pulledBy }}</span>
        <NuxtLink v-if="g.report" :to="`/hub/report/${g.report}`" class="shrink-0">
          {{ shorten(g.report_title || "in a report", 20).text }}
        </NuxtLink>
      </div>
    </div>

    <!-- One move per row, plus a way to look at the thing. Everything else a guide can do still
         lives on its row in the full list further down the page. -->
    <div class="flex shrink-0 items-center gap-2">
      <!-- The move, then a way to look at it. Two buttons, whichever state the row is in. -->
      <button
        v-if="kind.action === 'link'"
        class="btn sm"
        @click="copy(g.url, $event.currentTarget)"
      >
        <AppIcon name="copy" /><span data-label>copy link</span>
      </button>
      <a :href="g.url" target="_blank" rel="noopener" class="btn sm">
        <AppIcon name="open" />open
      </a>
    </div>
  </li>
</template>
