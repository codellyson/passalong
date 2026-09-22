<!--
  The hub: one page for all work, whatever kind it is. See docs/V2.md §11.

  Tasks and handoffs used to be two pages, with two ideas of who has what. They are one thing — a
  guide handed from one context to another — so they are one page, in the order a person needs it:

    Needs you     work handed in for you to review (HubTaskReview), agents stuck on you, and guides
                  handed to you that you have not answered
    Working now   who is on what, across every kind (HubWorkingNow, GET /v1/working)
    Open          what nobody is on yet: ready, blocked and draft tasks, a teammate's task waiting
                  for its author, and handoffs you sent that are still out
    Done          folded, because it is most of what exists and none of what needs doing

  The title says whose work this is — "Work in [Khaime ▾]" — with the team picker in it, and the line
  under it is the sections' own counts, each a link to its section.

  /hub/guides and /hub/tasks redirect here with their query, so `?q=` and `?follows=` links still
  work. `?done=1` opens Done, which is where the free-plan banner sends you to make room.
-->
<script setup lang="ts">
import type { Guide, Task } from "~/types/hub";
import { ASKS } from "~/utils/asks";
import { boardStates, stateOf } from "~/utils/guide-state";

usePage({
  title: "Work · Passalong",
  description: "What needs you, who is working on what, what is open, and what is done.",
  noindex: true,
});

const { data, scope, loading, failed, updating, scopeChanging } = useHub();

/** Either half of what the guide sections are built from gave up loading. The shell says so. */
const unavailable = computed(() => failed.value.guides || failed.value.board);
/** Either half is still on its way. */
const waiting = computed(() => !unavailable.value && (loading.value.guides || loading.value.board));

// An account with nothing in it is not looking at a list. It gets the steps that lead somewhere,
// but only once both lists have arrived empty, or every first load would flash onboarding.
const first = computed(
  () =>
    Boolean(data.value.me) &&
    !waiting.value &&
    !unavailable.value &&
    !loading.value.tasks &&
    data.value.guides.length === 0 &&
    data.value.tasks.length === 0,
);

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
const terms = computed(() => q.value.trim().toLowerCase().split(/\s+/).filter(Boolean));
const hit = (fields: unknown[]) => {
  if (!terms.value.length) return true;
  const hay = fields.join("\n").toLowerCase();
  return terms.value.every((t) => hay.includes(t));
};

// ---- guides: handoffs and bugs, as the lanes always sorted them ----------------------------------

const fromBoard = computed(() => boardStates(data.value.board));
const me = computed(() => data.value.me?.handle || null);
const hasTeams = computed(() => Boolean(data.value.me?.teams.length));

/**
 * The list is scoped and the board is not. Across all teams, a guide sent to you from outside your
 * teams is on the board and not in the list — the one thing here that must not go missing.
 * Tasks are left out: they have their own sections below, from the task queue.
 */
const guides = computed<Guide[]>(() => {
  const list = data.value.guides;
  const all =
    scope.value !== "all"
      ? list
      : [
          ...list,
          ...(data.value.board?.waiting ?? []).filter((g) => !list.some((x) => x.id === g.id)),
        ];
  return all.filter((g) => g.kind !== "task");
});

const matches = (g: Guide) => {
  if (follows.value && g.parent !== follows.value) return false;
  return hit([
    g.title,
    g.source_context,
    g.from,
    g.from_name,
    g.to,
    g.to_name,
    g.team_name,
    g.id,
    g.report_title,
    ...(g.tags || []),
    ...(g.stack_assumptions || []),
  ]);
};

const lanes = computed(() =>
  arrange(
    guides.value.filter(matches).map((g) => ({ g, state: stateOf(g, fromBoard.value, me.value) })),
  ),
);
const sentCount = computed(() =>
  lanes.value.sent.reduce((n, e) => n + ("row" in e ? 1 : e.group.rows.length), 0),
);

// ---- tasks -----------------------------------------------------------------------------------

const taskHit = (t: Task) =>
  !follows.value && hit([t.title, t.id, t.target, t.claim?.note, t.claim?.report_title]);
const tasks = computed(() => data.value.tasks.filter(taskHit));

/** Yours, and waiting on you: mirrors the groups in HubTaskReview. */
const taskNeedsYou = (t: Task) =>
  t.mine &&
  (t.state === "review" ||
    t.state === "stalled" ||
    (t.state === "claimed" && /^BLOCKED:/i.test(t.claim?.note || "")));
const reviewCount = computed(() => tasks.value.filter(taskNeedsYou).length);

