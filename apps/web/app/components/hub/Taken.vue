<!--
  Who has what: every guide someone has taken and not yet handed in, of every kind, one line per
  taker.

  It was called "Working now", which was wrong about the rows that matter most. A stalled card —
  nobody heard from its agent in thirty minutes — is precisely not working now, and it is on this
  list on purpose, because it is the one you act on. `take` is the product's verb and "took it 3h
  ago" is what the rows already say, so `Taken` is what the panel is. It also pairs with Open,
  which is its complement: nobody has it, somebody does.

  A task has one taker; a handoff can be repeated once in each repo, so it can show twice, once per
  repo (claims.working, GET /v1/working). An agent holds one thing at a time, so a line is an agent
  and its work at once. It says whose agent it is — a teammate's agent can take your work — where it
  runs, what it last said, and when it was last heard from. A stalled agent stays on the list: it
  still holds the lock, and that is exactly when you want to see it.

  Nearly read-only. It used to be entirely so, on the rule that taking work back is the author's
  call and lives on the work's own row — which was true while only a task could be taken back. A
  handoff has no such row: the guide lists know who *acknowledged* one, and that is not who holds
  the claim. This is the only view that knows, so the author's one action lives here, on their own
  work only.

  A table, one line per hold, after three layouts were prototyped and cards won — and then lost to
  this, because the cards showed one thing each at the cost of a screen for four, and the same table
  already answers Needs you. The latest thing said leads, then the state, who holds it and when it was
  last heard from; the trail and the line to answer in live in the conversation drawer. Above it, the
  counts — waiting on you, gone quiet, working — which are also the filter, because the first
  question about a list of work in progress is "does any of it need me".
-->
<script setup lang="ts">
import type { Working } from "~/types/hub";
import { HEALTH, HEALTH_ORDER, type Health, healthOf, heardAt, plain, span } from "~/utils/taken";

/** `bare` drops the heading, for a page that already names the section (the hub's tab). */
const props = defineProps<{ rows: Working[]; bare?: boolean }>();

const { onTakeBack } = useHub();
const { open } = useThread();

/**
 * You wrote it, so you can have it back — from anyone's agent, including your own.
 *
 * The first version of this also required the holder to be somebody else, reasoning that you would
 * stop your own agent where it runs rather than take the work off it. That is wrong twice: it is
 * the commonest case there is — your own agents, on your own tasks, one of them gone quiet — and
 * the server's rule is simply that the author asks, which is what a task's own release button has
 * always done.
 */
const taking = ref<string | null>(null);
async function takeBack(w: Working) {
  if (taking.value) return;
  taking.value = w.id;
  try {
    await onTakeBack(w);
  } finally {
    taking.value = null;
  }
}

const rowKey = (w: Working) => `${w.id}-${w.agent}`;
const person = (w: Working) => w.agent.startsWith("person-");
const who = (w: Working) => (w.by.you ? "You" : personName(w.by.name, w.by.handle) || "A teammate");

/** Where it is held: the host and the last part of the worktree path, or the browser for a person. */
const where = (w: Working) => {
  if (person(w)) return "in the browser";
  const tree = w.worktree.split(/[\\/]/).filter(Boolean).pop() || "";
  return [w.host, tree].filter(Boolean).join(":") || w.agent;
};

/** Times on a card are read against a clock that moves, so it is a ref and not a constant. */
const now = ref(Date.now());
onMounted(() => {
  const t = setInterval(() => {
    now.value = Date.now();
  }, 30000);
  onBeforeUnmount(() => clearInterval(t));
});

// ---- the counts, which are the filter ----------------------------------------------------------

const KINDS: Health[] = ["waiting", "quiet", "working", "person"];
const count = (h: Health) => props.rows.filter((r) => healthOf(r) === h).length;
const only = ref<Health | null>(null);
// A filter whose last card went away would leave an empty tab with no way back but its own chip.
watch(
  () => props.rows.length,
  () => {
    if (only.value && !count(only.value)) only.value = null;
  },
);
const shown = computed(() =>
  props.rows
    .filter((r) => !only.value || healthOf(r) === only.value)
    .sort(
      (a, b) => HEALTH_ORDER[healthOf(a)] - HEALTH_ORDER[healthOf(b)] || heardAt(b) - heardAt(a),
    ),
);

/** "just now", or "3h 20m ago": span() already says "just now", which cannot take an "ago". */
const ago = (w: Working) => {
  const t = span(now.value - heardAt(w));
  return t === "just now" ? t : `${t} ago`;
};

