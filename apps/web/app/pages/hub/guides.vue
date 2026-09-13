<!--
  Every guide, in the same language as the board. The board answers "what needs me now"; this
  answers "what exists, and where did it get to" — which is why the filters here are about who is
  blocked rather than about a guide's lifecycle field.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";
import { boardStates, type GuideState, rankOf, stateOf } from "~/utils/guide-state";

usePage({
  title: "All guides · Passalong",
  description: "Every guide you have synced.",
  noindex: true,
});

const { data } = useHub();

/** The board's word on each guide, so this page derives nothing the server already decided. */
const fromBoard = computed(() => boardStates(data.value.board));
const me = computed(() => data.value.me?.handle || null);

// Sorted by state, not by date: the list answers "where did everything get to", and a guide
// somebody is blocked on outranks one that is going fine however long ago it was shared. Within a
// state the server's order is kept. The ranks live beside the states, so none can go unranked.
const rows = computed<Row[]>(() =>
  data.value.guides
    .map((g) => ({ g, state: stateOf(g, fromBoard.value, me.value) }))
    .sort((a, b) => rankOf(a.state) - rankOf(b.state)),
);

/**
 * The one genuinely controlled input on the page — seeded from the URL, so a row elsewhere can link
 * straight to a search. Watched as well as read, because following a link from this same page
 * changes the query without remounting it.
 */
const route = useRoute();
const q = ref(typeof route.query.q === "string" ? route.query.q : "");
watch(
  () => route.query.q,
  (v) => {
    q.value = typeof v === "string" ? v : "";
  },
);
/**
 * Follow-ups of one guide: `?follows=<id>` narrows the list to guides naming it as their parent. A
 * filter of its own rather than a search term, because a search matches text and a follow-up does
 * not contain its parent's title — only its `parent:` does.
 */
const follows = computed(() =>
  typeof route.query.follows === "string" ? route.query.follows : "",
);
const cut = ref("all");

const CUTS = [
  { key: "all", label: "all" },
  { key: "attention", label: "needs attention" },
  { key: "theirs", label: "handed to you" },
  { key: "mine", label: "yours" },
  // Not a lifecycle filter. This asks the question someone actually has — which of these is
  // nothing happening to — and it is where the free-tier warning sends you.
  { key: "idle", label: "not in transit" },
  // The shelf. Archived guides are out of every other cut, including "all", because an archive
  // that still shows you everything is not an archive; this is how you find one again.
  { key: "archived", label: "archived" },
];

interface Row {
  g: Guide;
  state: GuideState | null;
}

/** Off the board and out of the free tier's count. Everything but the shelf itself hides them. */
const isArchived = (r: Row) => r.g.status === "consumed";

const inCut = (r: Row, key: string) => {
  if (key === "archived") return isArchived(r);
  if (isArchived(r)) return false;
  // `stale` is an age rather than a state, so it earns attention from the guide, not the badge.
  if (key === "attention") return Boolean(r.state?.attention || r.g.stale);
  if (key === "theirs") return !r.g.mine;
  if (key === "mine") return r.g.mine;
  if (key === "idle") return !r.state;
  return true;
};

const counts = computed(() => {
  const out: Record<string, number> = {};
  for (const c of CUTS) out[c.key] = rows.value.filter((r) => inCut(r, c.key)).length;
  return out;
});

const visible = computed(() => {
  const terms = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.value.filter((r) => {
    if (!inCut(r, cut.value)) return false;
    const g = r.g;
    if (follows.value && g.parent !== follows.value) return false;
    const hay = [
      g.title,
      g.source_context,
      g.from,
      g.to,
      g.id,
      ...(g.tags || []),
      ...(g.stack_assumptions || []),
    ]
      .join("\n")
      .toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
});
</script>

<template>
  <HubShell>
    <!-- No controls until there is something to control: on a fresh account this was a search box
         and four filter chips all reading zero, above a line saying nothing is synced. -->
    <div v-if="data.guides.length" class="toolbar">
      <input v-model="q" type="search" placeholder="search title, tags, stack, repo" />
      <p v-if="follows" class="text-xs text-muted">
        follow-ups of {{ follows }} ·
        <NuxtLink to="/hub/guides">show all</NuxtLink>
      </p>
      <div class="chips">
        <button
          v-for="c in CUTS"
          :key="c.key"
          :class="['chip', { on: cut === c.key }]"
          @click="cut = c.key"
        >
          {{ c.label }} {{ counts[c.key] }}
        </button>
      </div>
    </div>

    <p v-if="!data.guides.length" class="empty">
      Nothing synced yet. <code>passalong share</code> sends your first one.
    </p>
    <p v-else-if="!visible.length" class="empty">No guides match.</p>
    <template v-else>
      <!-- Not `overflow-hidden`: the rounded corners were clipping each row's overflow menu, which
           is absolutely positioned inside the row. The rows round their own outer corners instead,
           at the list's radius minus its border so the curves are concentric.

           The list carries the rows' own fill as well. Two rounded shapes painted separately have
           two antialiased edges, and where they meet along the curve the pixels blend to whatever
           is behind — with a transparent list that is the page, and it reads as a faint second arc
           at each corner. Filling the list means the seam blends into the same colour.

           No left border either: each row draws its own 3px stripe there, and a container border
           behind it made the left edge two parallel lines and visibly heavier than the other
           three. The stripe is the edge. -->
      <ul class="m-0 list-none rounded-3 border border-l-0 border-line bg-raised p-0">
        <HubGuideRow v-for="r in visible" :key="r.g.id" :g="r.g" :state="r.state" />
      </ul>
      <p class="mt-3 font-ui text-sm text-muted">
        Showing {{ visible.length }} of {{ rows.length }}. The id and the repo are on the last line;
        what a guide assumes, and the rest of its tags, are on the guide itself.
      </p>
    </template>
  </HubShell>
</template>
