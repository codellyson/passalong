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
  the way from a keyboard. Dragging is by pointer (see "dragging" below): the card lifts and
  follows, where it would land opens up, and a scroller under it scrolls near its edge. Dropped,
  it is in its new place at once — the hub's optimistic patch, the same one the work page's acts
  write — faded until the server answers, and put back if refused; the refetch after decides, and
  every card slides to wherever that puts it. A polite live region says what happened.

  From a 44rem board (a 1024px window) the four columns sit side by side, from 60rem with Draft and
  Done narrower, each head held at the top while its cards scroll inside the column; below that
  they stack as sections, and on a phone one shows at a time under a row of tabs.

  Ticking cards (not Done ones) brings up the bulk bar (HubBulkBar): Give to…, Move to…, Archive…
  and Clear, each asked in place. Escape or Clear lets go of the selection; it never outlives the
  cards it was made on.

  By person (`byPerson`, on by default on Work since 2026-11-04, `?by=status` turns it off): To
  do's groups come out into columns of their own, one per teammate or group with work waiting,
  between Ready and In progress; Ready keeps only work for anyone, and is named Anyone. Dropping a card on someone's
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
  // Named for who it is for, like the columns beside it: Ready here holds only work for anyone.
  const todo = {
    ...col("todo"),
    label: "Anyone",
    hint: "Nothing for anyone in particular.",
    cards: anyone,
  };
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
const dropKey = (c: Shown) => (c.lane === undefined ? c.id : `group:${c.lane}`);
const isOver = (c: Shown) => over.value === dropKey(c);
/** Faded while dragging, unless the card can land here. */
const dim = (c: Shown) =>
  Boolean(dragging.value) &&
  (c.lane === undefined
    ? dragging.value?.stage !== c.id &&
      !(dragging.value && moveTo(dragging.value, c.id)) &&
      !(c.id === "todo" && giving.value)
    : !(dragging.value && giveTo(dragging.value, c.lane)));

// ---- moving --------------------------------------------------------------------------------

const { onArchive, onAssign, onReopen, onTaskDraft, onTaskReady, onTakeBack } = useHub();
const holding = (g: Work) => Boolean(g.held_by?.length);
const finished = (g: Work) => g.status === "done" && g.outcome !== "archived";

/** Said once a move lands or is refused, for anyone not watching the card. */
const said = ref("");

/** Cards moved and waiting for the server: already in their new place (the hub's optimistic
    patch), faded until it answers. */
const moving = ref<Set<string>>(new Set());

// ---- picking, for the bulk bar -------------------------------------------------------------

const picks = ref<Set<string>>(new Set());

// ---- Ready's groups, three cards each until opened -------------------------------------------

