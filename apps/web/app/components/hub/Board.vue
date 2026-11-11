<!--
  The Work board: four columns, people inside. Draft, Ready, In progress and Done, always the width
  of the page and never scrolled sideways. Which column a card is in is the server's (`stage`), so
  nobody's board is arranged differently from anybody else's.

  Inside Ready, work is grouped under who it is for (the server's `lanes`): you first, then each
  teammate, each group, then Anyone — work for nobody in particular. A card sent to several named
  people shows under each of them, as one card. Dragging a card between Ready's groups gives it
  there (`POST /v1/work/:id/assign`); while a Ready card is dragged, every teammate and group
  shows as somewhere to drop it, even with nothing waiting for them.

  Dragging between columns does what the work's own page offers, under the same rules: Draft to
  Ready marks it Ready (keeping the repo it names), Ready to Draft is Move to Draft (not while held), In
  progress to Ready is Stop this agent (asked first, above the board), into Done is Archive
  (`manage`), finished work back to Ready is Reopen (with a reason, asked above the board), and
  anything out of Done to Draft is Unarchive. Nothing is dropped into In progress: taking work is
  "I'll do this" on its page, or an agent's `take`. The card menu has every one of these, which is
  the way from a keyboard. A moved card fades until the board reloads from the server — the
  columns are the server's to decide, never patched here — and a polite live region says what
  happened.

  From a 44rem board (a 1024px window) the four columns sit side by side, from 60rem with Draft and
  Done narrower, each head held at the top while its cards scroll inside the column; below that
  they stack as sections, and on a phone one shows at a time under a row of tabs.

  Ticking cards (not Done ones) brings up the bulk bar (HubBulkBar): Give to…, Move to…, Archive…
  and Clear, each asked in place. Escape or Clear lets go of the selection; it never outlives the
  cards it was made on.

  By person (`byPerson`, on by default on Work since 2026-11-04, `?by=status` turns it off): To
  do's groups come out into columns of their own, one per teammate or group with work waiting,
  between Ready and In progress; Ready keeps only work for anyone. Dropping a card on someone's
  column gives it to them, as dropping it on their group does. More than a few people is wider
  than the page, so this board scrolls sideways.
-->
<script setup lang="ts">
import type { STAGES } from "~/composables/useWorkLists";
import type { Task, Work, Working } from "~/types/hub";

type Column = (typeof STAGES)[number] & { cards: Work[] };
type Person = { id: string; label: string; to: string };
type Group = { key: string; label: string; to: string; cards: Work[] };
/** A column as drawn: one of the four stages, or (By person) one person's or group's waiting work. */
type Shown = { id: string; label: string; hint: string; cards: Work[]; lane?: string };

const props = defineProps<{
  columns: Column[];
  /** The team's people (`to` is how assign names them) and groups; null across all teams. */
  people: Person[] | null;
  groups: { slug: string; name: string }[];
  /** The viewer, as a group key (account id) and an assign address. */
  me: { id: string; to: string } | null;
  /** Show every finished card rather than the latest twenty. */
  allDone: boolean;
  /** The team's name, for "Everyone in Acme". */
  team: string;
  /** A column per person and group with work waiting, rather than groups inside Ready. */
  byPerson?: boolean;
}>();

const DONE_SHOWN = 20;

const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick = setInterval(() => (now.value = Date.now()), 60_000);
});
onBeforeUnmount(() => clearInterval(tick));

const col = (id: string) => props.columns.find((c) => c.id === id) as Column;
/** Done, newest finish first, the latest twenty unless all were asked for. */
const doneCards = computed(() => {
  const sorted = [...col("done").cards].sort((a, b) =>
    (b.updated || b.created).localeCompare(a.updated || a.created),
  );
  return props.allDone ? sorted : sorted.slice(0, DONE_SHOWN);
});

// ---- Ready, by who it is for ---------------------------------------------------------------

