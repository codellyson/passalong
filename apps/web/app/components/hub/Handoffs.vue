<!--
  Lane B: everything you handed over, as one list rather than four boxes. Which bucket a guide is
  in is now a badge and a stripe on the row instead of the container it sits in, which is what lets
  the four sort into one column by urgency — a failed verdict above a guide nobody has taken, above
  one that is going fine.

  The buckets themselves are still the server's, untouched: this reads `/v1/board` and renders it.
-->
<script setup lang="ts">
import type { Board, Guide } from "~/types/hub";

export interface Kind {
  /** The board buckets this state is drawn from — `landed` covers two. */
  from: (keyof Omit<Board, "waiting">)[];
  label: string;
  /** Why this bucket exists — a tooltip on the badge, since it is the same sentence on every row
      and printing it eight times is how the old cards read as noise. */
  note: string;
  badge: string;
  stripe: string;
  /** The one action worth offering. `open` is the answer for a failed guide: the reason is already
      printed on the row, so the only move left is to go and look at the guide itself. */
  action: "open" | "link";
}

// Tested in this order, and the first bucket to claim a guide keeps it — the order is the priority
// the whole lane is sorted by.
const KINDS: Kind[] = [
  {
    from: ["failing"],
    label: "not working",
    note: "someone tried it and it does not hold up",
    badge: "bg-danger-soft text-danger",
    stripe: "border-l-danger",
    action: "open",
  },
  {
    from: ["in_flight"],
    label: "in flight",
    note: "handed over, nobody has taken it",
    badge: "bg-warn-soft text-warn",
    stripe: "border-l-warn",
    action: "link",
  },
  // `landed` and `promote` are one state here: both mean someone else has it. The pull count is
  // on the row, which is all "worth keeping" ever said.
  {
    from: ["landed", "promote"],
    label: "landed",
    note: "someone else has it",
    badge: "bg-ok-soft text-ok",
    stripe: "border-l-ok",
    action: "open",
  },
];

const { data } = useHub();
const board = computed(() => data.value.board);

/**
 * The four buckets flattened into one ordered list.
 *
 * This used to dedupe by id, because `failing` overlapped `in_flight` on the server and one guide
 * could arrive twice — in a column that reads as the same title printed back to back. /v1/board
 * now carries the exclusion in its own SQL, so the buckets arrive disjoint and the dedupe would
 * only be this component quietly disagreeing with the CLI and the agent tool, which never had one.
 */
const rows = computed<{ g: Guide; kind: Kind }[]>(() =>
  KINDS.flatMap((kind) =>
    kind.from.flatMap((bucket) => (board.value?.[bucket] ?? []).map((g) => ({ g, kind }))),
  ),
);

/** Said once, under the heading, so the badges below do not have to explain themselves. */
const landedEmpty = computed(
  () => !!board.value && !board.value.landed?.length && !board.value.promote?.length,
);
</script>

<template>
  <section v-if="board" class="mb-6">
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-3">
      <div class="flex flex-wrap items-baseline gap-3">
        <h2 class="m-0 text-h3 font-bold text-fg">What you handed over</h2>
        <span class="text-sm text-muted">{{ plural(rows.length, "guide") }}, most urgent first</span>
      </div>
      <span class="text-sm text-muted">sorted by what needs you</span>
    </div>

    <ul v-if="rows.length" class="m-0 list-none overflow-hidden rounded-3 border border-line p-0">
      <HubHandoffRow v-for="r in rows" :key="r.g.id" :g="r.g" :kind="r.kind" />
    </ul>
    <p v-else class="m-0 text-sm text-muted">
      Nothing of yours is out there yet. <code class="font-code">passalong share</code> sends one.
    </p>

    <p v-if="rows.length && landedEmpty" class="mt-3 mb-0 text-sm text-muted">
      Nothing has landed cleanly yet. A guide moves there once someone else pulls it.
    </p>
  </section>
</template>
