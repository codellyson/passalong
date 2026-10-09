<!--
  One guide on the hub. Two lines: what it is, then who and when and where it got to — in words,
  not a badge, and by name rather than by handle or slug. Ids, tags and the terminal commands are
  in the row's menu and on the guide.

  Rows that need you ask one question at a time. Something sent to you asks whether you are taking
  it. Once you have, it waits until you are ready to say how it went, instead of asking whether it
  worked the moment you said yes.
-->
<script setup lang="ts">
import { expiryLine } from "~/utils/expiry";
import type { LaneRow } from "~/utils/lanes";

const props = defineProps<{ row: LaneRow }>();

const { data, onAck, onCloseGuide } = useHub();

const g = computed(() => props.row.g);
const key = computed(() => props.row.state?.key);
const status = computed(() => statusLine(props.row));
const expiry = computed(() => expiryLine(g.value));

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
  if (x.to_group?.startsWith("~"))
    return { lead: "to", name: x.to_group_name || "", team: team.value };
  if (x.to_group)
    return { lead: "to the", name: `${x.to_group_name || x.to_group} group`, team: team.value };
  return { lead: "to", name: team.value, team: "" };
});
</script>

<template>
  <!-- A row of the guides table (GuideTable.vue). The answer a row asks for opens in a row of its
       own beneath it, as a failed verdict always has. -->
  <tr>
    <td><HubSelectBox :id="g.id" :title="g.title" :archived="g.status === 'consumed'" :allowed="Boolean(g.manage || g.mine)" /></td>
    <td class="min-w-52 max-w-[22rem]">
      <div class="flex items-start gap-3">
        <HubGuideThumbnail :image="g.preview_image" :guide="g.id" :title="g.title || 'Untitled guide'" />
        <div class="min-w-0 flex-1">
      <NuxtLink :to="`/hub/g/${g.id}`" class="line-clamp-2 font-medium text-fg no-underline hover:text-accent">{{ g.title || "Untitled guide" }}</NuxtLink>
      <!-- A word under the title only where it tells rows apart: a bug or a task among handoffs, a
           guide that follows another, one that has follow-ups. "transfer" was on nearly every row and
           said nothing there. -->
      <span
        v-if="(badge && g.kind !== 'transfer') || (g.parent && g.parent_title) || g.children"
        class="mt-1 flex flex-wrap gap-x-2 text-xs text-muted"
      >
        <span v-if="badge && g.kind !== 'transfer'">{{ badge.label.toLowerCase() }}</span>
        <span v-if="g.parent && g.parent_title">
          follows
          <a v-if="g.parent_url" :href="g.parent_url" target="_blank" rel="noopener">{{ shorten(g.parent_title, 32).text }}</a>
          <NuxtLink v-else :to="{ path: '/hub', query: { q: g.parent } }">{{ shorten(g.parent_title, 32).text }}</NuxtLink>
        </span>
        <a v-if="g.children" :href="`${g.url}?with=all`" target="_blank" rel="noopener">
          {{ g.children }} {{ g.children === 1 ? "follow-up" : "follow-ups" }}
        </a>
      </span>
      <!-- The hub's capped width cannot hold separate summary and recipient columns. Keep both
           beneath the title, where they remain readable at every width. -->
      <span v-if="g.summary" class="mt-1 line-clamp-2 block text-xs text-muted">{{ g.summary }}</span>
      <span v-if="who || expiry" class="mt-0.5 block text-xs text-muted">
        <span v-if="who">
          {{ who.lead }} <b class="font-medium text-fg">{{ who.name }}</b><template v-if="who.team"> · {{ who.team }}</template>
        </span>
        <span v-if="who && expiry"> · </span>
        <span
          v-if="expiry"
          class="whitespace-nowrap"
          :class="expiry.soon ? 'text-warn' : 'text-muted'"
          :title="expiry.why"
        >{{ expiry.text }}</span>
      </span>
      </div>
      </div>
    </td>
    <td :class="TONE[status.tone] || 'text-muted'">{{ status.text || "—" }}</td>
    <td class="whitespace-nowrap text-muted tabular-nums">{{ rel(g.created) }}</td>
    <td class="text-right whitespace-nowrap">
      <span class="inline-flex items-center gap-2">
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
        <!-- On the row, not three levels into a menu: the author knows the work is finished and
             had no verb for it but Archive under a "Terminals and agents" heading next to Delete.
             `consumed` is reversible and the menu still says "Unarchive". -->
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
      </span>
    </td>
  </tr>
  <tr v-if="((open === 'ack' || open === 'pass') || open === 'verdict') && !g.mine" class="run">
    <td />
    <td colspan="4" class="pb-3">
      <HubAck v-if="open === 'ack' || open === 'pass'" :g="g" :why="open === 'pass'" @done="open = null" />
      <HubVerdict v-else :g="g" @done="open = null" />
    </td>
  </tr>
</template>