const dragging = ref<Work | null>(null);
/** Anyone in the team can give work to someone else; only within one team's board. */
const canGive = (g: Work) => Boolean(g.team) && g.stage !== "done";
const giving = computed(
  () => Boolean(props.people) && dragging.value?.stage === "todo" && canGive(dragging.value),
);

/** Ready's work under who it is for; `everyone` adds every place a dragged card could go. */
function groupsOfTodo(everyone: boolean): Group[] {
  const me = props.me;
  const byKey = new Map<string, Group>();
  const group = (key: string, label: string, to: string) => {
    if (!byKey.has(key)) byKey.set(key, { key, label, to, cards: [] });
    return byKey.get(key) as Group;
  };
  const person = (id: string, g?: Work) => {
    if (me && id === me.id) return group(id, "You", me.to);
    const p = props.people?.find((x) => x.id === id);
    if (p) return group(id, p.label, p.to);
    // Across all teams there is no member list: the card names who it was sent to.
    const label = g?.to_name || g?.to_group_name || "Someone";
    return group(id, label, g?.to ? `@${g.to}` : `@${id}`);
  };
  for (const g of col("todo").cards) {
    const lanes = g.lanes ?? [];
    if (!lanes.length) group("", "Anyone", "").cards.push(g);
    for (const k of lanes)
      (k.startsWith("#") ? group(k, g.to_group_name || k.slice(1), k) : person(k, g)).cards.push(g);
  }
  // Everywhere a dragged card could go, even where nothing waits yet.
  if (everyone) {
    if (me) person(me.id);
    for (const p of props.people ?? []) person(p.id);
    for (const t of props.groups) group(`#${t.slug}`, t.name || t.slug, `#${t.slug}`);
    group("", "Anyone", "");
  }
  const order = (x: Group) =>
    x.key === me?.id ? 0 : x.key === "" ? 3 : x.key.startsWith("#") ? 2 : 1;
  const seat = (x: Group) => {
    const i = props.people?.findIndex((p) => p.id === x.key) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...byKey.values()].sort(
    (a, b) => order(a) - order(b) || seat(a) - seat(b) || a.label.localeCompare(b.label),
  );
}
const todoGroups = computed<Group[]>(() => groupsOfTodo(giving.value));

// ---- By person: those groups as columns ----------------------------------------------------

/** One column per person and group with work waiting; never one that appears mid-drag. */
const lanes = computed<Group[]>(() =>
  props.byPerson ? groupsOfTodo(false).filter((x) => x.key !== "") : [],
);
const laneKeys = computed(() => new Set(lanes.value.map((x) => x.key)));
/** What Ready still holds: work for anyone, and while dragging, whoever has no column to drop on. */
const todoInColumn = computed<Group[]>(() =>
  props.byPerson
    ? todoGroups.value.filter((x) => x.key === "" || (giving.value && !laneKeys.value.has(x.key)))
    : todoGroups.value,
);
const shownColumns = computed<Shown[]>(() => {
  if (!props.byPerson) return props.columns;
  const at = props.columns.findIndex((c) => c.id === "todo");
  const anyone = todoGroups.value.find((x) => x.key === "")?.cards ?? [];
  const todo = { ...col("todo"), hint: "Nothing for anyone in particular.", cards: anyone };
  const people = lanes.value.map((x) => ({
    id: `lane-${x.key.replace(/[^A-Za-z0-9_-]/g, "_")}`,
    label: x.label,
    hint: "",
    cards: x.cards,
    lane: x.key,
  }));
  return [...props.columns.slice(0, at), todo, ...people, ...props.columns.slice(at + 1)];
});
/** A person's column takes a drop that gives the card there; a stage's, one that moves it. */
const laneOver = (c: Shown, e: DragEvent) =>
  c.lane === undefined ? dragOver(c.id, e) : groupOver(c.lane, e);
