<!--
  Every guide, in the same language as the board. The board answers "what needs me now"; this
  answers "what exists, and where did it get to" — which is why the filters here are about who is
  blocked rather than about a guide's lifecycle field.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";
import { boardStates, type GuideState, stateOf } from "~/utils/guide-state";

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
// state the server's order is kept. A guide with no state — nothing in transit — sorts last.
const RANK: Record<string, number> = { waiting: 0, unjudged: 0, failing: 1, flight: 2, landed: 3 };
const rank = (r: Row) => (r.state ? (RANK[r.state.key] ?? 9) : 9);

const rows = computed<Row[]>(() =>
  data.value.guides
    .map((g) => ({ g, state: stateOf(g, fromBoard.value, me.value) }))
    .sort((a, b) => rank(a) - rank(b)),
);

/** The one genuinely controlled input on the page. */
const q = ref("");
const cut = ref("all");

const CUTS = [
  { key: "all", label: "all" },
  { key: "attention", label: "needs attention" },
  { key: "theirs", label: "handed to you" },
  { key: "mine", label: "yours" },
  // Not a lifecycle filter. `consumed` and `promoted` are deprecated, so filtering on them would
  // ask about a field nothing sets any more. This asks the question someone actually has — which
  // of these is nothing happening to — and it is where the free-tier warning sends you when it
  // says to remove one you no longer need.
  { key: "idle", label: "not in transit" },
];

interface Row {
  g: Guide;
  state: GuideState | null;
}

const inCut = (r: Row, key: string) => {
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
        Showing {{ visible.length }} of {{ rows.length }}. Ids, repos and stack assumptions live on
        the second line; everything else is on the guide page.
      </p>
    </template>
  </HubShell>
</template>
