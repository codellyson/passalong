<!--
  The team board: four columns, the same for everyone who opens it, like any shared task board. A
  card says what the work is, who it is for and who has it; opening it goes to the work's own page,
  where anyone in the team can move it on. Which column a card is in is the server's
  (`stage`), so nobody's board is arranged differently from anybody else's.

  From md the columns sit side by side, at least 15rem each and sharing what is left, and the board
  — not the page — scrolls sideways when they do not fit: wrapped into a grid they read as four boxes, not a board. On a phone
  one column shows at a time, picked from a row of tabs, as Trello and Linear do.

  Who a card is for is its footer's right-hand line, and that line is the "Give to…" control: the
  answer and the way to change it are one thing, and a separate button made every card a row taller.
  Who has it is the same line's left side: a dot for how the hold is doing (`health`, from the
  server), their name, ⚡ when an agent holds it, and a word only when somebody should look. The age at the top is since anything last happened to it. Done is faded.

  The round dot at a card's top-left selects it for the bar that archives or deletes several at
  once (HubBulkBar, on the page). It shows on hover and focus, and stays once anything is
  selected; on a touch screen, which has no hover, it always shows. Only cards the viewer may
  archive or delete (`manage`) have one. Right-clicking a card opens its quick actions
  (HubCardMenu).

  A card can be dragged to another column when that column means an act the card's own page
  offers: back to Draft, Stop this agent (To do, from In progress; asked first), Archive (Done),
  Unarchive (out of Done, to Draft), Reopen (finished, back to To do) and Ready (Draft to To do),
  which keeps the repo the work already names; the work's own page is where to change it. While a
  card is dragged it fades where it
  was, the columns it cannot go to fade, and a gap opens at the top of the one under it. A drop
  lands at once and is put back, with the hub's error, if the server refuses it. The same acts are
  in the right-click menu, which is the way there from a keyboard or a phone.

  From md the columns are lanes the height of the window, each scrolling its own cards under a
  header that stays put, so the whole lane is somewhere to drop and nothing ends half-way down.

  In a team (`people`), it is a Trello board with a list per person: Draft, To do, a column for each
  teammate and each group with work waiting, In progress, Done. Work waiting to be started sits in
  the column of whoever it was sent to (`lanes`, from the server), or To do when nobody in
  particular; several named people each see it in their column, as one card. Dragging it to
  someone's column gives it to them; dragging to In progress, Done or Draft does what those columns
  always did.
-->
<script setup lang="ts">
import type { STAGES } from "~/composables/useWorkLists";
import type { Guide, Task, Working } from "~/types/hub";

const props = defineProps<{
  columns: ((typeof STAGES)[number] & { cards: Guide[] })[];
  /** Teammates, for the columns by person; absent for the board by stage. `to` is how Give to… names them. */
  people?: { id: string; label: string; to: string }[] | null;
}>();

/** Done is most of what exists; the column shows the newest and says how many more. */
const DONE_SHOWN = 20;

/** Who it was sent to, in the words the rest of the hub uses. */
function address(g: Guide) {
  if (g.to) return g.to_name || `@${g.to}`;
  // Several named people are a group nobody named (`~…`): say who they are, not its id.
  if (g.to_group)
    return g.to_group.startsWith("~") ? g.to_group_name || "several people" : `#${g.to_group}`;
  if (g.team) return g.team_name || g.team;
  return "Private";
}
/** The picker's name for where it is now: `@handle`, `#group`, or "" for the whole team. */
const addressed = (g: Guide) =>
  g.to
    ? `@${g.to}`
    : g.to_group?.startsWith("~")
      ? (g.to_group_name ?? "").replace(/\s+/g, "")
      : g.to_group
        ? `#${g.to_group}`
        : "";
/** Anyone in the team can give work to someone else, as they can move it. Done work stays put. */
const canGive = (g: Guide) => Boolean(g.team) && g.stage !== "done";

