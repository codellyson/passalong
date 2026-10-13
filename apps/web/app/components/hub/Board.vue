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
  Who has it is the left-hand line: their initials, ⚡ and the agent's name when an agent holds it,
  and a dot for how the hold is doing (`health`, from the server) — with a word when somebody should
  look. The age at the top is since anything last happened to it. Cards about you carry a coral
  mark on their left edge; Done is faded.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";
import { aboutMe, type STAGES } from "~/composables/useWorkLists";

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

/** One or two letters for a name, as a person's mark in a small circle. */
const initials = (name: string) =>
  name.startsWith("#")
    ? "#"
    : name
        .replace(/^@/, "")
        .split(/[\s._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("") || "?";

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
  const heard = (g.held_by ?? []).map((h) => h.since).sort().at(-1);
  const edited = g.updated || g.created;
  return rel(heard && heard > edited ? heard : edited).replace(/ ago$/, "");
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
        class="flex w-full min-w-0 flex-col gap-3 rounded-3 bg-surface p-3 md:flex-[1_0_15rem]"
        :class="shown === col.id ? '' : 'max-md:hidden'"
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
            class="relative flex flex-col rounded-2 bg-raised shadow-edge"
            :class="col.id === 'done' ? 'opacity-70' : ''"
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
              <span class="flex flex-wrap items-center gap-2">
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
              <span class="font-ui text-sm font-medium text-pretty">{{ g.title || "Untitled guide" }}</span>
              <span v-if="g.summary" class="line-clamp-1 font-ui text-xs text-muted">{{ g.summary }}</span>
            </NuxtLink>
            <!-- The footer sits beside the link, not inside it: a button inside an <a> is invalid
                 and would open the page. -->
            <div class="flex flex-col gap-1 px-3 pb-2 font-ui text-xs text-muted">
              <span v-if="g.held_by?.length" class="flex min-w-0 flex-col gap-1">
                <span v-for="(h, i) in g.held_by ?? []" :key="i" class="flex min-w-0 items-center gap-1">
                  <span
                    class="size-1.5 shrink-0 rounded-pill"
                    :class="HEALTH[h.health].dot"
                    role="img"
                    :aria-label="HEALTH[h.health].label"
                  />
                  <span
                    aria-hidden="true"
                    class="grid size-5 shrink-0 place-items-center rounded-pill bg-surface text-[0.625rem] font-semibold text-fg"
                  >{{ initials(h.name) }}</span>
                  <span class="min-w-0 truncate">
                    <b class="font-medium text-fg">{{ h.you ? "You" : h.name }}</b><template v-if="h.agent">
                      · <span aria-hidden="true">⚡</span>{{ h.agent }}</template>
                  </span>
                  <span v-if="HEALTH[h.health].word" class="sr-only">, {{ HEALTH[h.health].word }}</span>
                </span>
                <span
                  v-for="(h, i) in (g.held_by ?? []).filter((x) => HEALTH[x.health].word)"
                  :key="`w${i}`"
                  aria-hidden="true"
                  :class="h.health === 'quiet' ? 'text-danger' : 'text-warn'"
                >{{ h.you ? "You" : h.name.split(" ")[0] }} {{ HEALTH[h.health].word }}</span>
              </span>
              <button
                v-if="canGive(g)"
                type="button"
                class="flex min-w-0 cursor-pointer items-center gap-0.5 self-end rounded-1 border-0 bg-transparent p-0 font-ui text-xs text-muted hover:text-fg"
                :aria-expanded="giving === g.id"
                :aria-label="`For ${address(g)}. Give it to someone else`"
                @click.stop="giving = giving === g.id ? '' : g.id"
                @keydown.esc="giving = ''"
              >
                <span
                  aria-hidden="true"
                  class="grid size-5 place-items-center rounded-pill bg-surface text-[0.625rem] font-semibold text-fg"
                >{{ initials(address(g)) }}</span>
                <span class="ml-0.5 min-w-0 truncate">{{ address(g) }}</span>
                <AppIcon name="reveal" class="shrink-0" />
              </button>
              <span v-else class="flex min-w-0 items-center gap-1 self-end">
                <span
                  aria-hidden="true"
                  class="grid size-5 place-items-center rounded-pill bg-surface text-[0.625rem] font-semibold text-fg"
                >{{ initials(address(g)) }}</span>
                {{ address(g) }}
              </span>
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
  </div>
</template>
