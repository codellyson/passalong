<!--
  The hub: one page, three questions. What needs you, what you sent and where it got to, and what
  is finished — folded, because it is most of what exists and none of what needs doing.

  The title says whose guides these are — "Guides in [Khaime ▾]" — with the team picker in it, and
  the line under it is the three sections' own counts, each a link to its section. Those numbers
  used to be computed separately in the page header and disagreed with the sections on the same
  screen.

  /hub/guides redirects here with its query, so `?q=` and `?follows=` links still work. `?done=1`
  opens Done, which is where the free-plan banner sends you to make room.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";
import { boardStates, stateOf } from "~/utils/guide-state";

usePage({
  title: "Guides · Passalong",
  description: "Guides sent to you, guides you sent, and what's done.",
  noindex: true,
});

const { data, scope, loading, failed, updating, scopeChanging } = useHub();

/** Either half of what the sections are built from gave up loading. The shell's banner says so. */
const unavailable = computed(() => failed.value.guides || failed.value.board);
/** Either half of what the sections are built from is still on its way. */
const waiting = computed(() => !unavailable.value && (loading.value.guides || loading.value.board));

// An account with nothing in it is not looking at a list. It gets the two things that lead
// somewhere instead, and a heading that says so — but only once the list has actually arrived
// empty, or every first load would flash the onboarding screen at people with guides.
const first = computed(
  () =>
    Boolean(data.value.me) &&
    !waiting.value &&
    !unavailable.value &&
    data.value.guides.length === 0,
);

const route = useRoute();
const text = (v: unknown) => (typeof v === "string" ? v : "");
/** Seeded from the URL, so a link elsewhere can open a search; watched, because a link on this
    same page changes the query without remounting it. */
const q = ref(text(route.query.q));
watch(
  () => route.query.q,
  (v) => {
    q.value = text(v);
  },
);
/** `?follows=<id>`: guides naming it as their parent. A follow-up does not contain its parent's
    title, so this cannot be a search term. */
const follows = computed(() => text(route.query.follows));
const searching = computed(() => Boolean(q.value.trim() || follows.value));

const fromBoard = computed(() => boardStates(data.value.board));
const me = computed(() => data.value.me?.handle || null);
const hasTeams = computed(() => Boolean(data.value.me?.teams.length));

/**
 * The list is scoped and the board is not. Across all teams, a guide sent to you from outside your
 * teams is on the board and not in the list — it is the one thing on this page that must not go
 * missing, so it is added back.
 */
const guides = computed<Guide[]>(() => {
  const list = data.value.guides;
  if (scope.value !== "all") return list;
  const have = new Set(list.map((g) => g.id));
  return [...list, ...(data.value.board?.waiting ?? []).filter((g) => !have.has(g.id))];
});

const matches = (g: Guide) => {
  if (follows.value && g.parent !== follows.value) return false;
  const terms = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = [
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
  ]
    .join("\n")
    .toLowerCase();
  return terms.every((t) => hay.includes(t));
};

const lanes = computed(() =>
  arrange(
    guides.value.filter(matches).map((g) => ({ g, state: stateOf(g, fromBoard.value, me.value) })),
  ),
);

const sentCount = computed(() =>
  lanes.value.sent.reduce((n, e) => n + ("row" in e ? 1 : e.group.rows.length), 0),
);

const showDone = ref(route.query.done === "1");
watch(
  () => route.query.done,
  (v) => {
    if (v === "1") showDone.value = true;
  },
);
/** A search looks everywhere, so it opens the shelf rather than hiding matches behind it. */
const doneOpen = computed(() => showDone.value || searching.value);
</script>

