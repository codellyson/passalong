<!--
  One card on the Work board. The register's anatomy in a card: the title (its link covers the
  card), "Changed · <what>" in ink with the ink bar at the left edge when something changed
  since you last looked (the server's `changed`), then the project's line mark and name and the
  age in tabular figures. In progress adds one muted line: the state word when the hold needs
  somebody ("Went quiet", "Waiting on you"), who holds it, and their last progress note. Done is
  quiet: muted title, how it got there, and when.

  Two controls: a quiet tick that selects it for the bulk bar (shown on hover or focus, and on
  every card once one is ticked; always on a touch screen), and the menu button, which opens the
  card's actions (HubCardMenu) — the keyboard's way to do everything dragging does. Right-clicking
  the card opens the same menu. A card that has just moved settles into its new place.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { Work } from "~/types/hub";
import { age, toneOf } from "~/utils/projects";
import { type RunnerRow, runnerFor } from "~/utils/runner";

const props = defineProps<{
  work: Work;
  now: number;
  draggable: boolean;
  moving: boolean;
  /** Just moved, and now where the server put it. */
  settling?: boolean;
  /** Has a tick; ticked; and whether any card is ticked, which keeps every tick shown. */
  pickable?: boolean;
  picked?: boolean;
  picking?: boolean;
}>();
const emit = defineEmits<{
  menu: [x: number, y: number];
  drag: [e: DragEvent];
  dragend: [];
  pick: [];
}>();

const g = computed(() => props.work);

// Whether anything will take it, for work ticked Safe to run alone and still waiting: ticked work
// with no repo, or none a live runner serves, sat on the board looking ready to run (2026-11-06).
const { api, signedIn } = useHub();
const runnersQ = useQuery({
  queryKey: ["runners"],
  queryFn: async () => (await api<{ runners: RunnerRow[] }>("/v1/runners"))?.runners ?? [],
  enabled: computed(() => signedIn.value && Boolean(props.work.alone)),
  staleTime: 60_000,
});
const aloneSays = computed(() => {
  const w = g.value;
  if (!w.alone || w.status !== "ready" || w.held_by?.length) return null;
  if (w.runs_in === undefined) return null;
  if (!w.runs_in) return { text: "Pick a repo on its page so a runner can take it" };
  if (!runnersQ.data.value) return null;
  return runnerFor(runnersQ.data.value, w.runs_in)
    ? null
    : { text: `No runner for ${w.runs_in.split("/").pop()} is running` };
});
const done = computed(() => g.value.stage === "done");
const outcome = computed(() =>
  done.value && g.value.outcome ? (g.value.outcome === "archived" ? "Archived" : "Finished") : "",
);

/** The hold a card leads with: one that needs somebody first, else the first. */
const lead = computed(
  () =>
    (g.value.held_by ?? []).find((h) => h.health === "quiet" || h.health === "asking") ??
    g.value.held_by?.[0],
);
const STATE = { quiet: "Went quiet", asking: "Waiting on you" } as const;
/** A person plainly, an agent with what it is (DESIGN.md, "Who did it"). */
const holder = computed(() => {
  const h = lead.value;
  if (!h) return "";
  const who = h.you ? (h.agent ? "Your agent" : "You") : h.agent ? `${h.name}, an agent` : h.name;
  const more = (g.value.held_by?.length ?? 0) - 1;
  return more > 0 ? `${who} +${more}` : who;
});

/** Done: since it finished. Otherwise since anything last happened: its holder heard from, or an edit. */
const since = computed(() => {
  const edited = g.value.updated || g.value.created;
  if (done.value) return edited;
  const heard = (g.value.held_by ?? [])
    .map((h) => h.since)
    .sort()
    .at(-1);
  return heard && heard > edited ? heard : edited;
});

function fromButton(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  emit("menu", r.right - 240, r.bottom + 4);
}
function fromContext(e: MouseEvent) {
  // The context-menu key reports no pointer position, so the menu opens at the card instead.
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  emit("menu", e.clientX || r.left + 16, e.clientY || r.top + 16);
}
</script>

<template>
  <li
    class="group relative flex flex-col gap-1 overflow-hidden rounded-2 bg-raised py-2 pr-2 pl-4 shadow-edge transition-opacity motion-reduce:transition-none"
    :class="[moving ? 'opacity-60' : '', settling ? 'settle' : '', picked ? 'ring-2 ring-ink' : '']"
    :draggable="draggable"
    :aria-busy="moving || undefined"
    @dragstart="emit('drag', $event)"
    @dragend="emit('dragend')"
    @contextmenu.prevent="fromContext"
  >
    <span v-if="g.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
    <div class="flex items-start gap-2">
      <NuxtLink
        :to="`/hub/w/${g.id}`"
        class="line-clamp-3 min-w-0 grow font-ui text-sm font-medium text-pretty text-fg no-underline outline-none after:absolute after:inset-0 after:rounded-2 hover:underline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-[var(--focus)] focus-visible:after:outline-solid"
      >{{ g.title || "Untitled" }}</NuxtLink>
      <!-- No room taken while hidden, so a narrow column's title keeps its width. -->
      <input
        v-if="pickable"
        type="checkbox"
        class="relative z-10 mt-1 -ml-2 h-4 w-0 shrink-0 cursor-pointer opacity-0 transition-[width,margin,opacity] duration-150 group-hover:ml-0 group-hover:w-4 group-hover:opacity-100 focus-visible:ml-0 focus-visible:w-4 focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:ml-0 [@media(hover:none)]:w-4 [@media(hover:none)]:opacity-100"
        :class="picking || picked ? '!ml-0 !w-4 !opacity-100' : ''"
        :checked="picked"
        :aria-label="`Select ${g.title || 'this work'}`"
        @change="emit('pick')"
      >
      <button
        type="button"
        class="relative z-10 grid size-6 shrink-0 cursor-pointer place-items-center rounded-1 border-0 bg-transparent p-0 text-muted hover:bg-surface hover:text-fg"
        aria-haspopup="menu"
        :aria-label="`Actions for ${g.title || 'this work'}`"
        @click.stop="fromButton"
      >
        <AppIcon name="more" />
      </button>
    </div>
    <p v-if="g.changed" class="m-0 font-ui text-xs font-medium text-changed">Changed · {{ g.changed }}</p>
    <!-- At most two lines, so one long note cannot make a card a page tall: the state and the person
         come first and are never what is cut; the note ends in "…" and is whole on hover. In a
         narrow column the note goes first. -->
    <p
      v-if="g.stage === 'working' && lead"
      class="m-0 line-clamp-2 pr-2 font-ui text-xs text-muted"
      :title="lead.note ? `${holder} · “${lead.note}”` : undefined"
    >
      <template v-if="lead.health === 'quiet' || lead.health === 'asking'">
        <span class="font-medium text-fg">{{ STATE[lead.health] }}</span> ·
      </template>
      <span class="whitespace-nowrap text-fg">{{ holder }}</span>
      <span v-if="lead.note" class="hidden @[60rem]:inline"> · “{{ lead.note }}”</span>
    </p>
    <p class="m-0 flex items-center gap-2 pr-2 font-ui text-xs text-muted">
      <template v-if="g.project">
        <span class="project-mark h-3.5 w-[3px] shrink-0 rounded-[1px]" :data-tone="toneOf(g.project)" aria-hidden="true" />
        <!-- One line, as in the rail: a long name ends in "…" and is whole on hover. -->
        <span class="min-w-0 truncate" :title="g.project.title">{{ g.project.title }}</span>
      </template>
      <span v-else>Not in a project</span>
      <!-- Not said twice: "Changed · Finished" already says how it got here. -->
      <span v-if="outcome && g.changed !== outcome">· {{ outcome }}</span>
      <!-- Ticked for the runner, so a glance at the board shows what an agent may pick up alone. -->
      <span v-if="g.alone && !done" class="whitespace-nowrap" title="Safe to run alone: the runner may pick it up">· Runs alone</span>
      <span class="ml-auto shrink-0 tabular-nums">{{ age(since, now) }}</span>
    </p>
    <!-- Said on the card, so nobody waits on work nothing will take; its page says what to do. A line
         of its own: beside the project and the age it squeezed both into a column. -->
    <p v-if="aloneSays" class="m-0 font-ui text-xs text-warn">{{ aloneSays.text }}</p>
  </li>
</template>
