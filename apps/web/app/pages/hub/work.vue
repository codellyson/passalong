<!--
  /hub/work: one page for all work, whatever kind it is. See docs/V2.md §11. Home (/hub) shows
  the same four counts, from useWorkLists, and links here.

  Tasks and handoffs used to be two pages, with two ideas of who has what. They are one thing — a
  guide handed from one context to another — so they are one page, in the order a person needs it:

    Needs you     one list (HubNeedsYou): work handed in for you to review, agents stuck on you, and guides
                  handed to you that you have not answered
    Taken         who has what, across every kind (HubTaken, GET /v1/working)
    Open          what nobody is on yet: ready, blocked and draft tasks, a teammate's task waiting
                  for its author, and handoffs you sent that are still out
    Done          folded, because it is most of what exists and none of what needs doing

  The title says whose work this is — "Work in [Khaime ▾]" — with the team picker in it. The four
  are tabs, each with its count, so an empty one is a zero on a label rather than a section.

  /hub/guides, /hub/tasks and a /hub link carrying a work query redirect here with that query, so `?q=` and `?follows=` links still
  work. `?tab=` opens a tab; `?done=1` opens Done, which is where the free-plan banner sends you.
-->
<script setup lang="ts">
import { ASKS } from "~/utils/asks";

usePage({
  title: "Work · Passalong",
  description: "What needs you, who is working on what, what is open, and what is done.",
  noindex: true,
});

const { data, updating, scopeChanging } = useHub();

const route = useRoute();
const text = (v: unknown) => (typeof v === "string" ? v : "");
/** Seeded from the URL so a link elsewhere can open a search; watched, because a link on this page
    changes the query without remounting it. */
const q = ref(text(route.query.q));
watch(
  () => route.query.q,
  (v) => {
    q.value = text(v);
  },
);
/** `?follows=<id>`: guides naming it as their parent. */
const follows = computed(() => text(route.query.follows));
const followed = computed(() =>
  follows.value ? data.value.guides.find((g) => g.id === follows.value) || null : null,
);
const searching = computed(() => Boolean(q.value.trim() || follows.value));
function clearSearch() {
  q.value = "";
  if (route.query.q || route.query.follows)
    navigateTo({ query: { ...route.query, q: undefined, follows: undefined } }, { replace: true });
}
const {
  unavailable,
  waiting,
  hasTeams,
  lanes,
  sentCount,
  tasks,
  OPEN,
  openTasks,
  doneTasks,
  handedIn,
  needsCount,
  workingCount,
  openCount,
  doneCount,
} = useWorkLists(q, follows);

/**
 * One section at a time, as tabs, each carrying its count. Four stacked sections spent the page on
 * whichever were empty; a tab with nothing in it is a zero on a label instead.
 *
 * The tab is in the URL (`?tab=`), so a link can open one and Back goes where you were. `?done=1`,
 * which the free-plan banner sends, still opens Done. With no tab asked for, it opens the first
 * that has something in it, in the order of what needs a person most.
 */
const TABS = ["needs", "working", "open", "done"] as const;
type Tab = (typeof TABS)[number];
const asked = computed<Tab | null>(() => {
  const t = text(route.query.tab);
  if ((TABS as readonly string[]).includes(t)) return t as Tab;
  return route.query.done === "1" ? "done" : null;
});
const fallback = computed<Tab>(() =>
  needsCount.value ? "needs" : workingCount.value ? "working" : openCount.value ? "open" : "needs",
);
const tab = computed<Tab>(() => asked.value ?? fallback.value);
// A selection belongs to the list it was made on: switching tabs ends it rather than carrying
// ticks on rows nobody can see.
const { stop: stopSelecting } = useSelection();
watch(tab, stopSelecting);
const tabs = computed(() => [
  {
    id: "needs" as const,
    label: "Needs you",
    count: needsCount.value,
    tone: needsCount.value ? "accent" : "",
  },
  // The id stays `working`: it is the `?tab=` in a link somebody may have sent. Only the label
  // changed, because the label was wrong — a stalled card is on this list and is not working.
  { id: "working" as const, label: "Being worked on", count: workingCount.value, tone: "" },
  { id: "open" as const, label: "Open", count: openCount.value, tone: "" },
  { id: "done" as const, label: "Done", count: doneCount.value, tone: "" },
]);

