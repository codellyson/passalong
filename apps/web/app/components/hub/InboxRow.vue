<!--
  One guide on the hub. Two lines: what it is, then who and when and where it got to — in words,
  not a badge. Ids, the repo, tags and the pull command are in the row's menu and on the guide.

  Rows that need you carry two buttons, and they are the same two on every such row: whether you
  are taking it, or whether it worked. The negative answer opens its reason in place, because the
  sender learns nothing from a no without a why.
-->
<script setup lang="ts">
import type { LaneRow } from "~/utils/lanes";

const props = defineProps<{ row: LaneRow }>();

const { onAck, onVerdict } = useHub();

const g = computed(() => props.row.g);
const key = computed(() => props.row.state?.key);
const status = computed(() => statusLine(props.row));

const TONE = { danger: "text-danger", accent: "text-accent", ok: "text-ok", "": "" } as const;

/** Which answer is open under the row: the ack or verdict form, or straight to its reason. */
const open = ref<null | "ack" | "pass" | "verdict" | "failed">(null);
const toggle = (which: "pass" | "failed") => {
  open.value = open.value === which ? null : which;
};

const who = computed(() => {
  const x = g.value;
  if (!x.mine) return { lead: "from", name: `@${x.from || "?"}` };
  if (!x.team) return null;
  return {
    lead: "to",
    name: `${x.team}${x.to ? ` / @${x.to}` : x.to_group ? ` / #${x.to_group}` : ""}`,
  };
});
</script>

<template>
  <!-- Separated by an inset shadow and rounded at the list's ends, as the old rows were: the list
       cannot clip its corners without clipping the row menu too. -->
  <li
    class="m-0 flex flex-wrap items-center gap-x-4 gap-y-2 bg-raised px-4 py-3 shadow-[inset_0_1px_0_var(--line)] first:rounded-t-[calc(var(--r-3)-1px)] first:shadow-none last:rounded-b-[calc(var(--r-3)-1px)]"
  >
    <div class="min-w-0 flex-1 basis-72">
      <a
        :href="g.url"
        target="_blank"
        rel="noopener"
        class="block text-base font-semibold leading-snug text-fg no-underline hover:text-accent"
      >{{ g.title || g.id }}</a>
      <p class="mt-1 mb-0 flex flex-wrap gap-x-1.5 font-ui text-sm text-muted">
        <span v-if="who">{{ who.lead }} <b class="font-medium text-fg">{{ who.name }}</b></span>
        <span><template v-if="who">· </template>{{ rel(g.created) }}</span>
        <span v-if="status.text" :class="TONE[status.tone]">· {{ status.text }}</span>
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <template v-if="key === 'unanswered'">
        <button class="btn primary sm" @click="onAck(g, true)">Take it</button>
        <button class="btn sm" :aria-expanded="open === 'pass'" @click="toggle('pass')">Pass</button>
      </template>
      <template v-else-if="key === 'waiting' || key === 'unjudged'">
        <button class="btn primary sm" @click="onVerdict(g, true)">It worked</button>
        <button class="btn sm" :aria-expanded="open === 'failed'" @click="toggle('failed')">
          It didn't
        </button>
      </template>
      <HubRowMenu :g="g" @ack="open = 'ack'" @verdict="open = 'verdict'" />
    </div>

    <HubAck
      v-if="(open === 'ack' || open === 'pass') && !g.mine"
      :g="g"
      :why="open === 'pass'"
      class="order-last"
      @done="open = null"
    />
    <HubVerdict
      v-if="(open === 'verdict' || open === 'failed') && !g.mine"
      :g="g"
      :why="open === 'failed'"
      class="order-last"
      @done="open = null"
    />
  </li>
</template>
