<!--
  One guide on the hub. Two lines: what it is, then who and when and where it got to — in words,
  not a badge, and by name rather than by handle or slug. Ids, tags and the terminal commands are
  in the row's menu and on the guide.

  Rows that need you ask one question at a time. Something sent to you asks whether you are taking
  it. Once you have, it waits until you are ready to say how it went, instead of asking whether it
  worked the moment you said yes.
-->
<script setup lang="ts">
import type { LaneRow } from "~/utils/lanes";

const props = defineProps<{ row: LaneRow }>();

const { data, onAck } = useHub();

const g = computed(() => props.row.g);
const key = computed(() => props.row.state?.key);
const status = computed(() => statusLine(props.row));

const TONE = { danger: "text-danger", accent: "text-accent", ok: "text-ok", "": "" } as const;

/** Which answer is open under the row. */
const open = ref<null | "ack" | "pass" | "verdict">(null);
const toggle = (which: "pass" | "verdict") => {
  open.value = open.value === which ? null : which;
};

const sender = computed(() => fromName(g.value) || "them");
const team = computed(() => teamLabel(g.value, data.value.me?.teams));

/** "from Bami in Khaime", "to Ada in Khaime", "to the Frontend group in Khaime", "to Khaime". */
const who = computed(() => {
  const x = g.value;
  if (!x.mine) return { lead: "from", name: fromName(x) || "someone", team: team.value };
  if (!x.team) return null;
  if (x.to) return { lead: "to", name: toName(x), team: team.value };
  if (x.to_group)
    return { lead: "to the", name: `${x.to_group_name || x.to_group} group`, team: team.value };
  return { lead: "to", name: team.value, team: "" };
});
</script>

<template>
  <!-- Separated by an inset shadow and rounded at the list's ends: the list cannot clip its
       corners without clipping the row menu too. -->
  <li
    class="m-0 flex flex-wrap items-center gap-x-4 gap-y-2 bg-raised px-4 py-3 shadow-[inset_0_1px_0_var(--line)] first:rounded-t-[calc(var(--r-3)-1px)] first:shadow-none last:rounded-b-[calc(var(--r-3)-1px)]"
  >
    <div class="min-w-0 flex-1 basis-72">
      <a
        :href="g.url"
        target="_blank"
        rel="noopener"
        class="block text-base font-semibold leading-snug text-fg no-underline hover:text-accent"
      >{{ g.title || "Untitled guide" }}</a>
      <p class="mt-1 mb-0 flex flex-wrap gap-x-1.5 font-ui text-sm text-muted">
        <span v-if="who">
          {{ who.lead }} <b class="font-medium text-fg">{{ who.name }}</b>
          <template v-if="who.team"> in {{ who.team }}</template>
        </span>
        <span><template v-if="who">· </template>{{ rel(g.created) }}</span>
        <span v-if="status.text" :class="TONE[status.tone]">· {{ status.text }}</span>
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <template v-if="key === 'unanswered'">
        <button class="btn primary sm" @click="onAck(g, true)">Take it</button>
        <button class="btn sm" :aria-expanded="open === 'pass'" @click="toggle('pass')">Pass</button>
      </template>
      <button
        v-else-if="key === 'waiting' || key === 'unjudged'"
        class="btn sm"
        :aria-expanded="open === 'verdict'"
        @click="toggle('verdict')"
      >
        Tell {{ sender }} how it went
      </button>
      <HubRowMenu :g="g" @ack="open = 'ack'" @verdict="open = 'verdict'" />
    </div>

    <HubAck
      v-if="(open === 'ack' || open === 'pass') && !g.mine"
      :g="g"
      :why="open === 'pass'"
      class="order-last"
      @done="open = null"
    />
    <HubVerdict v-if="open === 'verdict' && !g.mine" :g="g" class="order-last" @done="open = null" />
  </li>
</template>