function pick(id: Tab) {
  navigateTo({ query: { ...route.query, tab: id, done: undefined } }, { replace: true });
}
// On a phone the four tabs are wider than the screen and the row scrolls: keep the chosen one in
// view, horizontally only, so opening ?tab=done does not leave Done off the edge.
const tablist = ref<HTMLElement | null>(null);
function showTab() {
  const row = tablist.value;
  const el = document.getElementById(`tab-${tab.value}`);
  if (!row || !el) return;
  const left = el.offsetLeft - row.offsetLeft;
  if (left < row.scrollLeft || left + el.offsetWidth > row.scrollLeft + row.clientWidth)
    row.scrollLeft = left - 8;
}
onMounted(() => nextTick(showTab));
watch([tab, tablist, waiting], () => nextTick(showTab));

function arrowTabs(e: KeyboardEvent) {
  const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
  if (!step) return;
  const next = TABS[(TABS.indexOf(tab.value) + step + TABS.length) % TABS.length]!;
  pick(next);
  nextTick(() => document.getElementById(`tab-${next}`)?.focus());
}

const sub = "m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted";
// No overflow-hidden: it clipped the menus rows open (More, give to…). The first and last rows take
// the list's corners instead, so their backgrounds do not square them off.
const list =
  "m-0 list-none rounded-3 bg-raised p-0 shadow-edge [&>li:first-child]:rounded-t-3 [&>li:last-child]:rounded-b-3";
</script>

