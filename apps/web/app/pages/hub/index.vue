<!--
  The hub: one page, three questions. What needs you, what you sent and where it got to, and what
  is finished — folded, because it is most of what exists and none of what needs doing.

  This used to be two pages that showed most guides twice: a board of lanes, and a list of every
  guide with six filter chips whose counts overlapped and never added up. The list's search and its
  follow-up filter moved here; /hub/guides redirects with its query intact.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";
import { boardStates, stateOf } from "~/utils/guide-state";

usePage({
  title: "Passalong hub",
  description: "Your synced transfer guides.",
  noindex: true,
});

const { data, scope } = useHub();

// An account with nothing on its board is not looking at a board. Guides are only created by
// `share()`, so the empty hub cannot explain itself — it hands over the two things that lead
// somewhere instead, and takes the heading with it.
const first = computed(() => Boolean(data.value.me) && data.value.guides.length === 0);
const claimed = computed(() => Boolean(data.value.me?.handle));

const heading = computed(() =>
  first.value ? `${claimed.value ? "One step" : "Two steps"} to a working board` : "Your transfers",
);

const standing = computed(() =>
  claimed.value
    ? "Nothing is on your board yet."
    : "Nothing is on your board yet, and nothing can be addressed to you until you have a handle.",
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

/**
 * The list is scoped and the board is not. Across everything, a guide handed to you from outside
 * your teams is on the board and not in the list — it is the one thing on this page that must not
 * go missing, so it is added back.
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
    g.to,
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

const showDone = ref(false);
/** A search looks everywhere, so it opens the shelf rather than hiding matches behind it. */
const doneOpen = computed(() => showDone.value || searching.value);
</script>

<template>
  <HubShell :heading="heading">
    <template v-if="first" #sub>{{ standing }}</template>

    <!-- A token-only account cannot sign in from any other browser. That is true whether or not
         the board is empty, so it sits above whichever of the two this page is showing. -->
    <HubClaim />

    <HubFirstRun v-if="first" />

    <div v-else class="flex flex-col gap-8">
      <div class="toolbar">
        <input
          v-model="q"
          type="search"
          placeholder="search everything, including done"
          aria-label="Search guides"
        />
        <p v-if="follows" class="text-xs text-muted">
          follow-ups of {{ follows }} ·
          <NuxtLink to="/hub">show all</NuxtLink>
        </p>
      </div>

      <section aria-labelledby="lane-needs" class="flex flex-col gap-3">
        <h2 id="lane-needs" class="m-0 flex items-baseline gap-2 text-h3 font-bold text-fg">
          Needs you
          <span class="font-ui text-sm font-normal text-muted tabular-nums">{{ lanes.needs.length }}</span>
        </h2>
        <ul v-if="lanes.needs.length" class="m-0 list-none rounded-3 border border-line bg-raised p-0">
          <HubInboxRow v-for="r in lanes.needs" :key="r.g.id" :row="r" />
        </ul>
        <p v-else class="m-0 font-ui text-sm text-muted">
          {{ searching ? "Nothing waiting on you matches." : "Nothing is waiting on you." }}
        </p>
      </section>

      <section aria-labelledby="lane-sent" class="flex flex-col gap-3">
        <h2 id="lane-sent" class="m-0 flex items-baseline gap-2 text-h3 font-bold text-fg">
          You sent
          <span class="font-ui text-sm font-normal text-muted tabular-nums">{{ sentCount }}</span>
        </h2>
        <ul v-if="lanes.sent.length" class="m-0 list-none rounded-3 border border-line bg-raised p-0">
          <template v-for="e in lanes.sent" :key="'row' in e ? e.row.g.id : `report-${e.group.report}`">
            <HubInboxRow v-if="'row' in e" :row="e.row" />
            <HubReportRow v-else :group="e.group" :open="searching" />
          </template>
        </ul>
        <p v-else class="m-0 font-ui text-sm text-muted">
          {{ searching ? "Nothing you sent matches." : "Nothing of yours is out there." }}
        </p>
      </section>

      <section aria-labelledby="lane-done" class="flex flex-col gap-3">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center justify-between rounded-3 border border-line bg-raised px-4 py-3 text-left hover:border-line-strong"
          :aria-expanded="doneOpen"
          @click="showDone = !showDone"
        >
          <span id="lane-done" class="flex items-baseline gap-2 text-h3 font-bold text-fg">
            Done
            <span class="font-ui text-sm font-normal text-muted tabular-nums">{{ lanes.done.length }}</span>
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

      <HubActivity />
    </div>
  </HubShell>
</template>
