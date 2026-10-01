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

const { data, onAck, onCloseGuide } = useHub();

const g = computed(() => props.row.g);
const key = computed(() => props.row.state?.key);
const status = computed(() => statusLine(props.row));

const TONE = { danger: "text-danger", accent: "text-accent", ok: "text-ok", "": "" } as const;

/** Which answer is open under the row. */
const open = ref<null | "ack" | "pass" | "verdict">(null);
const toggle = (which: "pass" | "verdict") => {
  open.value = open.value === which ? null : which;
};

/** What kind of thing this is, as a word beside the title. See app/utils/kind.ts. */
const badge = computed(() => kindBadge(g.value.kind));

const sender = computed(() => fromName(g.value) || "them");

/**
 * The author says it is finished, without waiting for somebody who never opened it.
 *
 * It is the same call the hand-in row has had all along — the gate was only ever that you wrote
 * it — and it was reachable from one row out of all of them because the function was called
 * `closeHandedIn` and everyone believed the name.
 */
const closing = ref(false);
async function close() {
  if (closing.value) return;
  closing.value = true;
  try {
    await onCloseGuide(g.value);
  } finally {
    closing.value = false;
  }
}
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
       corners without clipping the row menu too. The ends take the list's own radius: its edge is a
       shadow outside it now, not a 1px border inside, so there is no inset to subtract. -->
  <li
    class="m-0 flex flex-wrap items-center gap-x-4 gap-y-2 bg-raised px-5 py-4 shadow-[inset_0_1px_0_var(--line)] first:rounded-t-[var(--r-3)] first:shadow-none last:rounded-b-[var(--r-3)]"
  >
    <div class="min-w-0 flex-1 basis-72">
      <p class="m-0 flex flex-wrap items-baseline gap-x-2">
        <span
          v-if="badge"
          :class="[
            'shrink-0 rounded-1 border px-1.5 py-0.5 font-ui text-xs font-medium uppercase tracking-wide',
            badge.class,
          ]"
          >{{ badge.label }}</span
        >
        <NuxtLink
          :to="`/hub/g/${g.id}`"
          class="text-base font-semibold leading-snug text-fg no-underline hover:text-accent"
          >{{ g.title || "Untitled guide" }}</NuxtLink
        >
      </p>
      <p class="mt-1 mb-0 flex flex-wrap gap-x-1.5 font-ui text-sm text-muted">
        <span v-if="who">
          {{ who.lead }} <b class="font-medium text-fg">{{ who.name }}</b>
          <template v-if="who.team"> in {{ who.team }}</template>
        </span>
        <span><template v-if="who">· </template>{{ rel(g.created) }}</span>
        <span v-if="status.text" :class="TONE[status.tone]">· {{ status.text }}</span>
        <!-- Lineage, both ways. Dropped when the rows were cut to two lines, and with it the only
             sign on the page that follow-ups exist. -->
        <span v-if="g.parent && g.parent_title">
          · follows
          <!-- The parent itself, not a hub search for its id: from an inbox row the parent is
               usually not in the list already loaded, so the search found nothing at all. The
               fallback is that old search, for a parent the API could not address. -->
          <a v-if="g.parent_url" :href="g.parent_url" target="_blank" rel="noopener">{{
            shorten(g.parent_title, 32).text
          }}</a>
          <NuxtLink v-else :to="{ path: '/hub', query: { q: g.parent } }">{{
            shorten(g.parent_title, 32).text
          }}</NuxtLink>
        </span>
        <span v-if="g.children">
          ·
          <!-- Straight to them, open beside the guide. This used to filter the hub to the children
               as rows, which is a list to click through one at a time and not a way to read them. -->
          <a :href="`${g.url}?with=all`" target="_blank" rel="noopener">
            {{ g.children }} {{ g.children === 1 ? "follow-up" : "follow-ups" }}
          </a>
        </span>
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <template v-if="key === 'unanswered'">
        <button class="btn primary sm" @click="onAck(g, true)">I'll do this</button>
        <button class="btn sm" :aria-expanded="open === 'pass'" @click="toggle('pass')">Not for me</button>
      </template>
      <button
        v-else-if="key === 'waiting' || key === 'unjudged'"
        class="btn sm"
        :aria-expanded="open === 'verdict'"
        @click="toggle('verdict')"
      >
        Tell {{ sender }} how it went
      </button>
      <!-- On the row, not three levels into a menu. Leaving this lane otherwise needs the person it
           was sent to to open it and say it worked; when they never do, the author is the one who
           knows the work is finished and had no verb for it but Archive, sitting under a "Terminals
           and agents" heading next to Delete. `consumed` is reversible and the menu still says
           "Unarchive". -->
      <button
        v-else-if="closable(g)"
        class="btn sm whitespace-nowrap"
        type="button"
        :disabled="closing"
        :title="`Take ${g.title || g.id} off the board. Whoever it went to is told, and you can put it back.`"
        @click="close"
      >
        {{ closing ? "Archiving…" : "Archive" }}
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
