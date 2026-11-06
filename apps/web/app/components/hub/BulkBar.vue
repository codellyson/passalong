<!--
  The board's bulk bar: what to do with every ticked card at once. Give to…, Move to…, Run alone…,
  Archive… and Clear. Run alone ticks or unticks Safe to run alone on many at once, for the runner
  (`passalong work --watch`) to pick up. Each says how many it will touch, because a selection can mix work each act applies to
  and work it does not, and each asks in place before it does anything: pick, then confirm or keep
  them. The same routes as the single acts (`onBulk`); the board reloads after.

  Ink and flat, over the foot of the page, taking no room until something is ticked, so the board
  does not move when you tick.
-->
<script setup lang="ts">
import type { Work } from "~/types/hub";

type Person = { id: string; label: string; to: string };
const props = defineProps<{
  picked: Work[];
  people: Person[] | null;
  groups: { slug: string; name: string }[];
  me: { id: string; to: string } | null;
  team: string;
}>();
const emit = defineEmits<{ clear: []; said: [text: string] }>();
const { onBulk } = useHub();

const givable = computed(() => props.picked.filter((g) => g.team && g.stage !== "done"));
const toDraft = computed(() =>
  props.picked.filter((g) => g.stage === "todo" && !g.held_by?.length),
);
const toReady = computed(() => props.picked.filter((g) => g.stage === "draft"));
const archivable = computed(() => props.picked.filter((g) => g.manage && g.status !== "done"));
/** Work still to be done, ticked for the runner or not. */
const toAlone = computed(() => props.picked.filter((g) => g.status !== "done" && !g.alone));
const fromAlone = computed(() => props.picked.filter((g) => g.status !== "done" && g.alone));

const choices = computed(() =>
  props.people
    ? [
        ...(props.me ? [{ to: props.me.to, label: "You" }] : []),
        ...props.people.filter((p) => p.id !== props.me?.id),
        ...props.groups.map((t) => ({ to: `#${t.slug}`, label: t.name || t.slug })),
        { to: "", label: `Everyone in ${props.team}` },
      ]
    : [],
);

const n = (k: number) => `${k} ${k === 1 ? "piece of work" : "pieces of work"}`;

/** Where the bar is: its acts, a choice to make, or a question before an act. */
type Ask = {
  text: string;
  verb: string;
  ids: string[];
  act: Parameters<typeof onBulk>[1];
  done: string;
};
const step = ref<"" | "give" | "move" | "alone">("");
const asking = ref<Ask | null>(null);
const busy = ref(false);

function give(c: { to: string; label: string }) {
  const ids = givable.value.map((g) => g.id);
  asking.value = {
    text: `Give ${n(ids.length)} to ${c.label}?`,
    verb: "Give",
    ids,
    act: { give: c.to },
    done: `Gave ${n(ids.length)} to ${c.label}.`,
  };
}
function move(to: "draft" | "todo") {
  const ids = (to === "draft" ? toDraft.value : toReady.value).map((g) => g.id);
  asking.value =
    to === "draft"
      ? {
          text: `Move ${n(ids.length)} to Draft? Nobody is told until it is Ready again.`,
          verb: "Move to Draft",
          ids,
          act: { status: "draft" },
          done: `Moved ${n(ids.length)} to Draft.`,
        }
      : {
          text: `Make ${n(ids.length)} ready? Whoever each is for is told.`,
          verb: "Make ready",
          ids,
          act: { status: "ready" },
          done: `${n(ids.length)} ready, in To do.`,
        };
}
function alone(on: boolean) {
  const ids = (on ? toAlone.value : fromAlone.value).map((g) => g.id);
  asking.value = on
    ? {
        text: `Mark ${n(ids.length)} safe to run alone? The runner may then pick each up with nobody watching.`,
        verb: "Mark safe",
        ids,
        act: { alone: true },
        done: `${n(ids.length)} marked safe to run alone.`,
      }
    : {
        text: `Stop ${n(ids.length)} running alone? They wait for a person again.`,
        verb: "Unmark",
        ids,
        act: { alone: false },
        done: `${n(ids.length)} no longer run alone.`,
      };
}
function archive() {
  const ids = archivable.value.map((g) => g.id);
  asking.value = {
    text: `Archive ${n(ids.length)}? They go to Done; nothing is deleted.`,
    verb: "Archive",
    ids,
    act: { status: "done" },
    done: `Archived ${n(ids.length)}.`,
  };
}
async function confirm() {
  const a = asking.value;
  if (!a) return;
  busy.value = true;
  const ok = await onBulk(a.ids, a.act);
  busy.value = false;
  emit("said", ok === a.ids.length ? a.done : `${ok} of ${a.ids.length} went through.`);
  reset();
  emit("clear");
}
function reset() {
  asking.value = null;
  step.value = "";
}
watch(
  () => props.picked.length,
  (k) => {
    if (!k) reset();
  },
);

/**
 * Drawn from the bar's own colours, which flip with the theme: ink is dark on a light page and
 * light on a dark one. White at a low opacity vanished on the light bar a dark page gets, so the
 * buttons there had no edge at all (2026-11-06).
 */
const ghost =
  "btn sm static gap-1.5 !border-transparent !bg-transparent !text-on-ink hover:!bg-on-ink/10 aria-expanded:!bg-on-ink/10 max-sm:!h-auto max-sm:!flex-col max-sm:!gap-1 max-sm:!rounded-2 max-sm:!px-2 max-sm:!py-1.5 max-sm:!text-[0.6875rem]";