const laneDrop = (c: Shown, e: DragEvent) =>
  c.lane === undefined ? drop(c.id) : groupDrop(c.lane, e);
const isOver = (c: Shown) => over.value === (c.lane === undefined ? c.id : `group:${c.lane}`);
/** Faded while dragging, unless the card can land here. */
const dim = (c: Shown) =>
  Boolean(dragging.value) &&
  (c.lane === undefined
    ? dragging.value?.stage !== c.id && !canDrop(c.id) && !(c.id === "todo" && giving.value)
    : !(dragging.value && giveTo(dragging.value, c.lane)));

// ---- moving --------------------------------------------------------------------------------

const { onArchive, onAssign, onReopen, onTaskDraft, onTaskReady, onTakeBack } = useHub();
const holding = (g: Work) => Boolean(g.held_by?.length);
const finished = (g: Work) => g.status === "done" && g.outcome !== "archived";

/** Said once a move lands or is refused, for anyone not watching the card. */
const said = ref("");

/** Cards moved and waiting for the board to reload; they stay faded until it has. */
const moving = ref<Set<string>>(new Set());
const landed = new Set<string>();
const settling = ref<Set<string>>(new Set());

// ---- picking, for the bulk bar -------------------------------------------------------------

const picks = ref<Set<string>>(new Set());

// ---- Ready's groups, three cards each until opened -------------------------------------------

const GROUP_SHOWN = 3;
const opened = ref<Set<string>>(new Set());
/** You are shown in full: being named outranks being in the room. */
const full = (t: Group) => t.key === props.me?.id || opened.value.has(t.key);
function toggleGroup(key: string) {
  const next = new Set(opened.value);
  if (!next.delete(key)) next.add(key);
  opened.value = next;
}
const pickable = (g: Work) => g.stage !== "done";
function pick(g: Work) {
  const next = new Set(picks.value);
  if (!next.delete(g.id)) next.add(g.id);
  picks.value = next;
}
const pickedCards = computed(() =>
  props.columns
    .flatMap((c) => c.cards)
    .filter((g, i, all) => picks.value.has(g.id) && all.findIndex((x) => x.id === g.id) === i),
);
// A selection never outlives the cards it was made on.
watch(
  () => props.columns,
  (cols) => {
    const here = new Set(cols.flatMap((c) => c.cards.filter(pickable).map((g) => g.id)));
    if ([...picks.value].some((id) => !here.has(id)))
      picks.value = new Set([...picks.value].filter((id) => here.has(id)));
  },
);
watch(
  () => props.columns,
  () => {
    if (!landed.size) return;
    const next = new Set(moving.value);
    for (const id of landed) next.delete(id);
    // Now where the server put them: they settle there, once.
    settling.value = new Set(landed);
    setTimeout(() => (settling.value = new Set()), 400);
    landed.clear();
    moving.value = next;
  },
);
async function act(g: Work, work: () => Promise<boolean>, done: string) {
  moving.value = new Set(moving.value).add(g.id);
  const ok = await work();
  if (ok) {
    landed.add(g.id);
    said.value = done;
  } else {
    const next = new Set(moving.value);
    next.delete(g.id);
    moving.value = next;
    said.value = `“${g.title || "That work"}” did not move.`;
  }
}

/** A card waiting on a question asked above the board: stopping its agent, or why to reopen it. */
const asking = ref<{ kind: "stop" | "reopen"; work: Work } | null>(null);

/**
 * What dropping `g` in column `to` does, or null when it does nothing there. Each is an act the
 * work's page offers, under the same rule: anyone in the team moves work, `manage` archives.
 */
