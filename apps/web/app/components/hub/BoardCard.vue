<!--
  One card on the Work board. The register's anatomy in a card: the title (its link covers the
  card), "Changed · <what>" in coral text with the coral bar at the left edge when something changed
  since you last looked (the server's `changed`), then the project's line mark and name and the
  age in tabular figures. In progress adds one muted line: the state word when the hold needs
  somebody ("Went quiet", "Waiting on you"), who holds it, and their last progress note. Done is
  quiet: muted title, how it got there, and when.

  One control: the menu button, which opens the card's actions (HubCardMenu) — the keyboard's way
  to do everything dragging does. Right-clicking the card opens the same menu.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";
import { age, toneOf } from "~/utils/projects";

const props = defineProps<{ guide: Guide; now: number; draggable: boolean; moving: boolean }>();
const emit = defineEmits<{ menu: [x: number, y: number]; drag: [e: DragEvent]; dragend: [] }>();

const g = computed(() => props.guide);
const done = computed(() => g.value.stage === "done");

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
    class="relative flex flex-col gap-1 overflow-hidden rounded-2 bg-raised py-3 pr-2 pl-4 shadow-edge transition-opacity motion-reduce:transition-none"
    :class="moving ? 'opacity-40' : ''"
    :draggable="draggable"
    :aria-busy="moving || undefined"
    @dragstart="emit('drag', $event)"
    @dragend="emit('dragend')"
    @contextmenu.prevent="fromContext"
  >
    <span v-if="g.changed" class="absolute inset-y-0 left-0 w-[3px] bg-coral" aria-hidden="true" />
    <div class="flex items-start gap-2">
      <NuxtLink
        :to="`/hub/g/${g.id}`"
        class="line-clamp-3 min-w-0 grow font-ui text-sm font-medium text-pretty no-underline outline-none after:absolute after:inset-0 after:rounded-2 hover:underline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-[var(--focus)] focus-visible:after:outline-solid"
        :class="done ? 'text-muted' : 'text-fg'"
      >{{ g.title || "Untitled" }}</NuxtLink>
      <button
        type="button"
        class="relative z-10 -mt-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-1 border-0 bg-transparent p-0 text-muted hover:bg-surface hover:text-fg"
        aria-haspopup="menu"
        :aria-label="`Actions for ${g.title || 'this work'}`"
        @click.stop="fromButton"
      >
        <AppIcon name="more" />
      </button>
    </div>
    <p v-if="g.changed" class="m-0 font-ui text-xs font-medium text-accent">Changed · {{ g.changed }}</p>
    <p v-if="g.stage === 'working' && lead" class="m-0 line-clamp-1 pr-2 font-ui text-xs text-muted">
      <template v-if="lead.health === 'quiet' || lead.health === 'asking'">
        <span class="font-medium text-fg">{{ STATE[lead.health] }}</span> ·
      </template>
      <span class="text-fg">{{ holder }}</span>
      <template v-if="lead.note"> · “{{ lead.note }}”</template>
    </p>
    <p class="m-0 flex items-center gap-2 pr-2 font-ui text-xs text-muted">
      <template v-if="g.project">
        <span class="project-mark h-3.5 w-[3px] shrink-0 rounded-[1px]" :data-tone="toneOf(g.project)" aria-hidden="true" />
        <span class="min-w-0 break-words">{{ g.project.title }}</span>
      </template>
      <span v-if="done && g.outcome"><template v-if="g.project">· </template>{{ g.outcome === "archived" ? "Archived" : "Finished" }}</span>
      <span class="ml-auto shrink-0 tabular-nums">{{ age(since, now) }}</span>
    </p>
  </li>
</template>
