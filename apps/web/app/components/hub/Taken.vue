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

  Cards, not rows. A hold is something that is happening, and a row of facts did not say what: so
  each card leads with the latest thing the agent said, big, with a pulse while it is live; then a
  short trail of what came before; then a line to answer without leaving the page. Above them, the
  counts — waiting on you, gone quiet, working — which are also the filter, because the first
  question about a list of work in progress is "does any of it need me".
-->
<script setup lang="ts">
import type { Working } from "~/types/hub";
import { HEALTH, HEALTH_ORDER, type Health, healthOf, heardAt, plain, span } from "~/utils/taken";

/** `bare` drops the heading, for a page that already names the section (the hub's tab). */
const props = defineProps<{ rows: Working[]; bare?: boolean }>();

const { onTakeBack, onReply } = useHub();
const { open } = useThread();
const { trails } = useTrails(() => props.rows);

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
  const tree = w.worktree.split("/").filter(Boolean).pop() || "";
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

// ---- a card ------------------------------------------------------------------------------------

/** What came before the latest thing, newest first: the trail under the headline. */
const before = (w: Working) =>
  (trails.value[w.id] ?? [])
    .filter((i) => ["progress", "asked", "replied", "handed_in"].includes(i.kind))
    .slice(-4, -1)
    .reverse();

const draft = ref<Record<string, string>>({});
const sending = ref<string | null>(null);
const trouble = ref<Record<string, string>>({});
async function quick(w: Working) {
  const body = (draft.value[w.id] || "").trim();
  if (!body || sending.value) return;
  sending.value = w.id;
  trouble.value = { ...trouble.value, [w.id]: "" };
  try {
    await onReply(w.id, body);
    draft.value = { ...draft.value, [w.id]: "" };
  } catch (e) {
    trouble.value = {
      ...trouble.value,
      [w.id]: e instanceof Error ? e.message : "That didn't send. Try again.",
    };
  } finally {
    sending.value = null;
  }
}

const talk = (w: Working) =>
  open({
    id: w.id,
    title: w.title,
    url: w.url,
    stamp: `${w.state}|${w.note}|${w.lease_until}`,
    reply: w.mine || w.by.you,
    noting: false,
  });

/** The kind, only when it is not the default: most of what is held is a task. */
const badge = (w: Working) => kindBadge(w.kind);
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
        <span class="text-xs leading-tight font-medium" :class="HEALTH[h].text">{{ HEALTH[h].label }}</span>
      </button>
    </div>

    <div class="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <article
        v-for="w in shown"
        :key="rowKey(w)"
        class="flex min-w-0 flex-col gap-4 rounded-3 bg-raised p-5 shadow-edge"
      >
        <header class="flex items-start gap-3 font-ui">
          <div class="min-w-0 flex-1">
            <h3 class="m-0 flex items-center gap-2 text-base leading-snug font-semibold text-fg">
              <span
                v-if="badge(w)"
                class="shrink-0 rounded-1 border px-1.5 py-0.5 text-xs font-medium tracking-wide uppercase"
                :class="badge(w)?.class"
              >{{ badge(w)?.label }}</span>
              <span class="truncate">{{ w.title || w.id }}</span>
            </h3>
            <p v-if="w.summary" class="m-0 mt-1 line-clamp-2 text-sm leading-snug text-muted">{{ w.summary }}</p>
            <p class="m-0 mt-1 truncate font-code text-xs text-muted">
              {{ where(w) }}{{ w.by.you ? "" : ` · ${who(w)}'s` }} · taken {{ span(now - Date.parse(w.claimed_at)) }} ago
            </p>
          </div>
          <span class="shrink-0 rounded-pill px-3 py-1 text-xs font-semibold" :class="HEALTH[healthOf(w)].pill">
            {{ HEALTH[healthOf(w)].label }}
          </span>
        </header>

        <!-- Now: the one line that answers "what is it doing". -->
        <div class="flex items-start gap-3 rounded-2 bg-surface px-4 py-3 font-ui">
          <span class="relative mt-1.5 size-3 shrink-0">
            <span
              v-if="healthOf(w) === 'working'"
              class="absolute inset-0 animate-ping rounded-pill opacity-60 motion-reduce:animate-none"
              :class="HEALTH.working.dot"
            />
            <span class="absolute inset-0 rounded-pill" :class="HEALTH[healthOf(w)].dot" />
          </span>
          <p class="m-0 min-w-0 text-base leading-snug break-words text-fg">
            {{ plain(w.asking || w.note) || "Taken. No word yet." }}
          </p>
        </div>

        <ol
          v-if="before(w).length"
          class="m-0 flex list-none flex-col gap-2 border-l border-line p-0 pl-4 font-ui text-sm text-muted"
        >
          <li v-for="i in before(w)" :key="i.id" class="flex gap-3">
            <span class="w-14 shrink-0 text-xs leading-5 tabular-nums">{{ span(now - Date.parse(i.at)) }}</span>
            <span class="min-w-0 truncate">{{ plain(i.body) || i.kind.replace("_", " ") }}</span>
          </li>
        </ol>

        <form
          v-if="(w.mine || w.by.you) && !person(w)"
          class="flex flex-col gap-2"
          @submit.prevent="quick(w)"
        >
          <div class="flex gap-2">
            <label class="sr-only" :for="`quick-${rowKey(w)}`">Message the agent</label>
            <input
              :id="`quick-${rowKey(w)}`"
              v-model="draft[w.id]"
              :placeholder="w.asking ? 'Answer it' : 'Message the agent'"
              maxlength="1000"
              class="min-w-0 flex-1 rounded-1 border border-line-strong bg-raised px-3 py-2 font-ui text-sm text-fg"
            />
            <button class="btn primary sm" type="submit" :disabled="sending === w.id || !(draft[w.id] || '').trim()">send</button>
          </div>
          <p v-if="trouble[w.id]" class="m-0 font-ui text-xs text-danger" role="alert">{{ trouble[w.id] }}</p>
        </form>

        <footer class="mt-auto flex items-center gap-4 border-t border-line pt-4 font-ui text-sm">
          <button class="linkish" type="button" @click="talk(w)">Open the conversation</button>
          <button
            v-if="w.mine"
            class="linkish ml-auto"
            type="button"
            :disabled="taking === w.id"
            :title="`Put ${w.title || w.id} back, and tell whoever has it`"
            @click="takeBack(w)"
          >{{ taking === w.id ? "Stopping…" : "Stop this agent" }}</button>
        </footer>
      </article>
    </div>
  </section>
</template>