function moveTo(g: Work, to: string): (() => void) | null {
  const from = g.stage;
  const name = `“${g.title || "That work"}”`;
  if (from === to) return null;
  if (from === "draft" && to === "todo")
    return () => act(g, () => onTaskReady({ id: g.id } as Task), `${name} is Ready.`);
  if (from === "todo" && to === "draft" && !holding(g))
    return () => act(g, () => onTaskDraft({ id: g.id } as Task), `${name} moved to Draft.`);
  if (from === "working" && to === "todo") return () => (asking.value = { kind: "stop", work: g });
  if (to === "done" && g.manage && g.status !== "done")
    return () => act(g, () => onArchive(g, true), `${name} archived, in Done.`);
  if (from === "done" && to === "todo" && finished(g))
    return () => (asking.value = { kind: "reopen", work: g });
  if (from === "done" && to === "draft" && g.manage && g.status === "done")
    return () => act(g, () => onArchive(g, false), `${name} unarchived, in Draft.`);
  return null;
}
/** Waiting work given to a different group inside Ready. */
function giveTo(g: Work, key: string) {
  if (!giving.value || g.stage !== "todo") return null;
  const target = todoGroups.value.find((x) => x.key === key);
  if (!target || target.cards.some((x) => x.id === g.id)) return null;
  const name = `“${g.title || "That work"}”`;
  return () =>
    act(
      g,
      () => onAssign(g.id, target.to),
      target.key === "" ? `${name} is for anyone now.` : `${name} given to ${target.label}.`,
    );
}

async function stopAgent() {
  const g = asking.value?.work;
  asking.value = null;
  if (g)
    await act(
      g,
      () => onTakeBack({ id: g.id } as Working),
      `Stopped the agent on “${g.title}”. It is Ready again.`,
    );
}
async function reopen(form: HTMLFormElement) {
  const g = asking.value?.work;
  const why = field(form, "why").trim();
  if (!g || !why) return;
  asking.value = null;
  await act(g, () => onReopen(g.id, why), `“${g.title}” reopened: Ready again.`);
}
const askField = ref<HTMLInputElement | null>(null);
watch(asking, async (a) => {
  await nextTick();
  if (a?.kind === "reopen") askField.value?.focus();
});

// ---- dragging ------------------------------------------------------------------------------

const over = ref("");
function dragStart(g: Work, e: DragEvent) {
  dragging.value = g;
  e.dataTransfer?.setData("text/plain", g.title || g.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function dragEnd() {
  dragging.value = null;
  over.value = "";
}
const canDrop = (to: string) => Boolean(dragging.value && moveTo(dragging.value, to));
function dragOver(to: string, e: DragEvent) {
  if (!canDrop(to)) return;
  e.preventDefault();
  over.value = to;
}
function drop(to: string) {
  const run = dragging.value && moveTo(dragging.value, to);
  dragEnd();
  if (run) run();
}
/** A group inside Ready takes the drop when it gives the card there; otherwise the column does. */
function groupOver(key: string, e: DragEvent) {
  if (!dragging.value || !giveTo(dragging.value, key)) return;
  e.preventDefault();
  e.stopPropagation();
  over.value = `group:${key}`;
}
function groupDrop(key: string, e: DragEvent) {
  const run = dragging.value && giveTo(dragging.value, key);
  if (!run) return;
  e.stopPropagation();
  dragEnd();
  run();
}

// ---- menus ---------------------------------------------------------------------------------

const menu = ref<{ work: Work; x: number; y: number } | null>(null);
/** The card whose "Give to…" picker is open, and where it floats. */
const givingTo = ref<{ work: Work; left: number; top: number } | null>(null);
const popover = ref<HTMLElement | null>(null);
async function openGive(g: Work, x: number, y: number) {
  givingTo.value = { work: g, left: x, top: y };
  await nextTick();
  const box = popover.value?.getBoundingClientRect();
  if (box && givingTo.value)
    givingTo.value = {
      work: g,
      left: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)),
    };
  popover.value?.querySelector<HTMLElement>("button")?.focus();
}
function onDocument(e: Event) {
  if (givingTo.value && !popover.value?.contains(e.target as Node)) givingTo.value = null;
}
onMounted(() => document.addEventListener("pointerdown", onDocument, true));
onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocument, true));
/** The address the picker starts on: `@handle`, `#group`, or "" for the whole team. */
const addressed = (g: Work) =>
  g.to
    ? `@${g.to}`
    : g.to_group?.startsWith("~")
      ? (g.to_group_name ?? "").replace(/\s+/g, "")
      : g.to_group
        ? `#${g.to_group}`
        : "";

