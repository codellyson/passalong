<!--
  The team board: five columns, the same for everyone who opens it, like any shared task board. A
  card says what kind of work it is, who it is for and who has it; opening it goes to the guide's
  own page, where anyone in the team can move it on. Which column a card is in is the server's
  (`stage`), so nobody's board is arranged differently from anybody else's.

  From md the columns sit side by side, at least 15rem each and sharing what is left, and the board
  — not the page — scrolls sideways when they do not fit: wrapped into a grid they read as five boxes, not a board. On a phone
  one column shows at a time, picked from a row of tabs, as Trello and Linear do.

  Who a card is for is its footer's right-hand line, and that line is the "Give to…" control: the
  answer and the way to change it are one thing, and a separate button made every card a row taller.
  Who has it is the same line's left side: a dot for how the hold is doing (`health`, from the
  server), their name, ⚡ when an agent holds it, and a word only when somebody should look. The age at the top is since anything last happened to it. Cards about you carry a coral
  mark on their left edge; Done is faded.

  The round dot at a card's top-left selects it for the bar that archives or deletes several at
  once (HubBulkBar, on the page). It shows on hover and focus, and stays once anything is
  selected; on a touch screen, which has no hover, it always shows. Only cards the viewer may
  archive or delete (`manage`) have one. Right-clicking a card opens its quick actions
  (HubCardMenu).

  A card can be dragged to another column when that column means an act the card's own page
  offers: back to Draft, Stop this agent (To do, from In progress; asked first), Archive (Done) and
  Unarchive (out of Done). Draft to To do opens the card's page, because Ready asks which repo the
  task is for. While a card is dragged, the columns it cannot go to fade. The same acts are in the
  right-click menu, which is the way there from a keyboard or a phone.
-->
<script setup lang="ts">
import { aboutMe, type STAGES } from "~/composables/useWorkLists";
import type { Guide, Task, Working } from "~/types/hub";

const props = defineProps<{
  columns: ((typeof STAGES)[number] & { cards: Guide[] })[];
}>();

/** Done is most of what exists; the column shows the newest and says how many more. */
const DONE_SHOWN = 20;

/** Who it was sent to, in the words the rest of the hub uses. */
function address(g: Guide) {
  if (g.to) return g.to_name || `@${g.to}`;
  if (g.to_group) return `#${g.to_group}`;
  if (g.team) return g.team_name || g.team;
  return "Private";
}
/** The picker's name for where it is now: `@handle`, `#group`, or "" for the whole team. */
const addressed = (g: Guide) => (g.to ? `@${g.to}` : g.to_group ? `#${g.to_group}` : "");
/** Anyone in the team can give work to someone else, as they can move it. Done work stays put. */
const canGive = (g: Guide) => Boolean(g.team) && g.stage !== "done";

/** The one card whose "Give to…" picker is open. A click anywhere else closes it. */
const giving = ref("");
const root = ref<HTMLElement | null>(null);
function onDocument(e: MouseEvent) {
  if (giving.value && !root.value?.contains(e.target as Node)) giving.value = "";
}
onMounted(() => document.addEventListener("click", onDocument));
onBeforeUnmount(() => document.removeEventListener("click", onDocument));

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
  review: { dot: "bg-accent", word: "", label: "handed in" },
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

const { onArchive, onCloseGuide, onTaskDraft, onTakeBack } = useHub();

/** The card being dragged, and the column under it. */
const dragging = ref<Guide | null>(null);
const over = ref("");
const holding = (g: Guide) => (g.held_by ?? []).some((h) => h.health !== "review");

/**
 * What dropping `g` in column `to` does, or null when it does nothing there. Each is the act the
 * guide's page offers, under the same rule: anyone in the team moves work, `manage` archives.
 */
function moveTo(g: Guide, to: string): (() => unknown) | null {
  const from = g.stage;
  const task = g.kind === "task";
  if (from === to) return null;
  if (task && from === "draft" && to === "todo") return () => navigateTo(`/hub/g/${g.id}`);
  if (task && from === "todo" && to === "draft" && !holding(g))
    return () => onTaskDraft({ id: g.id } as Task);
  if (from === "working" && to === "todo")
    return () =>
      confirm(`Stop the agent working on "${g.title}"? It goes back to To do.`) &&
      onTakeBack({ id: g.id } as Working);
  if (to === "done" && g.manage && from !== "review" && g.status !== "consumed")
    return () => (task ? onArchive(g, true) : onCloseGuide(g));
  if (from === "done" && to === "todo" && g.manage && g.status === "consumed")
    return () => onArchive(g, false);
  return null;
}