/** A choice under an act (who to give it to, where to move it): outlined, so it reads as a button. */
const choice =
  "btn sm static !border-on-ink/25 !bg-transparent !text-on-ink hover:!border-on-ink/50 hover:!bg-on-ink/10";
const solid = "btn sm !border-on-ink !bg-on-ink !text-ink";
</script>

<template>
  <div
    v-if="picked.length"
    class="appears fixed bottom-[calc(var(--dock)+1.5rem)] left-1/2 z-30 flex w-[min(48rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-3 rounded-3 border border-ink bg-ink px-3 py-2.5 text-on-ink shadow-[0_12px_32px_-8px_oklch(0_0_0/0.45)] md:left-[calc(50%+7.5rem)] md:w-[min(48rem,calc(100vw-17rem))]"
    role="region"
    aria-label="Selected work"
    @keydown.esc="asking || step ? reset() : emit('clear')"
  >
    <!-- On a phone, one row like a phone's own selection toolbar: each act an icon over a short
         word, so all of them fit beside the count instead of breaking over three ragged rows
         (2026-11-06). The choices and questions below still wrap: they hold sentences. -->
    <div class="flex flex-wrap items-center gap-x-1 gap-y-2 font-ui text-sm max-sm:flex-nowrap max-sm:justify-between">
      <!-- What the acts below apply to, first and loudest: the count in a badge. -->
      <span class="mr-1 flex items-center gap-2 pr-2 font-medium">
        <span class="grid h-6 min-w-6 place-items-center rounded-full bg-coral px-1.5 text-xs font-semibold tabular-nums text-accent-fg">{{ picked.length }}</span>
        <span class="max-sm:sr-only">selected</span>
      </span>
      <span class="mr-1 hidden h-5 w-px bg-on-ink/20 sm:block" aria-hidden="true" />
      <button v-if="people && givable.length" :class="ghost" type="button" :aria-expanded="step === 'give'" @click="step = step === 'give' ? '' : 'give'; asking = null">
        <AppIcon name="give" /><span class="max-sm:hidden">Give to…</span><span class="sm:hidden">Give</span>
      </button>
      <button v-if="toDraft.length || toReady.length" :class="ghost" type="button" :aria-expanded="step === 'move'" @click="step = step === 'move' ? '' : 'move'; asking = null">
        <AppIcon name="board" /><span class="max-sm:hidden">Move to…</span><span class="sm:hidden">Move</span>
      </button>
      <button v-if="toAlone.length || fromAlone.length" :class="ghost" type="button" :aria-expanded="step === 'alone'" @click="step = step === 'alone' ? '' : 'alone'; asking = null">
        <AppIcon name="run" /><span class="max-sm:hidden">Run alone…</span><span class="sm:hidden">Run alone</span>
      </button>
      <button v-if="archivable.length" :class="ghost" type="button" @click="step = ''; archive()">
        <AppIcon name="archive" /><span class="max-sm:hidden">Archive {{ archivable.length }}…</span><span class="sm:hidden">Archive</span>
      </button>
      <button
        class="grid size-8 sm:ml-auto shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-on-ink/70 hover:bg-on-ink/10 hover:text-on-ink"
        type="button"
        title="Clear the selection (Esc)"
        aria-label="Clear the selection"
        @click="emit('clear')"
      >
        <AppIcon name="x" />
      </button>
    </div>

    <div v-if="asking" class="flex flex-wrap items-center gap-2 border-t border-on-ink/15 pt-3 font-ui text-sm" role="alert">
      <span class="mr-auto">{{ asking.text }}</span>
      <button :class="solid" type="button" :disabled="busy" @click="confirm">{{ busy ? "Working…" : asking.verb }}</button>
      <button :class="choice" type="button" :disabled="busy" @click="asking = null">Keep them</button>
    </div>
    <div v-else-if="step === 'give'" class="flex flex-wrap items-center gap-2 border-t border-on-ink/15 pt-3 font-ui text-sm" role="group" aria-label="Give to">
      <span class="mr-2 text-on-ink/70">Give {{ givable.length }} to</span>
      <button v-for="c in choices" :key="c.to || 'everyone'" :class="choice" type="button" @click="give(c)">{{ c.label }}</button>
    </div>
    <div v-else-if="step === 'alone'" class="flex flex-wrap items-center gap-2 border-t border-on-ink/15 pt-3 font-ui text-sm" role="group" aria-label="Run alone">
      <button v-if="toAlone.length" :class="choice" type="button" @click="alone(true)">Mark safe to run alone ({{ toAlone.length }})</button>
      <button v-if="fromAlone.length" :class="choice" type="button" @click="alone(false)">Unmark ({{ fromAlone.length }})</button>
    </div>
    <div v-else-if="step === 'move'" class="flex flex-wrap items-center gap-2 border-t border-on-ink/15 pt-3 font-ui text-sm" role="group" aria-label="Move to">
      <span class="mr-2 text-on-ink/70">Move to</span>
      <button v-if="toReady.length" :class="choice" type="button" @click="move('todo')">To do ({{ toReady.length }})</button>
      <button v-if="toDraft.length" :class="choice" type="button" @click="move('draft')">Draft ({{ toDraft.length }})</button>
    </div>
  </div>
</template>