/** Tasks nobody is on and nobody needs to review: claimed ones are in Working now. */
const OPEN: { state: Task["state"]; title: string; note: string }[] = [
  {
    state: "review",
    title: "Waiting for its author",
    note: "A teammate's task, handed in and waiting on them.",
  },
  {
    state: "ready",
    title: "Ready",
    note: "The next agent in the right repo takes these, oldest first.",
  },
  {
    state: "blocked",
    title: "Blocked",
    note: "Waiting until the tasks they depend on are approved.",
  },
  { state: "draft", title: "Draft", note: "Not in the queue until you make them ready." },
];
const openTasks = computed(() => {
  const out = new Map<Task["state"], Task[]>();
  for (const t of tasks.value)
    if (!taskNeedsYou(t) && OPEN.some((c) => c.state === t.state))
      out.set(t.state, [...(out.get(t.state) || []), t]);
  return out;
});
const openTaskCount = computed(() =>
  [...openTasks.value.values()].reduce((n, l) => n + l.length, 0),
);
const doneTasks = computed(() => tasks.value.filter((t) => t.state === "done"));

// ---- the counts line -------------------------------------------------------------------------

/** Handoffs you wrote that somebody handed in, narrowed by the search like everything else. */
const handedIn = computed(() =>
  data.value.handedIn.filter(
    (h) => !follows.value && hit([h.title, h.id, h.note, h.place, h.by.name, h.by.handle]),
  ),
);
const needsCount = computed(
  () => reviewCount.value + handedIn.value.length + lanes.value.needs.length,
);
const workingCount = computed(() => data.value.working.length);
const openCount = computed(() => openTaskCount.value + sentCount.value);
const doneCount = computed(() => doneTasks.value.length + lanes.value.done.length);

const showDone = ref(route.query.done === "1");
watch(
  () => route.query.done,
  (v) => {
    if (v === "1") showDone.value = true;
  },
);
/** A search looks everywhere, so it opens the shelf rather than hiding matches behind it. */
const doneOpen = computed(() => showDone.value || searching.value);

const heading = "m-0 flex items-baseline gap-2 text-h3 font-bold text-fg";
const count = "font-ui text-sm font-normal text-muted tabular-nums";
const sub = "m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted";
const list = "m-0 list-none overflow-hidden rounded-3 bg-raised p-0 shadow-edge";
</script>