const GROUP_SHOWN = 3;
const opened = ref<Set<string>>(new Set());
/** You are shown in full: being named outranks being in the room. */
/** By person, work for anyone is the Anyone column itself: no label inside it, nothing folded. */
const ownColumn = (t: Group) => props.byPerson && t.key === "";
const full = (t: Group) => t.key === props.me?.id || ownColumn(t) || opened.value.has(t.key);
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
async function act(g: Work, work: () => Promise<boolean>, done: string) {
  moving.value = new Set(moving.value).add(g.id);
  const ok = await work();
  const next = new Set(moving.value);
  next.delete(g.id);
  moving.value = next;
  // Refused, the hub has put the card back where it was.
  said.value = ok ? done : `“${g.title || "That work"}” did not move.`;
  if (lift.value?.work.id === g.id) lift.value = null;
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
      () => onAssign(g.id, target.to, target.key || undefined),
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
// Pointer events rather than the browser's own drag (2026-11-11): the card itself lifts and follows
// the pointer, the place it would land opens up, a column or the board scrolls when the pointer
// nears its edge, and a touch screen drags after a long press. Every target is a `data-drop`: a
// stage's column (its id), or a person's or group's (`group:<key>`), as a column or inside Ready.

/** The card in the air: where the pointer is, where it held the card, and the card's size. */
const lift = ref<{
  work: Work;
  x: number;
  y: number;
  dx: number;
  dy: number;
  w: number;
  h: number;
} | null>(null);
const over = ref("");
let target: (() => void) | null = null;
let press: {
  g: Work;
  el: HTMLElement;
  x: number;
  y: number;
  touch: boolean;
  timer?: ReturnType<typeof setTimeout>;
} | null = null;
let frame = 0;

function grab(g: Work, e: PointerEvent) {
  if (e.button !== 0 || moving.value.has(g.id) || picks.value.size) return;
  if ((e.target as HTMLElement).closest("button, input")) return;
  const touch = e.pointerType === "touch";
  press = { g, el: e.currentTarget as HTMLElement, x: e.clientX, y: e.clientY, touch };
  // A finger scrolls unless it holds still first.
  if (touch) press.timer = setTimeout(() => press && begin(press.x, press.y), 300);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("touchmove", holdStill, { passive: false });
  window.addEventListener("keydown", onKey);
}
function begin(x: number, y: number) {
  if (!press) return;
  const r = press.el.getBoundingClientRect();
  lift.value = { work: press.g, x, y, dx: x - r.left, dy: y - r.top, w: r.width, h: r.height };
  dragging.value = press.g;
  window.getSelection()?.removeAllRanges();
  document.body.style.userSelect = "none";
  hit(x, y);
  frame = requestAnimationFrame(autoScroll);
}
function onMove(e: PointerEvent) {
  if (!press) return;
  if (!lift.value) {
    const far = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.touch) {
      if (far > 8) cancel();
    } else if (far > 4) begin(e.clientX, e.clientY);
    return;
  }
  lift.value.x = e.clientX;
  lift.value.y = e.clientY;
  hit(e.clientX, e.clientY);
}
/** While a finger holds a card, the page does not scroll under it. */
function holdStill(e: TouchEvent) {
  if (lift.value) e.preventDefault();
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") cancel();
}
function onUp() {
  const run = lift.value ? target : null;
  const g = lift.value?.work;
  // The click that ends a drag is not a click on the card's link.
  if (lift.value) window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }));
  stop();
  if (run) run();
  // A move that is saving keeps the card in the air until the board has it in its new place.
  if (!g || !moving.value.has(g.id)) lift.value = null;
}
function swallow(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}
function cancel() {
  stop();
  lift.value = null;
}
function stop() {
  if (press?.timer) clearTimeout(press.timer);
  press = null;
  target = null;
  dragging.value = null;
  over.value = "";
  cancelAnimationFrame(frame);
  document.body.style.userSelect = "";
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  window.removeEventListener("pointercancel", cancel);
  window.removeEventListener("touchmove", holdStill);
  window.removeEventListener("keydown", onKey);
}
onBeforeUnmount(cancel);

/** The innermost target under the pointer that takes this card; a group, else its column. */
function hit(x: number, y: number) {
  const g = dragging.value;
  target = null;
  over.value = "";
  if (!g) return;
  let el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
  while (el) {
    const key = el.dataset.drop ?? "";
    const run = key.startsWith("group:") ? giveTo(g, key.slice(6)) : moveTo(g, key);
    if (run) {
      target = run;
      over.value = key;
      return;
    }
    el = el.parentElement?.closest<HTMLElement>("[data-drop]");
  }
}

/** Near a scroller's edge, it scrolls, faster the nearer; the page itself when nothing else can. */
const EDGE = 48;
function autoScroll() {
  const l = lift.value;
  if (!l || !press) return;
  const step = (d: number) => (d < EDGE ? Math.ceil(16 * (1 - Math.max(d, 0) / EDGE)) : 0);
  let moved = false;
  for (const el of document.elementsFromPoint(l.x, l.y)) {
    if (!(el instanceof HTMLElement) || !el.classList.contains("board-scroll")) continue;
    const r = el.getBoundingClientRect();
    const dy = el.scrollHeight > el.clientHeight ? step(r.bottom - l.y) - step(l.y - r.top) : 0;
    const dx = el.scrollWidth > el.clientWidth ? step(r.right - l.x) - step(l.x - r.left) : 0;
    if (dx || dy) {
      el.scrollBy(dx, dy);
      moved = true;
    }
  }
  if (!moved) {
    const dy = step(innerHeight - l.y) - step(l.y);
    if (dy) window.scrollBy(0, dy);
  }
  hit(l.x, l.y);
  frame = requestAnimationFrame(autoScroll);
}