function dragStart(g: Guide, e: DragEvent) {
  dragging.value = g;
  e.dataTransfer?.setData("text/plain", g.title || g.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function dragEnd() {
  dragging.value = null;
  over.value = "";
}
function dragOver(col: string, e: DragEvent) {
  if (!dragging.value || !moveTo(dragging.value, col)) return;
  e.preventDefault();
  over.value = col;
}
async function drop(col: string) {
  const act = dragging.value && moveTo(dragging.value, col);
  dragEnd();
  if (act) await act();
}

/** The column a phone shows: the first with anything in it, until a tab is picked. */
const picked = ref("");
const shown = computed(
  () => picked.value || props.columns.find((c) => c.cards.length)?.id || "todo",
);
</script>

<template>
  <div ref="root" class="flex flex-col gap-3">
    <div role="tablist" aria-label="Board columns" class="flex gap-1 overflow-x-auto [scrollbar-width:none] md:hidden">
      <button
        v-for="col in columns"
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

    <div class="flex items-start gap-3 md:gap-2 md:overflow-x-auto md:pb-2">
      <section
        v-for="col in columns"
        :key="col.id"
        class="flex w-full min-w-0 flex-col gap-3 rounded-3 bg-surface p-3 transition-opacity md:flex-[1_0_15rem]"
        :class="[
          shown === col.id ? '' : 'max-md:hidden',
          dragging && dragging.stage !== col.id && !moveTo(dragging, col.id) ? 'opacity-50' : '',
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
        <p v-if="!col.cards.length" class="m-0 px-1 font-ui text-xs text-muted">{{ col.hint }}</p>
        <ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
          <li
            v-for="g in col.id === 'done' ? col.cards.slice(0, DONE_SHOWN) : col.cards"
            :key="g.id"
            class="group relative flex flex-col rounded-2 bg-raised shadow-edge"
            :class="[
              col.id === 'done' ? 'opacity-70' : '',
              has(g.id) ? 'ring-2 ring-[var(--accent)]' : '',
            ]"
            :draggable="giving !== g.id"
            @dragstart="dragStart(g, $event)"
            @dragend="dragEnd"
            @contextmenu.prevent="openMenu(g, $event)"
          >
            <!-- Beside the link, not in it: a control inside an <a> would open the page. -->
            <input
              v-if="g.manage"
              type="checkbox"
              class="absolute top-2 left-3 z-10 size-4 cursor-pointer appearance-none rounded-pill border border-line-strong bg-field transition-opacity checked:border-[var(--accent)] checked:bg-[var(--accent)] checked:shadow-[inset_0_0_0_3px_var(--field)] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              :class="selected.length ? 'opacity-100' : 'opacity-0'"
              :checked="has(g.id)"
              :aria-label="`Select ${g.title || 'this guide'}`"
              @change="pick(g)"
            >
            <!-- About you: a coral mark, the one place coral is used here — never a fill. -->
            <span
              v-if="aboutMe(g)"
              aria-hidden="true"
              class="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-[var(--coral)]"
            />
            <NuxtLink
              :to="`/hub/g/${g.id}`"
              class="flex flex-col gap-2 rounded-2 px-3 pt-2 pb-1 text-fg no-underline transition-transform active:scale-[0.96]"
            >
              <span class="flex flex-wrap items-center gap-2 pl-6">
                <span
                  v-if="kindBadge(g.kind)"
                  class="rounded-1 border px-1 py-0.5 font-ui text-xs leading-none font-medium tracking-wide uppercase"
                  :class="kindBadge(g.kind)!.class"
                >{{ kindBadge(g.kind)!.label }}</span>
                <span
                  v-if="g.can_review"
                  class="rounded-pill bg-accent-soft px-2 py-0.5 font-ui text-xs font-semibold text-accent"
                >Your review</span>
                <span class="ml-auto font-ui text-xs tabular-nums text-muted">{{ age(g) }}</span>
              </span>
              <span class="line-clamp-2 font-ui text-sm font-medium text-pretty">{{ g.title || "Untitled guide" }}</span>
            </NuxtLink>
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
                class="ml-auto flex min-w-0 cursor-pointer items-center gap-0.5 rounded-1 border-0 bg-transparent p-0 font-ui text-xs text-muted hover:text-fg"
                :aria-expanded="giving === g.id"
                :aria-label="`For ${address(g)}. Give it to someone else`"
                @click.stop="giving = giving === g.id ? '' : g.id"
                @keydown.esc="giving = ''"
              >
                <span class="min-w-0 truncate">{{ address(g) }}</span>
                <AppIcon name="reveal" class="shrink-0" />
              </button>
              <span v-else class="ml-auto min-w-0 truncate">{{ address(g) }}</span>
            </div>
            <!-- In the card's flow rather than floating: the board scrolls sideways, and a scrolling
                 box clips anything that hangs outside it. -->
            <div v-if="giving === g.id" class="mx-2 mb-2 rounded-2 bg-field p-2 shadow-edge" @click.stop>
              <HubAssignPicker :id="g.id" :team="g.team || ''" :to="addressed(g)" @done="giving = ''" />
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
      @give="giving = menu!.guide.id"
    />
  </div>
</template>