// ---- phone ---------------------------------------------------------------------------------

/**
 * The column a phone shows until a tab is picked: the first of Ready and the people's columns with
 * work in it, else any column with work. By person, Ready keeps only work for anyone, so asking
 * Ready alone opened the board on an empty column while people's columns had work (2026-11-06).
 */
const picked = ref("");
const shown = computed(() => {
  if (picked.value) return picked.value;
  const waiting = shownColumns.value.filter((c) => c.id === "todo" || c.lane !== undefined);
  return (
    waiting.find((c) => c.cards.length)?.id ||
    shownColumns.value.find((c) => c.cards.length)?.id ||
    "todo"
  );
});

const labelClass = "font-ui text-[0.6875rem] font-medium tracking-wider text-muted uppercase";
const cardList = "m-0 grid list-none gap-2 p-0 @[28rem]:grid-cols-2 @[44rem]:grid-cols-1";
/** Inside one of Ready's groups, cards sit closer: they belong together. */
const groupList = "m-0 grid list-none gap-1 p-0 @[28rem]:grid-cols-2 @[44rem]:grid-cols-1";
</script>

<template>
  <!-- Room at the foot while the bulk bar floats over it. -->
  <div class="@container flex flex-col gap-4 md:min-h-0 md:flex-1" :class="picks.size ? 'pb-24' : ''">
    <p class="sr-only" aria-live="polite">{{ said }}</p>

    <!-- A question the board asks before an act, in place: never a browser dialog. -->
    <div v-if="asking?.kind === 'stop'" class="flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-line py-3" role="alert">
      <p class="m-0 min-w-0 grow font-ui text-sm">Stop the agent working on “{{ asking.work.title }}”? It goes back to Ready.</p>
      <button class="btn sm outline danger" type="button" @click="stopAgent">Stop this agent</button>
      <button class="btn sm" type="button" @click="asking = null">Keep it</button>
    </div>
    <form
      v-else-if="asking?.kind === 'reopen'"
      class="flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-line py-3"
      @submit.prevent="reopen($event.target as HTMLFormElement)"
    >
      <label for="board-why" class="m-0 font-ui text-sm">Reopen “{{ asking.work.title }}”? Whoever finished it is told why.</label>
      <input id="board-why" ref="askField" name="why" class="h-8 min-w-0 grow basis-48 text-sm" placeholder="What's still wrong" required @keydown.esc="asking = null" />
      <button class="btn sm primary" type="submit">Reopen</button>
      <button class="btn sm" type="button" @click="asking = null">Keep it</button>
    </form>

    <!-- A phone shows one column at a time. By person adds a tab each, so the row scrolls on its own
         rather than pushing Done off the edge. -->
    <div role="tablist" aria-label="Board columns" class="flex gap-5 overflow-x-auto border-b border-line [scrollbar-width:none] md:hidden">
      <button
        v-for="c in shownColumns"
        :id="`tab-${c.id}`"
        :key="c.id"
        type="button"
        role="tab"
        :aria-selected="shown === c.id"
        :aria-controls="`col-${c.id}`"
        class="tab -mb-px flex shrink-0 cursor-pointer items-baseline gap-1 border-0 border-b-2 bg-transparent px-0 py-2 font-ui text-sm whitespace-nowrap"
        :class="shown === c.id ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg'"
        @click="picked = c.id"
      >
        {{ c.label }} <span class="text-xs text-muted tabular-nums">{{ c.cards.length }}</span>
      </button>
    </div>

    <!-- By person is as wide as the team: its columns share the width and scroll sideways only once
         they cannot fit at 14rem. At a fixed 17rem, four columns were wider than a laptop's page, and
         Done was always past its edge (2026-11-07). A scroller clips at its own edge, which
         cut the first column's cards off at their left edge (2026-11-06): it reaches a little past
         the page's edge, padded back by as much, so the cards sit where they did with room for
         their edges and their focus ring.
         From md up the board is the height left in the window (HubShell's `fill`): each column's
         cards scroll inside it, so By person's sideways scroller sits on the window's bottom edge.
         Stacked (a board under 44rem), the columns scroll together instead. Every scroller here is
         padded out by 4px each side, so it does not clip a card's edge or its focus ring. -->
    <div
      :class="
        byPerson
          ? 'flex gap-x-6 gap-y-10 max-md:flex-col md:min-h-0 md:flex-1 md:-mx-1.5 md:overflow-x-auto md:px-1.5 md:pt-1.5 md:-mt-1.5 md:pb-3'
          : 'grid gap-x-4 gap-y-10 md:-mx-1 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-1 @[44rem]:grid-cols-4 @[44rem]:grid-rows-[minmax(0,1fr)] @[60rem]:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,5fr)_minmax(0,4fr)] @[60rem]:gap-x-6'
      "
    >
      <section
        v-for="c in shownColumns"
        :id="`col-${c.id}`"
        :key="c.id"
        class="flex min-w-0 flex-col transition-opacity motion-reduce:transition-none"
        :class="[shown === c.id ? '' : 'max-md:hidden', dim(c) ? 'opacity-50' : '', byPerson ? 'md:min-w-[14rem] md:flex-1 md:basis-0' : '']"
        :aria-labelledby="`col-${c.id}-h`"
        @dragover="laneOver(c, $event)"
        @drop.prevent="laneDrop(c, $event)"
      >
        <!-- On a phone the tab above already names the column. -->
        <!-- Held at the top, so the names stay in view while the cards scroll under them. -->
        <div class="sticky top-0 z-20 -mx-px flex items-baseline gap-2 border-b border-line-strong bg-bg px-px pt-2 pb-2 max-md:hidden">
          <h2 :id="`col-${c.id}-h`" class="m-0 font-ui text-sm font-[550] tracking-normal">{{ c.label }}</h2>
          <span class="font-ui text-xs text-muted tabular-nums">{{ c.cards.length }}</span>
        </div>
        <div
          class="flex min-h-0 grow flex-col gap-3 rounded-b-2 pt-3 pb-2 md:-mx-1 md:overflow-y-auto md:px-1"
          :class="isOver(c) ? 'outline-2 -outline-offset-2 outline-ink outline-solid' : ''"
        >
          <p v-if="!c.cards.length && !(c.id === 'todo' && giving)" class="m-0 font-ui text-sm text-muted">{{ c.hint }}</p>

          <!-- Ready: under who it is for (By person: only what is for anyone). -->
          <template v-if="c.id === 'todo'">
            <div
              v-for="t in todoInColumn"
              :key="t.key || 'anyone'"
              class="flex flex-col gap-2 rounded-2"
              :class="over === `group:${t.key}` ? 'outline-2 outline-offset-2 outline-ink outline-solid' : ''"
              :aria-label="`For ${t.label}`"
              role="group"
              @dragover="groupOver(t.key, $event)"
              @drop.prevent="groupDrop(t.key, $event)"
            >
              <!-- Being named outranks being in the room: You leads, in ink over an ink rule. -->
              <p
                class="m-0 flex items-baseline gap-2 border-b pb-1"
                :class="[labelClass, t.key && t.key === me?.id ? '!text-fg font-[550] border-fg' : 'border-line']"
              >
                {{ t.label }} <span class="tabular-nums">{{ t.cards.length || "" }}</span>
              </p>
              <ul v-if="t.cards.length" :class="groupList">
                <HubBoardCard
                  v-for="g in full(t) ? t.cards : t.cards.slice(0, GROUP_SHOWN)"
                  :key="g.id"
                  :work="g"
                  :now="now"
                  :draggable="!moving.has(g.id)"
                  :moving="moving.has(g.id) || dragging?.id === g.id"
                  :settling="settling.has(g.id)"
                  pickable
                  :picked="picks.has(g.id)"
                  :picking="picks.size > 0"
                  @pick="pick(g)"
                  @drag="dragStart(g, $event)"
                  @dragend="dragEnd"
                  @menu="(x, y) => (menu = { work: g, x, y })"
                />
              </ul>
              <button
                v-if="t.key !== me?.id && t.cards.length > GROUP_SHOWN"
                type="button"
                class="linkish self-start font-ui text-xs text-muted"
                :aria-expanded="opened.has(t.key)"
                @click="toggleGroup(t.key)"
              >
                {{ opened.has(t.key) ? "Show fewer" : `${t.cards.length - GROUP_SHOWN} more in ${t.key ? t.label : "Anyone"}` }}
              </button>
              <p v-if="!t.cards.length" class="m-0 py-2 font-ui text-xs text-muted">Drop here to give it to {{ t.key ? t.label : "anyone" }}.</p>
            </div>
          </template>

          <ul v-else-if="c.cards.length" :class="c.lane === undefined ? cardList : groupList">
            <HubBoardCard
              v-for="g in c.id === 'done' ? doneCards : c.cards"
              :key="g.id"
              :work="g"
              :now="now"
              :draggable="!moving.has(g.id)"
              :moving="moving.has(g.id) || dragging?.id === g.id"
              :settling="settling.has(g.id)"
              :pickable="pickable(g)"
              :picked="picks.has(g.id)"
              :picking="picks.size > 0"
              @pick="pick(g)"
              @drag="dragStart(g, $event)"
              @dragend="dragEnd"
              @menu="(x, y) => (menu = { work: g, x, y })"
            />
          </ul>
          <p v-if="c.id === 'done' && c.cards.length > DONE_SHOWN" class="m-0 font-ui text-xs text-muted">
            <template v-if="!allDone">
              The latest {{ DONE_SHOWN }} of {{ c.cards.length }} ·
              <NuxtLink :to="{ query: { ...$route.query, done: 'all' } }">See all</NuxtLink>
            </template>
            <template v-else>
              All {{ c.cards.length }} ·
              <NuxtLink :to="{ query: { ...$route.query, done: undefined } }">Show the latest {{ DONE_SHOWN }}</NuxtLink>
            </template>
          </p>
        </div>
      </section>
    </div>

    <HubBulkBar
      :picked="pickedCards"
      :people="people"
      :groups="groups"
      :me="me"
      :team="team"
      @clear="picks = new Set()"
      @said="(t) => (said = t)"
    />
    <HubCardMenu
      v-if="menu"
      :key="menu.work.id + menu.x + menu.y"
      :work="menu.work"
      :x="menu.x"
      :y="menu.y"
      :can-give="canGive(menu.work)"
      @close="menu = null"
      @give="openGive(menu!.work, menu!.x, menu!.y)"
    />
    <Teleport to="body">
      <div
        v-if="givingTo"
        ref="popover"
        class="menu !fixed !m-0 w-72"
        :style="{ left: `${givingTo.left}px`, top: `${givingTo.top}px`, right: 'auto' }"
        @keydown.esc="givingTo = null"
      >
        <HubAssignPicker
          :id="givingTo.work.id"
          :team="givingTo.work.team || ''"
          :to="addressed(givingTo.work)"
          @done="givingTo = null"
        />
      </div>
    </Teleport>
  </div>
</template>