// ---- cards slide to their new places --------------------------------------------------------
// Before each change the board draws, every card's place is taken; after it, each card that moved
// slides from where it was (the lifted card from where it was dropped). A move, a drag opening a
// gap, or the server's answer moving cards all animate the same way.

const boardEl = ref<HTMLElement | null>(null);
const floatEl = ref<HTMLElement | null>(null);
let was = new Map<string, DOMRect>();
/** A dropped card, from where it was let go: it slides from there into its new place. */
let landedFrom: { id: string; rect: DOMRect } | null = null;
// The board has the card in its new place (the hub's optimistic patch): it comes down there.
watch(
  () => props.columns,
  () => {
    const l = lift.value;
    if (!l || press) return;
    const rect = floatEl.value?.getBoundingClientRect();
    if (rect) landedFrom = { id: l.work.id, rect };
    lift.value = null;
  },
  { flush: "pre" },
);
function places() {
  const seen = new Map<string, number>();
  const out = new Map<string, [HTMLElement, string]>();
  for (const el of boardEl.value?.querySelectorAll<HTMLElement>("[data-card]") ?? []) {
    const id = el.dataset.card ?? "";
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    out.set(`${id}:${n}`, [el, id]);
  }
  return out;
}
watch(
  [() => props.columns, shownColumns, todoInColumn, over, () => Boolean(lift.value)],
  () => {
    was = new Map([...places()].map(([k, [el]]) => [k, el.getBoundingClientRect()]));
    if (landedFrom) was.set(`${landedFrom.id}:0`, landedFrom.rect);
  },
  { flush: "pre" },
);
watch(
  [() => props.columns, shownColumns, todoInColumn, over, () => Boolean(lift.value)],
  () => {
    landedFrom = null;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [k, [el]] of places()) {
      const a = was.get(k);
      if (!a) continue;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 200,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      });
    }
  },
  { flush: "post" },
);

// ---- menus ---------------------------------------------------------------------------------