<template>
  <HubShell :heading="first ? 'Get started' : ''">
    <!-- A token-only account cannot sign in from any other browser, whichever of the two this page
         is showing. -->
    <HubClaim />

    <HubFirstRun v-if="first" />

    <div v-else class="flex flex-col gap-10">
      <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div class="flex min-w-0 flex-col gap-1">
          <h1 class="m-0 flex flex-wrap items-center gap-2 text-h2">
            Work<template v-if="hasTeams"> in <HubScopes /></template>
          </h1>
          <p v-if="waiting" class="m-0 h-5 font-ui text-sm text-muted" aria-hidden="true">
            <span class="inline-block h-2.5 w-56 rounded-pill bg-line align-middle" />
          </p>
          <p v-else class="m-0 font-ui text-sm text-muted">
            <span v-if="updating || scopeChanging" role="status" class="mr-2 text-muted">Updating…</span>
            <!-- A count is a link only when there is something to jump to. -->
            <component :is="needsCount ? 'a' : 'span'" :href="needsCount ? '#needs' : undefined">{{ needsCount }} need you</component>
            ·
            <component :is="workingCount ? 'a' : 'span'" :href="workingCount ? '#working-h' : undefined">{{ workingCount }} being worked on</component>
            ·
            <component :is="openCount ? 'a' : 'span'" :href="openCount ? '#open' : undefined">{{ openCount }} open</component>
            ·
            <component :is="doneCount ? 'a' : 'span'" :href="doneCount ? '#done' : undefined" @click="showDone = true">{{ doneCount }} done</component>
          </p>
        </div>
        <div class="toolbar m-0 min-w-[14rem] grow basis-56 sm:max-w-xs">
          <input v-model="q" type="search" placeholder="Search work" aria-label="Search work" />
        </div>
      </div>

      <!-- Named, not "one guide": the filter is only useful if you can see which guide it is. -->
      <p v-if="follows" class="-mt-6 mb-0 font-ui text-sm text-muted">
        Follow-ups to
        <b class="font-medium text-fg">{{ followed?.title || "this guide" }}</b>: more context
        added to it.
        <button class="linkish" type="button" @click="copy(followUpAsk(follows), $event.currentTarget)"><span data-label>Copy a follow-up ask</span></button>
        ·
        <NuxtLink to="/hub">Show all work</NuxtLink>
      </p>

      <!-- A list that failed to load draws nothing rather than its empty state: the shell's banner
           already says what happened and offers Try again. -->
      <template v-if="!unavailable">
        <section
          id="needs"
          aria-labelledby="lane-needs"
          class="flex scroll-mt-4 flex-col gap-3 transition-opacity"
          :class="scopeChanging ? 'opacity-60' : ''"
          :aria-busy="waiting || scopeChanging"
        >
          <h2 id="lane-needs" :class="heading">
            Needs you <span :class="count">{{ needsCount }}</span>
          </h2>
          <HubTaskReview :tasks="tasks" />
          <div v-if="handedIn.length">
            <h3 :class="sub">Handed in · {{ handedIn.length }}</h3>
            <p class="mt-1 mb-3 font-ui text-sm text-muted">
              Handoffs you sent, done where they went. Close them, or send one back with why.
            </p>
            <ul :class="list">
              <HubHandedInRow v-for="h in handedIn" :key="`${h.id}-${h.place}`" :h="h" />
            </ul>
          </div>
          <HubSkeleton v-if="waiting" :rows="3" label="Loading what needs you" />
          <ul v-else-if="lanes.needs.length" :class="list">
            <HubInboxRow v-for="r in lanes.needs" :key="r.g.id" :row="r" />
          </ul>
          <p v-if="!waiting && !needsCount" class="m-0 font-ui text-sm text-muted">
            {{ searching ? "Nothing waiting on you matches." : "Nothing is waiting on you. Anything an agent hands in lands here." }}
            <button v-if="searching" class="linkish" type="button" @click="clearSearch">Clear search</button>
          </p>
        </section>

        <HubWorkingNow :rows="data.working" />

        <section id="open" aria-labelledby="lane-open" class="flex scroll-mt-4 flex-col gap-6">
          <h2 id="lane-open" :class="heading">
            Open <span :class="count">{{ openCount }}</span>
          </h2>

          <template v-for="col in OPEN" :key="col.state">
            <div v-if="openTasks.get(col.state)?.length">
              <h3 :class="sub">{{ col.title }} · {{ openTasks.get(col.state)?.length }}</h3>
              <p class="mt-1 mb-3 font-ui text-sm text-muted">{{ col.note }}</p>
              <ul :class="list">
                <HubTaskRow v-for="t in openTasks.get(col.state)" :key="t.id" :t="t" />
              </ul>
            </div>
          </template>

          <div v-if="waiting || lanes.sent.length">
            <h3 :class="sub">Handoffs you sent · {{ sentCount }}</h3>
            <p class="mt-1 mb-3 font-ui text-sm text-muted">Still out: nobody has said it worked yet.</p>
            <HubSkeleton v-if="waiting" :rows="2" label="Loading what you sent" />
            <ul v-else :class="list">
              <template v-for="e in lanes.sent" :key="'row' in e ? e.row.g.id : `report-${e.group.report}`">
                <HubInboxRow v-if="'row' in e" :row="e.row" />
                <HubReportRow v-else :group="e.group" :open="searching" />
              </template>
            </ul>
          </div>

          <p v-if="!waiting && !openCount" class="m-0 font-ui text-sm text-muted">
            {{ searching ? "Nothing open matches." : "Nothing is open." }}
            <button v-if="searching" class="linkish" type="button" @click="clearSearch">Clear search</button>
            <button v-else class="linkish" type="button" @click="copy(ASKS.task, $event.currentTarget)">
              <span data-label>Copy a task ask for your agent</span>
            </button>
          </p>
        </section>

        <section id="done" aria-labelledby="lane-done" class="flex scroll-mt-4 flex-col gap-3">
          <h2 class="m-0">
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
              :aria-expanded="doneOpen"
              @click="showDone = !showDone"
            >
              <span id="lane-done" :class="heading">
                Done <span v-if="!waiting" :class="count">{{ doneCount }}</span>
              </span>
              <AppIcon
                name="reveal"
                class="text-muted transition-[rotate] duration-150 ease-out"
                :class="doneOpen ? 'rotate-180' : ''"
              />
            </button>
          </h2>
          <template v-if="doneOpen">
            <ul v-if="doneTasks.length" :class="list">
              <HubTaskRow v-for="t in doneTasks" :key="t.id" :t="t" />
            </ul>
            <ul v-if="lanes.done.length" :class="list">
              <HubInboxRow v-for="r in lanes.done" :key="r.g.id" :row="r" />
            </ul>
            <p v-if="!doneCount" class="m-0 font-ui text-sm text-muted">
              {{ searching ? "Nothing finished matches." : "Nothing finished yet." }}
            </p>
          </template>
        </section>
      </template>

      <HubActivity />
    </div>
  </HubShell>
</template>
