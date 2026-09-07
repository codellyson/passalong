<!--
  One guide in the list, in the same language as the board: a stripe, a badge for the state, one
  action, and everything else behind the overflow.

  Three lines, and the order is the point. What state it is in and who it is with; what it is;
  then the identifiers — id, repo, what it assumes, tags — which are what you need once you have
  already decided this is the row you wanted. The old row ran all eleven facts together in one
  grey paragraph and gave eight actions equal weight.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";
import type { GuideState } from "~/utils/guide-state";

const props = defineProps<{ g: Guide; state: GuideState | null }>();

const judging = ref(false);

const pull = computed(() => `passalong pull ${props.g.id}`);

/** The tail of the first line: the one fact that explains the badge. */
const tail = computed(() => {
  const g = props.g;
  switch (props.state?.key) {
    case "waiting":
    case "flight":
      return "not pulled yet";
    case "unjudged":
      return "nobody has said whether it worked";
    case undefined:
      return g.mine && !g.team ? "addressed to nobody" : "";
    default:
      return g.pulls ? plural(g.pulls, "pull") : "";
  }
});

/** Who has taken it, for the person who handed it over. Nobody else is shown the list. */
const pulledBy = computed(() =>
  props.g.mine && props.g.pulled_by?.length
    ? props.g.pulled_by.map((p) => (p.handle ? `@${p.handle}` : "link")).join(", ")
    : null,
);

/** Printed in full on the row. It is the most valuable thing the product produces. */
const verdict = computed(() => {
  const v = props.g.verdict;
  if (!v || v.ok) return null;
  const who = v.by ? `@${v.by}` : "someone";
  return `${who}: ${v.note || "no reason given"}`;
});
</script>

<template>
  <!-- The row's corner radius is the list's minus its border, because the row sits a pixel inside
       it. Matching them exactly leaves the row's fill short of the border on the curve, and the
       page shows through as a faint second arc at each corner. -->
  <li
    class="flex flex-wrap items-start gap-x-4 gap-y-2 border-t border-l-[3px] border-t-line border-r-0 border-b-0 bg-raised px-4 py-3.5 first:rounded-t-[calc(var(--r-3)-1px)] first:border-t-0 last:rounded-b-[calc(var(--r-3)-1px)]"
    :class="state?.stripe ?? 'border-l-line'"
  >
    <div class="min-w-0 flex-1 basis-72">
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-ui text-sm text-muted">
        <!-- No badge when nothing is in transit: a guide shared with nobody, or closed out. -->
        <span
          v-if="state"
          class="rounded-1 px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase"
          :class="state.badge"
        >{{ state.label }}</span>
        <!-- Three cases, not two. A guide of yours that went to a team says where it went; one
             handed to you says who from; and one you shared with nobody says neither, because the
             tail after the date already says "addressed to nobody". Collapsing the third into the
             second printed "from @?" on your own guides. -->
        <span v-if="g.mine && g.team">to <b class="font-medium text-fg">{{ g.team }}{{ g.to ? ` / @${g.to}` : "" }}</b></span>
        <span v-else-if="!g.mine">
          from <b class="font-medium text-fg">@{{ g.from || "?" }}</b>
          <template v-if="g.team"> in {{ g.team }}</template>
        </span>
        <span>{{ rel(g.created) }}</span>
        <span v-if="g.stale" class="font-medium text-warn">· over a week</span>
        <span v-if="tail">· {{ tail }}</span>
      </div>

      <a
        :href="g.url"
        target="_blank"
        rel="noopener"
        class="mt-1.5 block text-base font-semibold leading-snug text-fg no-underline hover:text-accent"
      >{{ g.title || g.id }}</a>

      <p
        v-if="verdict"
        class="mt-1.5 mb-0 border-l-2 border-l-danger py-0.5 pl-2 font-ui text-sm text-danger"
      >
        {{ verdict }}
      </p>

      <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-code text-xs text-muted">
        <span>{{ g.id }}</span>
        <template v-if="g.source_context"><span>·</span><span>{{ g.source_context }}</span></template>
        <template v-if="g.stack_assumptions?.length">
          <span>·</span><span>assumes {{ g.stack_assumptions.join(", ") }}</span>
        </template>
        <template v-if="pulledBy"><span>·</span><span>pulled by {{ pulledBy }}</span></template>
        <span v-for="t in g.tags || []" :key="t">#{{ t }}</span>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <button
        v-if="state?.action === 'pull'"
        class="btn primary sm"
        :title="pull"
        @click="copy(pull, $event.currentTarget)"
      >
        copy pull
      </button>
      <!-- Labelled "read the reason" until the reason moved onto the row two lines above it, at
           which point the button led where the eye had just been. It keeps the danger outline:
           the row is still the urgent one, and opening it is still the only move. -->
      <a
        v-else-if="state?.action === 'open-urgent'"
        :href="g.url"
        target="_blank"
        rel="noopener"
        class="btn outline danger sm"
      >open</a>
      <button
        v-else-if="state?.action === 'link'"
        class="btn sm"
        @click="copy(g.url, $event.currentTarget)"
      >
        copy link
      </button>
      <button
        v-else-if="state?.action === 'verdict'"
        class="btn outline warn sm"
        @click="judging = !judging"
      >
        did it work?
      </button>
      <a v-else :href="g.url" target="_blank" rel="noopener" class="btn sm">open</a>

      <HubRowMenu :g="g" @verdict="judging = true" />
    </div>

    <!-- Full width and last, so opening it pushes nothing sideways. -->
    <HubVerdict v-if="judging && !g.mine" :g="g" class="order-last" @done="judging = false" />
  </li>
</template>