const menu = ref<{ work: Work; x: number; y: number } | null>(null);
/** Not while a card is held: a long press on a touch screen is also a context menu. */
function openMenu(work: Work, x: number, y: number) {
  if (!lift.value) menu.value = { work, x, y };
}
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
  <div ref="boardEl" class="@container flex flex-col gap-4 md:min-h-0 md:flex-1" :class="picks.size ? 'pb-24' : ''">
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
          ? 'board-scroll flex gap-x-6 gap-y-10 max-md:flex-col md:min-h-0 md:flex-1 md:-mx-1.5 md:overflow-x-auto md:px-1.5 md:pt-1.5 md:-mt-1.5 md:pb-3'
          : 'board-scroll grid gap-x-4 gap-y-10 md:-mx-1 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-1 @[44rem]:grid-cols-4 @[44rem]:grid-rows-[minmax(0,1fr)] @[60rem]:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,5fr)_minmax(0,4fr)] @[60rem]:gap-x-6'
      "
    >
      <section
        v-for="c in shownColumns"
        :id="`col-${c.id}`"
        :key="c.id"
        class="flex min-w-0 flex-col transition-opacity motion-reduce:transition-none"
        :class="[shown === c.id ? '' : 'max-md:hidden', dim(c) ? 'opacity-50' : '', byPerson ? 'md:min-w-[14rem] md:flex-1 md:basis-0' : '']"
        :aria-labelledby="`col-${c.id}-h`"
        :data-drop="dropKey(c)"
      >
        <!-- On a phone the tab above already names the column. -->
        <!-- Held at the top, so the names stay in view while the cards scroll under them. -->
        <div class="sticky top-0 z-20 flex items-baseline gap-2 bg-bg px-2 pt-2 pb-2 max-md:hidden">
          <h2 :id="`col-${c.id}-h`" class="m-0 font-ui text-sm font-[550] tracking-normal">{{ c.label }}</h2>
          <span class="font-ui text-xs text-muted tabular-nums">{{ c.cards.length }}</span>
        </div>
        <div
          class="board-scroll flex min-h-0 grow flex-col gap-3 rounded-2 bg-lane p-2 md:overflow-y-auto"
        >
          <!-- Where a dragged card would land opens up, the card's own height. -->
          <div v-if="lift && isOver(c)" class="drop-gap" :style="{ height: `${lift.h}px` }" aria-hidden="true" />
          <p v-if="!c.cards.length && !(c.id === 'todo' && giving) && !(lift && isOver(c))" class="m-0 font-ui text-sm text-muted">{{ c.hint }}</p>

          <!-- Ready: under who it is for (By person: only what is for anyone). -->
          <template v-if="c.id === 'todo'">
            <div
              v-for="t in todoInColumn"
              :key="t.key || 'anyone'"
              class="flex flex-col gap-2 rounded-2"
              :class="over === `group:${t.key}` ? 'outline-2 outline-offset-2 outline-ink outline-solid' : ''"
              :aria-label="`For ${t.label}`"
              role="group"
              :data-drop="`group:${t.key}`"
            >
              <!-- Being named outranks being in the room: You leads, in ink over an ink rule. -->
              <p
                v-if="!ownColumn(t)"
                class="m-0 flex items-baseline gap-2 border-b pb-1"
                :class="[labelClass, t.key && t.key === me?.id ? '!text-fg font-[550] border-fg' : 'border-line-strong']"
              >
                {{ t.label }} <span class="tabular-nums">{{ t.cards.length || "" }}</span>
              </p>
              <div v-if="lift && over === `group:${t.key}`" class="drop-gap" :style="{ height: `${lift.h}px` }" aria-hidden="true" />
              <ul v-if="t.cards.length" :class="groupList">
                <HubBoardCard
                  v-for="g in full(t) ? t.cards : t.cards.slice(0, GROUP_SHOWN)"
                  :key="g.id"
                  :work="g"
                  :now="now"
                  :data-card="g.id"
                  :moving="moving.has(g.id)"
                  :lifted="lift?.work.id === g.id"
                  pickable
                  :picked="picks.has(g.id)"
                  :picking="picks.size > 0"
                  @pick="pick(g)"
                  @grab="grab(g, $event)"
                  @menu="(x, y) => openMenu(g, x, y)"
                />
              </ul>
              <button
                v-if="t.key !== me?.id && !ownColumn(t) && t.cards.length > GROUP_SHOWN"
                type="button"
                class="linkish self-start font-ui text-xs text-muted"
                :aria-expanded="opened.has(t.key)"
                @click="toggleGroup(t.key)"
              >
                {{ opened.has(t.key) ? "Show fewer" : `${t.cards.length - GROUP_SHOWN} more in ${t.key ? t.label : "Anyone"}` }}
              </button>
              <p v-if="!t.cards.length && over !== `group:${t.key}`" class="m-0 py-2 font-ui text-xs text-muted">Drop here to give it to {{ t.key ? t.label : "anyone" }}.</p>
            </div>
          </template>

          <ul v-else-if="c.cards.length" :class="c.lane === undefined ? cardList : groupList">
            <HubBoardCard
              v-for="g in c.id === 'done' ? doneCards : c.cards"
              :key="g.id"
              :work="g"
              :now="now"
              :data-card="g.id"
              :moving="moving.has(g.id)"
              :lifted="lift?.work.id === g.id"
              :pickable="pickable(g)"
              :picked="picks.has(g.id)"
              :picking="picks.size > 0"
              @pick="pick(g)"
              @grab="grab(g, $event)"
              @menu="(x, y) => openMenu(g, x, y)"
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
      <!-- The card in the air, following the pointer. -->
      <div
        v-if="lift"
        ref="floatEl"
        class="pointer-events-none fixed top-0 left-0 z-50"
        :style="{ width: `${lift.w}px`, transform: `translate(${lift.x - lift.dx}px, ${lift.y - lift.dy}px)` }"
        aria-hidden="true"
      >
        <ul class="m-0 list-none p-0">
          <HubBoardCard :work="lift.work" :now="now" :moving="false" class="lifting" />
        </ul>
      </div>
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