/**
 * The one card whose "Give to…" picker is open, and where it floats: under the control that opened
 * it, fixed to the window and kept inside it. Floating rather than in the card's flow, which made
 * the card grow; drawn on the page body, because the lanes scroll both ways and clip anything
 * hanging out of them. A click outside it, Escape, or scrolling the board closes it.
 */
const giving = ref("");
const givingGuide = computed(() =>
  giving.value ? props.columns.flatMap((c) => c.cards).find((g) => g.id === giving.value) : null,
);
const givePos = ref({ left: 0, top: 0 });
const popover = ref<HTMLElement | null>(null);
async function openGive(id: string, x: number, y: number) {
  if (giving.value === id) return (giving.value = "");
  giving.value = id;
  givePos.value = { left: x, top: y };
  await nextTick();
  const box = popover.value?.getBoundingClientRect();
  if (box)
    givePos.value = {
      left: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)),
      top: y + box.height > window.innerHeight - 8 ? Math.max(8, y - box.height - 28) : y,
    };
}
function giveFrom(id: string, e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  openGive(id, r.right - 288, r.bottom + 4);
}
// The controls that open it stop their own click, so any click that arrives here is elsewhere.
function onDocument(e: Event) {
  if (giving.value && !popover.value?.contains(e.target as Node)) giving.value = "";
}
onMounted(() => {
  document.addEventListener("click", onDocument);
  window.addEventListener("scroll", onDocument, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", onDocument);
  window.removeEventListener("scroll", onDocument, true);
});

/** The hold a card leads with: one that needs somebody first, else the first. */
const lead = (g: Guide) =>
  (g.held_by ?? []).find((h) => h.health === "quiet" || h.health === "asking") ?? g.held_by?.[0];

/**
 * How a hold is doing, as a coloured dot and, when somebody should look, a word. Working and a
 * person's own hold need nobody, so they say nothing beyond the dot.
 */
const HEALTH = {
  working: { dot: "bg-ok", word: "", label: "working" },
  person: { dot: "bg-line-strong", word: "", label: "a person has it" },
  asking: { dot: "bg-warn", word: "asked a question", label: "asked a question" },
  quiet: { dot: "bg-danger", word: "went quiet", label: "went quiet" },
} as const;

/** How long since anything happened to it: its holder last heard from, or its last edit. */
function age(g: Guide) {
  const heard = (g.held_by ?? [])
    .map((h) => h.since)
    .sort()
    .at(-1);
  const edited = g.updated || g.created;
  return rel(heard && heard > edited ? heard : edited).replace(/ ago$/, "");
}

const { list: selected, has, toggle } = useSelection();
const pick = (g: Guide) =>
  toggle({ id: g.id, title: g.title || "", archived: g.status === "consumed" });

/** The card whose quick actions are open, and where the pointer was. */
const menu = ref<{ guide: Guide; x: number; y: number } | null>(null);
function openMenu(g: Guide, e: MouseEvent) {
  // The context-menu key reports no pointer position, so the menu opens at the card instead.
  const card = (e.currentTarget as HTMLElement).getBoundingClientRect();
  menu.value = {
    guide: g,
    x: e.clientX || card.left + 16,
    y: e.clientY || card.top + 16,
  };
}

const { onArchive, onAssign, onReopen, onTaskDraft, onTaskReady, onTakeBack } = useHub();
/** Finished, not shelved: what Reopen is for. Archived work comes back through Unarchive. */
const finished = (g: Guide) => g.status === "consumed" && g.outcome !== "archived";

/** The card being dragged, and the column under it. */
const dragging = ref<Guide | null>(null);
const over = ref("");
const holding = (g: Guide) => Boolean(g.held_by?.length);

/**
 * What dropping `g` in column `to` does, or null when it does nothing there. Each is the act the
 * work's page offers, under the same rule: anyone in the team moves work, `manage` archives. An
 * act answers false when it did not happen, and the card goes back.
 */
function moveTo(g: Guide, to: string): (() => Promise<boolean> | boolean) | null {
  const from = g.stage;
  if (from === to) return null;
  if (from === "draft" && to === "todo") return () => onTaskReady({ id: g.id } as Task);
  if (from === "todo" && to === "draft" && !holding(g))
    return () => onTaskDraft({ id: g.id } as Task);
  if (from === "working" && to === "todo")
    return () =>
      confirm(`Stop the agent working on "${g.title}"? It goes back to To do.`) &&
      onTakeBack({ id: g.id } as Working);
  if (to === "done" && g.manage && g.status !== "consumed") return () => onArchive(g, true);
  // Finished work dragged back to To do is reopened, with why; anything out of Done to Draft is
  // unarchived, so nobody redoes it without a person saying so.
  if (from === "done" && to === "todo" && finished(g))
    return () => {
      const why = prompt(`Why reopen "${g.title}"? Whoever finished it is told.`)?.trim();
      return Boolean(why) && onReopen(g.id, why as string);
    };
  if (from === "done" && to === "draft" && g.manage && g.status === "consumed")
    return () => onArchive(g, false);
  return null;
}

/**
 * Where a moved card is shown until the board catches up: its id and the column it was put in. A
 * refused move deletes its entry and the card is back where the server has it.
 */
const placed = ref<Record<string, string>>({});
const view = computed(() => {
  const moved = props.columns.flatMap((c) =>
    c.cards.filter((g) => placed.value[g.id] && placed.value[g.id] !== c.id),
  );
  return props.columns.map((c) => ({
    ...c,
    cards: [
      ...moved.filter((g) => placed.value[g.id] === c.id),
      ...c.cards.filter((g) => !placed.value[g.id] || placed.value[g.id] === c.id),
    ],
  }));
});
// Once the server's board agrees, the entry has nothing left to say.
watch(
  () => props.columns,
  (cols) => {
    const now = { ...placed.value };
    for (const c of cols) for (const g of c.cards) if (now[g.id] === c.id) delete now[g.id];
    placed.value = now;
  },
);
async function place(g: Guide, to: string, act: () => Promise<boolean> | boolean) {
  placed.value = { ...placed.value, [g.id]: to };
  if (!(await act())) {
    const { [g.id]: _, ...rest } = placed.value;
    placed.value = rest;
  }
}

/**
 * The board with people (`people`): Draft, To do (nobody yet), a column per teammate and per group
 * with work waiting, In progress, Done — a Trello board with a list per person. Only work waiting to
 * be started moves between the people: Draft, In progress and Done are where they are for everyone.
 * A card waiting for several named people shows in each of their columns, as one card. A card just
 * given somewhere shows there until the board catches up (`given`).
 */
const given = ref<Record<string, string>>({});
const isLane = (col: string) => !["draft", "todo", "working", "done"].includes(col);
const laneColumns = computed(() => {
  if (!props.people) return null;
  const stage = (id: string) => view.value.find((c) => c.id === id)!;
  const waiting = stage("todo").cards;
  const groups = [
    ...new Set(waiting.flatMap((g) => (g.lanes ?? []).filter((k) => k.startsWith("#")))),
  ].sort();
  const lanes = [...props.people, ...groups.map((k) => ({ id: k, label: k, to: k }))];
  const known = new Set(lanes.map((c) => c.id));
  const whose = (g: Guide) => {
    if (given.value[g.id] !== undefined) return [given.value[g.id] as string];
    const in_ = (g.lanes ?? []).filter((k) => known.has(k));
    return in_.length ? in_ : ["todo"];
  };
  return [
    stage("draft"),
    {
      ...stage("todo"),
      label: "To do",
      hint: "Ready, for nobody yet",
      cards: waiting.filter((g) => whose(g).includes("todo")),
    },
    ...lanes.map((c) => ({
      ...c,
      hint: "",
      cards: waiting.filter((g) => whose(g).includes(c.id)),
    })),
    stage("working"),
    stage("done"),
  ];
});
const shownColumns = computed(() => laneColumns.value ?? view.value);
watch(
  () => props.columns,
  (cols) => {
    const now = { ...given.value };
    for (const g of cols.flatMap((c) => c.cards)) {
      const to = now[g.id];
      if (to !== undefined && (to === "todo" ? !g.lanes?.length : g.lanes?.includes(to)))
        delete now[g.id];
    }
    given.value = now;
  },
);
/** Dropping waiting work on a person or group gives it to them; on To do, to nobody in particular. */
async function giveTo(g: Guide, col: string) {
  const to =
    col === "todo"
      ? ""
      : ((laneColumns.value?.find((c) => c.id === col) as { to?: string })?.to ?? "");
  given.value = { ...given.value, [g.id]: col };
  if (!(await onAssign(g.id, to))) {
    const { [g.id]: _, ...rest } = given.value;
    given.value = rest;
  }
}
/** Waiting work moving between To do and the people, rather than between stages. */
function regive(g: Guide, col: string) {
  if (!laneColumns.value || g.stage !== "todo" || !canGive(g)) return false;
  const here = laneColumns.value.find((c) => c.id === col)?.cards.some((x) => x.id === g.id);
  return !here && (isLane(col) || (col === "todo" && Boolean(g.lanes?.length)));
}
const allowed = (g: Guide, col: string) =>
  regive(g, col) || (!isLane(col) && Boolean(moveTo(g, col)));

/** How tall the dragged card is, for the gap that opens where it would land. */
const gap = ref(0);
function dragStart(g: Guide, e: DragEvent) {
  dragging.value = g;
  gap.value = (e.currentTarget as HTMLElement).offsetHeight;
  e.dataTransfer?.setData("text/plain", g.title || g.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function dragEnd() {
  dragging.value = null;
  over.value = "";
}
function dragOver(col: string, e: DragEvent) {
  if (!dragging.value || !allowed(dragging.value, col)) return;
  e.preventDefault();
  over.value = col;
}
function drop(col: string) {
  const g = dragging.value;
  if (g && regive(g, col)) {
    dragEnd();
    giveTo(g, col);
    return;
  }
  const act = g && !isLane(col) && moveTo(g, col);
  dragEnd();
  if (g && act) place(g, col, act);
}

/**
 * From md, the lanes reach the bottom of the window: the row is as tall as what is left below its
 * own top. Measured, because what sits above the board (a banner, a filter line) varies.
 */
const lanes = ref<HTMLElement | null>(null);
const laneHeight = ref("");
function measure() {
  const el = lanes.value;
  if (!el || !window.matchMedia("(min-width: 768px)").matches) return (laneHeight.value = "");
  const top = el.getBoundingClientRect().top + window.scrollY;
  laneHeight.value = `max(24rem, calc(100dvh - ${top}px - 1.5rem))`;
}
onMounted(() => {
  measure();
  window.addEventListener("resize", measure);
});
onBeforeUnmount(() => window.removeEventListener("resize", measure));

/** The column a phone shows: the first with anything in it, until a tab is picked. */
const picked = ref("");
const shown = computed(
  () =>
    (shownColumns.value.some((c) => c.id === picked.value) && picked.value) ||
    shownColumns.value.find((c) => c.cards.length)?.id ||
    shownColumns.value[0]?.id ||
    "todo",
);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div role="tablist" aria-label="Board columns" class="flex gap-1 overflow-x-auto [scrollbar-width:none] md:hidden">
      <button
        v-for="col in shownColumns"
        :key="col.id"
        type="button"
        role="tab"
        :aria-selected="shown === col.id"
        class="btn sm static shrink-0"
        :class="shown === col.id ? 'primary' : ''"
        @click="picked = col.id"
      >
        {{ col.label }} <span class="tabular-nums opacity-70">{{ col.cards.length }}</span>
      </button>
    </div>

    <div
      ref="lanes"
      class="flex items-start gap-3 md:items-stretch md:gap-2 md:overflow-x-auto md:pb-2"
      :style="laneHeight ? { height: laneHeight } : undefined"
    >
      <section
        v-for="col in shownColumns"
        :key="col.id"
        class="flex w-full min-w-0 flex-col gap-3 rounded-3 bg-surface p-3 transition-opacity md:min-h-0 md:flex-[1_0_15rem]"
        :class="[
          shown === col.id ? '' : 'max-md:hidden',
          dragging && !col.cards.some((x) => x.id === dragging!.id) && !allowed(dragging, col.id) ? 'opacity-50' : '',
          over === col.id ? 'ring-2 ring-[var(--accent)]' : '',
        ]"
        @dragover="dragOver(col.id, $event)"
        @drop.prevent="drop(col.id)"
        :aria-labelledby="`col-${col.id}`"
      >
        <div class="flex items-baseline gap-2 px-1">
          <h2 :id="`col-${col.id}`" class="m-0 font-ui text-sm font-semibold">{{ col.label }}</h2>
          <span class="font-ui text-xs tabular-nums text-muted">{{ col.cards.length }}</span>
        </div>
        <p v-if="col.hint && !col.cards.length && over !== col.id" class="m-0 px-1 font-ui text-xs text-muted">{{ col.hint }}</p>
        <!-- The lane's cards scroll inside it, under the header. -->
        <ul class="m-0 -mx-1 flex list-none flex-col gap-2 px-1 pb-1 md:min-h-0 md:flex-1 md:overflow-y-auto">
          <li
            v-if="over === col.id"
            aria-hidden="true"
            class="shrink-0 rounded-2 border-2 border-dashed border-line-strong"
            :style="{ height: `${gap}px` }"
          />
          <li
            v-for="g in col.id === 'done' ? col.cards.slice(0, DONE_SHOWN) : col.cards"
            :key="g.id"
            class="group relative flex shrink-0 flex-col rounded-2 bg-raised shadow-edge transition-transform has-[a:active]:scale-[0.96]"
            :class="[
              dragging?.id === g.id ? 'opacity-40' : col.id === 'done' ? 'opacity-70' : '',
              has(g.id) ? 'ring-2 ring-[var(--accent)]' : '',
            ]"
            :draggable="giving !== g.id"
            @dragstart="dragStart(g, $event)"
            @dragend="dragEnd"
            @contextmenu.prevent="openMenu(g, $event)"
          >
            <!-- The top row: the select dot, the label and the age, in one line so the dot sits on
                 the label's centre. Outside the link, because a control inside an <a> would open
                 the page; the link below stretches over the whole card instead. -->
            <div class="flex items-center gap-2 px-3 pt-2">
              <!-- No room taken while hidden, so a card at rest starts at its label. -->
              <input
                v-if="g.manage"
                type="checkbox"
                class="relative z-10 my-0 ml-0 -mr-2 h-4 w-0 shrink-0 cursor-pointer appearance-none rounded-pill border-0 border-line-strong bg-field opacity-0 transition-[width,margin,opacity] duration-150 checked:border-[var(--accent)] checked:bg-[var(--accent)] checked:shadow-[inset_0_0_0_3px_var(--field)] focus-visible:mr-0 focus-visible:w-4 focus-visible:border focus-visible:opacity-100 group-hover:mr-0 group-hover:w-4 group-hover:border group-hover:opacity-100 motion-reduce:transition-none [@media(hover:none)]:mr-0 [@media(hover:none)]:w-4 [@media(hover:none)]:border [@media(hover:none)]:opacity-100"
                :class="selected.length ? '!mr-0 !w-4 !border !opacity-100' : ''"
                :checked="has(g.id)"
                :aria-label="`Select ${g.title || 'this work'}`"
                @change="pick(g)"
              >
              <HubWorkTag :tags="g.tags" />
              <!-- Done is finished work and archived work; the card says which, in words. -->
              <span v-if="g.stage === 'done' && g.outcome" class="font-ui text-xs text-muted">{{
                { finished: "Finished", approved: "Finished", archived: "Archived" }[g.outcome]
              }}</span>
              <span class="ml-auto font-ui text-xs tabular-nums text-muted">{{ age(g) }}</span>
            </div>
            <!-- The title is the link, and its ::after covers the card, so anywhere on the card
                 opens it; the dot and the footer's control sit above that layer. -->
            <NuxtLink
              :to="`/hub/g/${g.id}`"
              class="line-clamp-2 px-3 pt-2 pb-1 font-ui text-sm font-medium text-pretty text-fg no-underline outline-none after:absolute after:inset-0 after:rounded-2 focus-visible:after:outline-2 focus-visible:after:outline-[var(--accent)] focus-visible:after:outline-solid"
            >{{ g.title || "Untitled" }}</NuxtLink>
            <!-- The footer sits beside the link, not inside it: a button inside an <a> is invalid
                 and would open the page. -->
            <div class="flex items-center gap-2 px-3 pb-2 font-ui text-xs text-muted">
              <!-- Who has it: a dot for how it is going, their name, ⚡ when an agent holds it, and a
                   word only when somebody should look. The agent's own name is on the card's page;
                   several holders read as the first and a count. -->
              <span v-if="lead(g)" class="flex min-w-0 items-center gap-1">
                <span
                  class="size-1.5 shrink-0 rounded-pill"
                  :class="HEALTH[lead(g)!.health].dot"
                  role="img"
                  :aria-label="HEALTH[lead(g)!.health].label"
                />
                <b class="min-w-0 truncate font-medium text-fg">{{ lead(g)!.you ? "You" : lead(g)!.name }}</b>
                <span v-if="lead(g)!.agent" class="shrink-0" role="img" aria-label="an agent">⚡</span>
                <span v-if="(g.held_by?.length ?? 0) > 1" class="shrink-0">+{{ g.held_by!.length - 1 }}</span>
                <span
                  v-if="HEALTH[lead(g)!.health].word"
                  class="shrink-0"
                  :class="lead(g)!.health === 'quiet' ? 'text-danger' : 'text-warn'"
                >{{ HEALTH[lead(g)!.health].word }}</span>
              </span>
              <button
                v-if="canGive(g)"
                type="button"
                class="relative z-10 ml-auto flex min-w-0 cursor-pointer items-center gap-0.5 rounded-1 border-0 bg-transparent p-0 font-ui text-xs text-muted hover:text-fg"
                :aria-expanded="giving === g.id"
                :aria-label="`For ${address(g)}. Give it to someone else`"
                @click.stop="giveFrom(g.id, $event)"
                @keydown.esc="giving = ''"
              >
                <span class="min-w-0 truncate">{{ address(g) }}</span>
                <AppIcon name="reveal" class="shrink-0" />
              </button>
              <span v-else class="ml-auto min-w-0 truncate">{{ address(g) }}</span>
            </div>
          </li>
        </ul>
        <p v-if="col.id === 'done' && col.cards.length > DONE_SHOWN" class="m-0 px-1 font-ui text-xs text-muted">
          and {{ col.cards.length - DONE_SHOWN }} more — search to find one
        </p>
      </section>
    </div>
    <HubCardMenu
      v-if="menu"
      :key="menu.guide.id + menu.x + menu.y"
      :guide="menu.guide"
      :x="menu.x"
      :y="menu.y"
      :can-give="canGive(menu.guide)"
      @close="menu = null"
      @give="openGive(menu!.guide.id, menu!.x, menu!.y)"
    />
    <Teleport to="body">
      <div
        v-if="givingGuide"
        ref="popover"
        class="menu !fixed !m-0 w-72"
        :style="{ left: `${givePos.left}px`, top: `${givePos.top}px`, right: 'auto' }"
        @keydown.esc="giving = ''"
      >
        <HubAssignPicker
          :id="givingGuide.id"
          :team="givingGuide.team || ''"
          :to="addressed(givingGuide)"
          @done="giving = ''"
        />
      </div>
    </Teleport>
  </div>
</template>