<template>
  <HubShell>
    <div class="flex flex-col gap-6">
      <h1 class="m-0 flex flex-wrap items-center gap-2 text-h2">
        Work<template v-if="hasTeams"> in <HubScopes /></template>
        <span v-if="updating || scopeChanging" role="status" class="font-ui text-sm font-normal text-muted">Updating…</span>
      </h1>


      <!-- Named, not "one guide": the filter is only useful if you can see which guide it is. -->
      <p v-if="follows" class="m-0 font-ui text-sm text-muted">
        Follow-ups to
        <b class="font-medium text-fg">{{ followed?.title || "this guide" }}</b>: more context
        added to it.
        <button class="linkish" type="button" @click="copy(followUpAsk(follows), $event.currentTarget)"><span data-label>Copy a follow-up ask</span></button>
        ·
        <NuxtLink to="/hub/work">Show all work</NuxtLink>
      </p>

      <!-- A list that failed to load draws nothing rather than its empty state: the shell's banner
           already says what happened and offers Try again. -->
      <template v-if="!unavailable">
        <!-- Tabs and search are one band: both answer "which of my work am I looking at", and as
             two rows — search floated against the title, tabs under it — they read as two unrelated
             decisions with a gulf of empty page between them. -->
        <div class="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-line">
          <div
            ref="tablist"
            class="flex min-w-0 grow gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
            role="tablist"
            aria-label="Work"
            @keydown="arrowTabs"
          >
            <button
              v-for="t in tabs"
              :id="`tab-${t.id}`"
              :key="t.id"
              type="button"
              role="tab"
              :aria-selected="tab === t.id"
              :aria-controls="`panel-${t.id}`"
              :tabindex="tab === t.id ? 0 : -1"
              class="-mb-px flex cursor-pointer items-center gap-2 border-0 border-b-2 bg-transparent px-3 py-2.5 font-ui text-sm whitespace-nowrap"
              :class="tab === t.id ? 'border-accent font-semibold text-fg' : 'border-transparent text-muted hover:text-fg'"
              @click="pick(t.id)"
            >
              {{ t.label }}
              <span
                v-if="!waiting"
                class="min-w-5 rounded-pill px-1.5 py-0.5 text-center text-xs tabular-nums"
                :class="t.tone === 'accent' ? 'bg-accent text-accent-fg font-semibold' : 'bg-surface text-muted'"
              >{{ t.count }}</span>
            </button>
          </div>
          <div class="toolbar m-0 mb-2 w-full min-w-[12rem] sm:w-auto sm:max-w-xs">
            <input v-model="q" type="search" placeholder="Search work" aria-label="Search work" />
          </div>
        </div>

        <section
          :id="`panel-${tab}`"
          role="tabpanel"
          :aria-labelledby="`tab-${tab}`"
          class="flex flex-col gap-8 transition-opacity"
          :class="scopeChanging ? 'opacity-60' : ''"
          :aria-busy="waiting || scopeChanging"
        >
          <!-- Picking several to archive or delete: on the lists that are shelves (Open, Done), not
               on Needs you or Being worked on, which are work waiting on an answer. -->
          <HubSkeleton v-if="waiting" :rows="3" label="Loading work" />
          <template v-else>
          <HubBulkBar v-if="(tab === 'open' && openCount) || (tab === 'done' && doneCount)" />

          <!-- ---- Needs you ---- -->
          <template v-if="tab === 'needs'">
            <!-- One list for everything that needs you, the picked item beside it. Handed in and Sent
                 to you used to be lists of their own below a task review a screen tall, where nobody
                 found them. -->
            <HubNeedsYou :tasks="tasks" :handed-in="handedIn" :rows="lanes.needs" />
            <!-- All clear is one quiet line, not an empty section. -->
            <div
              v-if="!needsCount"
              class="flex items-center gap-3 rounded-3 bg-surface px-4 py-3 font-ui text-sm"
            >
              <span class="grid size-6 shrink-0 place-items-center rounded-pill bg-ok-soft text-ok" aria-hidden="true">
                <AppIcon name="check" />
              </span>
              <p class="m-0 text-pretty">
                <template v-if="searching">
                  <b class="font-semibold text-fg">Nothing waiting on you matches.</b>{{ " " }}<button class="linkish" type="button" @click="clearSearch">Clear search</button>
                </template>
                <template v-else>
                  <b class="font-semibold text-fg">Nothing needs you.</b>{{ " " }}<span class="text-muted">Work an agent hands in, or a teammate sends you, lands here.</span>
                </template>
              </p>
            </div>
          </template>

          <!-- ---- Taken ---- -->
          <template v-else-if="tab === 'working'">
            <HubTaken v-if="data.working.length" :rows="data.working" bare />
            <p v-else class="m-0 font-ui text-sm text-muted">
              Nobody has taken anything yet. When an agent or a teammate takes something, it shows
              here with who has it and what they last said.
            </p>
          </template>

          <!-- ---- Open ---- -->
          <template v-else-if="tab === 'open'">
            <template v-for="col in OPEN" :key="col.state">
              <div v-if="openTasks.get(col.state)?.length" class="border-l-2 pl-4" :class="col.edge">
                <h3 :class="sub" class="flex items-center gap-2">
                  {{ col.title }}
                  <span class="rounded-pill px-2 py-0.5 font-ui text-xs font-semibold tabular-nums" :class="col.badge">{{ openTasks.get(col.state)?.length }}</span>
                </h3>
                <p class="mt-1 mb-3 font-ui text-sm text-muted">{{ col.note }}</p>
                <HubTaskTable :tasks="openTasks.get(col.state) || []" />
              </div>
            </template>
            <div v-if="lanes.sent.length">
              <h3 :class="sub">Handoffs you sent · {{ sentCount }}</h3>
              <p class="mt-1 mb-3 font-ui text-sm text-muted">Still out: nobody has said it worked yet.</p>
              <HubGuideTable :entries="lanes.sent" :open="searching" />
            </div>
            <p v-if="!openCount" class="m-0 font-ui text-sm text-muted">
              {{ searching ? "Nothing open matches." : "Nothing is open." }}
              <button v-if="searching" class="linkish" type="button" @click="clearSearch">Clear search</button>
              <button v-else class="linkish" type="button" @click="copy(ASKS.task, $event.currentTarget)">
                <span data-label>Copy a prompt for your agent</span>
              </button>
            </p>
          </template>

          <!-- ---- Done ---- -->
          <template v-else>
            <HubTaskTable v-if="doneTasks.length" :tasks="doneTasks" />
            <HubGuideTable v-if="lanes.done.length" :entries="lanes.done" />
            <p v-if="!doneCount" class="m-0 font-ui text-sm text-muted">
              {{ searching ? "Nothing finished matches." : "Nothing finished yet." }}
            </p>
          </template>
          </template>
        </section>
      </template>

    </div>
  </HubShell>
</template>