<template>
  <HubShell :heading="first ? 'Get started' : ''">
    <!-- A token-only account cannot sign in from any other browser. That is true whether or not
         the list is empty, so it sits above whichever of the two this page is showing. -->
    <HubClaim />

    <HubFirstRun v-if="first" />

    <div v-else class="flex flex-col gap-8">
      <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div class="flex min-w-0 flex-col gap-1">
          <h1 class="m-0 flex flex-wrap items-center gap-2 text-h2">
            Guides<template v-if="hasTeams"> in <HubScopes /></template>
          </h1>
          <p v-if="waiting" class="m-0 h-5 font-ui text-sm text-muted" aria-hidden="true">
            <span class="inline-block h-2.5 w-56 rounded-pill bg-line align-middle" />
          </p>
          <p v-else class="m-0 font-ui text-sm text-muted">
            <!-- Said once, quietly, and only for a refresh of what is already on screen. -->
            <span v-if="updating || scopeChanging" role="status" class="mr-2 text-muted">Updating…</span>
            <a href="#needs">{{ lanes.needs.length }} need you</a>
            ·
            <a href="#sent">{{ sentCount }} you sent {{ sentCount === 1 ? "is" : "are" }} still out</a>
            ·
            <a href="#done" @click="showDone = true">{{ lanes.done.length }} done</a>
          </p>
        </div>
        <div class="toolbar m-0 min-w-[14rem] grow basis-56 sm:max-w-xs">
          <input v-model="q" type="search" placeholder="Search guides" aria-label="Search guides" />
        </div>
      </div>

      <p v-if="follows" class="-mt-4 mb-0 font-ui text-sm text-muted">
        Showing guides that follow on from one guide ·
        <NuxtLink to="/hub">Show all</NuxtLink>
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
        <h2 id="lane-needs" class="m-0 flex items-baseline gap-2 text-h3 font-bold text-fg">
          Needs you
          <span class="font-ui text-sm font-normal text-muted tabular-nums">{{ lanes.needs.length }}</span>
        </h2>
        <HubSkeleton v-if="waiting" :rows="3" label="Loading what needs you" />
        <ul v-else-if="lanes.needs.length" class="m-0 list-none rounded-3 border border-line bg-raised p-0">
          <HubInboxRow v-for="r in lanes.needs" :key="r.g.id" :row="r" />
        </ul>
        <p v-else class="m-0 font-ui text-sm text-muted">
          {{ searching ? "Nothing waiting on you matches." : "Nothing is waiting on you." }}
        </p>
      </section>

      <section
        id="sent"
        aria-labelledby="lane-sent"
        class="flex scroll-mt-4 flex-col gap-3 transition-opacity"
        :class="scopeChanging ? 'opacity-60' : ''"
        :aria-busy="waiting || scopeChanging"
      >
        <h2 id="lane-sent" class="m-0 flex items-baseline gap-2 text-h3 font-bold text-fg">
          You sent
          <span class="font-ui text-sm font-normal text-muted tabular-nums">{{ sentCount }}</span>
        </h2>
        <HubSkeleton v-if="waiting" :rows="2" label="Loading what you sent" />
        <ul v-else-if="lanes.sent.length" class="m-0 list-none rounded-3 border border-line bg-raised p-0">
          <template v-for="e in lanes.sent" :key="'row' in e ? e.row.g.id : `report-${e.group.report}`">
            <HubInboxRow v-if="'row' in e" :row="e.row" />
            <HubReportRow v-else :group="e.group" :open="searching" />
          </template>
        </ul>
        <p v-else class="m-0 font-ui text-sm text-muted">
          {{ searching ? "Nothing you sent matches." : "Nothing you sent is still out." }}
          <NuxtLink v-if="!searching" to="/hub/write">Write a guide</NuxtLink>
        </p>
      </section>

      <section id="done" aria-labelledby="lane-done" class="flex scroll-mt-4 flex-col gap-3">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center justify-between rounded-3 border border-line bg-raised px-4 py-3 text-left hover:border-line-strong"
          :aria-expanded="doneOpen"
          @click="showDone = !showDone"
        >
          <span id="lane-done" class="flex items-baseline gap-2 text-h3 font-bold text-fg">
            Done
            <span v-if="!waiting" class="font-ui text-sm font-normal text-muted tabular-nums">{{ lanes.done.length }}</span>
          </span>
          <AppIcon
            name="reveal"
            class="text-muted transition-transform"
            :class="doneOpen ? 'rotate-180' : ''"
          />
        </button>
        <template v-if="doneOpen">
          <ul v-if="lanes.done.length" class="m-0 list-none rounded-3 border border-line bg-raised p-0">
            <HubInboxRow v-for="r in lanes.done" :key="r.g.id" :row="r" />
          </ul>
          <p v-else class="m-0 font-ui text-sm text-muted">
            {{ searching ? "Nothing finished matches." : "Nothing finished yet." }}
          </p>
        </template>
      </section>
      </template>

      <HubActivity />
    </div>
  </HubShell>
</template>
