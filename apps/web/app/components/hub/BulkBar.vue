<!--
  The board's bulk bar: what to do with every ticked card at once. Give to…, Move to…, Archive…
  and Clear. Each says how many it will touch, because a selection can mix work each act applies to
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
const step = ref<"" | "give" | "move">("");
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

const ghost = "btn sm static !border-white/25 !bg-transparent !text-on-ink hover:!bg-white/10";
const solid = "btn sm !border-bg !bg-bg !text-fg";
</script>

<template>
  <div
    v-if="picked.length"
    class="fixed bottom-[calc(var(--dock)+1.5rem)] left-1/2 z-30 flex w-[min(48rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-3 rounded-3 border border-ink bg-ink px-4 py-3 text-on-ink md:left-[calc(50%+7.5rem)] md:w-[min(48rem,calc(100vw-17rem))]"
    role="region"
    aria-label="Selected work"
    @keydown.esc="asking || step ? reset() : emit('clear')"
  >
    <div class="flex flex-wrap items-center gap-2 font-ui text-sm">
      <span class="mr-auto font-medium tabular-nums">{{ n(picked.length) }} selected</span>
      <button v-if="people && givable.length" :class="ghost" type="button" :aria-expanded="step === 'give'" @click="step = step === 'give' ? '' : 'give'; asking = null">Give to…</button>
      <button v-if="toDraft.length || toReady.length" :class="ghost" type="button" :aria-expanded="step === 'move'" @click="step = step === 'move' ? '' : 'move'; asking = null">Move to…</button>
      <button v-if="archivable.length" :class="ghost" type="button" @click="step = ''; archive()">Archive {{ archivable.length }}…</button>
      <button class="linkish font-ui text-sm !text-on-ink" type="button" @click="emit('clear')">Clear</button>
    </div>

    <div v-if="asking" class="flex flex-wrap items-center gap-2 border-t border-white/15 pt-3 font-ui text-sm" role="alert">
      <span class="mr-auto">{{ asking.text }}</span>
      <button :class="solid" type="button" :disabled="busy" @click="confirm">{{ busy ? "Working…" : asking.verb }}</button>
      <button :class="ghost" type="button" :disabled="busy" @click="asking = null">Keep them</button>
    </div>
    <div v-else-if="step === 'give'" class="flex flex-wrap items-center gap-2 border-t border-white/15 pt-3 font-ui text-sm" role="group" aria-label="Give to">
      <span class="mr-2 text-on-ink/70">Give {{ givable.length }} to</span>
      <button v-for="c in choices" :key="c.to || 'everyone'" :class="ghost" type="button" @click="give(c)">{{ c.label }}</button>
    </div>
    <div v-else-if="step === 'move'" class="flex flex-wrap items-center gap-2 border-t border-white/15 pt-3 font-ui text-sm" role="group" aria-label="Move to">
      <span class="mr-2 text-on-ink/70">Move to</span>
      <button v-if="toReady.length" :class="ghost" type="button" @click="move('todo')">To do ({{ toReady.length }})</button>
      <button v-if="toDraft.length" :class="ghost" type="button" @click="move('draft')">Draft ({{ toDraft.length }})</button>
    </div>
  </div>
</template>