// ---- a row -------------------------------------------------------------------------------------

const talk = (w: Working) =>
  open({
    id: w.id,
    title: w.title,
    url: w.url,
    stamp: `${w.state}|${w.note}|${w.lease_until}`,
    reply: w.mine || w.by.you,
    noting: false,
    asking: w.asking || undefined,
  });
</script>

<template>
  <section v-if="props.rows.length" aria-labelledby="taken-h" class="scroll-mt-4">
    <!-- The same heading as the hub's other sections: this is one of them. -->
    <h2 v-if="!props.bare" id="taken-h" class="m-0 flex items-baseline gap-2 text-h3 font-bold text-fg">
      Taken
      <span class="font-ui text-sm font-normal text-muted tabular-nums">{{ props.rows.length }}</span>
    </h2>
    <p class="m-0 font-ui text-sm text-muted" :class="props.bare ? '' : 'mt-1'">
      Each agent holds one thing until it hands it in; people can hold several.
    </p>

    <!-- The counts, and the filter. A kind with nothing in it is dim and cannot be chosen. -->
    <div class="mt-4 flex flex-wrap gap-3 font-ui" role="group" aria-label="Filter by state">
      <button
        v-for="h in KINDS.filter((k) => k !== 'person' || count(k))"
        :key="h"
        type="button"
        class="flex min-w-36 cursor-pointer items-center gap-3 rounded-2 border-0 bg-raised px-4 py-3 text-left shadow-edge transition-[background-color,opacity] duration-150 disabled:cursor-default disabled:opacity-50"
        :class="only === h ? 'bg-surface' : ''"
        :aria-pressed="only === h"
        :disabled="!count(h)"
        @click="only = only === h ? null : h"
      >
        <span class="text-2xl leading-none font-semibold text-fg tabular-nums">{{ count(h) }}</span>
        <span class="flex min-w-0 items-center gap-2 text-xs leading-tight font-medium text-muted">
          <span class="size-3 shrink-0 rounded-pill" :class="HEALTH[h].dot" aria-hidden="true" />
          {{ HEALTH[h].label }}
        </span>
      </button>
    </div>

    <!-- One line per hold: what it is, what it last said, how it is, who has it, and when it was
         last heard from. The conversation, with its trail and the line to answer in, is one click
         away in the drawer; a question waiting on you makes that click the main button. -->
    <div class="mt-4 overflow-x-auto rounded-3 bg-raised shadow-edge">
      <table class="rows m-0 w-full font-ui text-sm">
        <thead>
          <tr class="text-xs text-muted">
            <th >Task</th>
            <th>What it last said</th>
            <th>State</th>
            <th>Held by</th>
            <th>Heard</th>
            <th><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="w in shown" :key="rowKey(w)">
            <td class="min-w-60 max-w-[24rem] font-medium text-fg">
              <button type="button" class="linkish line-clamp-2 text-left font-medium !text-fg hover:!text-accent" @click="talk(w)">{{ w.title || w.id }}</button>
            </td>
            <td class="max-w-[26rem] text-fg">
              <span class="line-clamp-2 break-words">{{ plain(w.asking || w.note) || "Taken. No word yet." }}</span>
            </td>
            <td class="whitespace-nowrap">
              <span class="rounded-pill px-3 py-1 text-xs font-semibold" :class="HEALTH[healthOf(w)].pill">
                {{ HEALTH[healthOf(w)].label }}
              </span>
            </td>
            <td class="whitespace-nowrap text-muted">
              <span class="font-code text-xs">{{ where(w) }}</span><template v-if="!w.by.you"> · {{ who(w) }}'s</template>
            </td>
            <td class="whitespace-nowrap text-muted tabular-nums">{{ ago(w) }}</td>
            <td class="text-right whitespace-nowrap">
              <button
                v-if="w.asking"
                type="button"
                class="btn sm primary mr-3"
                @click="talk(w)"
              >Answer</button>
              <button v-else type="button" class="btn sm mr-3" @click="talk(w)">Open</button>
              <button
                v-if="w.mine || w.by.you"
                class="linkish"
                type="button"
                :disabled="taking === w.id"
                :title="`Put ${w.title || w.id} back, and tell whoever has it`"
                @click="takeBack(w)"
              >{{ taking === w.id ? "Releasing…" : person(w) ? "Release hold" : "Stop this agent" }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
