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
// state the server's order is kept.
const rows = computed(() =>
  data.value.guides
    .map((g) => ({ g, state: stateOf(g, fromBoard.value, me.value) }))
    .sort((a, b) => a.state.rank - b.state.rank),
);

/** The one genuinely controlled input on the page. */
const q = ref("");
const cut = ref("all");

const CUTS = [
  { key: "all", label: "all" },
  { key: "attention", label: "needs attention" },
  { key: "theirs", label: "handed to you" },
  { key: "mine", label: "yours" },
];

const inCut = (r: { g: Guide; state: GuideState }, key: string) => {
  if (key === "attention") return r.state.attention;
  if (key === "theirs") return !r.g.mine;
  if (key === "mine") return r.g.mine;
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
    <div class="toolbar">
      <input
        v-model="q"
        type="search"
        class="min-w-64 grow"
        placeholder="search title, tags, stack, repo"
      />
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
      <ul class="m-0 list-none overflow-hidden rounded-3 border border-line p-0">
        <HubGuideRow v-for="r in visible" :key="r.g.id" :g="r.g" :state="r.state" />
      </ul>
      <p class="mt-3 font-ui text-sm text-muted">
        Showing {{ visible.length }} of {{ rows.length }}. Ids, repos and stack assumptions live on
        the second line; everything else is on the guide page.
      </p>
    </template>
  </HubShell>
</template>
