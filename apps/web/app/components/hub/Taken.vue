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
-->
<script setup lang="ts">
import type { Working } from "~/types/hub";

/** `bare` drops the heading, for a page that already names the section (the hub's tab). */
const props = defineProps<{ rows: Working[]; bare?: boolean }>();

const { onTakeBack } = useHub();

/**
 * You wrote it, so you can have it back — from anyone's agent, including your own.
 *
 * The first version of this also required the holder to be somebody else, reasoning that you would
 * stop your own agent where it runs rather than take the work off it. That is wrong twice: it is
 * the commonest case there is — your own agents, on your own tasks, one of them gone quiet — and
 * the server's rule is simply that the author asks, which is what a task's own release button has
 * always done.
 */
const canTakeBack = (w: Working) => w.mine;
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

const who = (w: Working) => (w.by.you ? "You" : personName(w.by.name, w.by.handle) || "A teammate");

/** A person who took it in the browser, rather than an agent. They hold it for a week, not 30 minutes. */
const person = (w: Working) => w.agent.startsWith("person-");

/** The host and the last part of the worktree path, as TaskRow shows it. */
const where = (w: Working) => {
  if (person(w)) return "in the browser";
  const tree = w.worktree.split("/").filter(Boolean).pop() || "";
  return [w.host, tree].filter(Boolean).join(":") || w.agent;
};

/** The lease runs 30 minutes from the agent's last call (LEASE_MS in apps/api/src/claims.ts). */
const heard = (w: Working) => new Date(Date.parse(w.lease_until) - 30 * 60 * 1000).toISOString();

const blocked = (w: Working) => /^BLOCKED:/i.test(w.note);

/** The kind, only when it is not the default: most of what is held is a task. */
/** The same badge every other lane draws, so one guide wears one mark. See app/utils/kind.ts. */
const badge = (w: Working) => kindBadge(w.kind);
</script>

<template>
  <section v-if="props.rows.length" aria-labelledby="taken-h" class="scroll-mt-4">
    <!-- The same heading as the hub's other sections: this is one of them. -->
    <h2 v-if="!props.bare" id="taken-h" class="m-0 flex items-baseline gap-2 text-h3 font-bold text-fg">
      Taken
      <span class="font-ui text-sm font-normal text-muted tabular-nums">{{ props.rows.length }}</span>
    </h2>
    <p class="mt-1 mb-3 font-ui text-sm text-muted" :class="props.bare ? 'mt-0' : ''">Each agent holds one thing until it hands it in; people can hold several.</p>
    <ul class="m-0 list-none overflow-hidden rounded-[var(--r-3)] bg-raised p-0 shadow-edge">
      <li
        v-for="w in props.rows"
        :key="`${w.id}-${w.agent}`"
        class="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3 px-5 py-4 shadow-[inset_0_1px_0_var(--line)] first:shadow-none sm:grid-cols-[1.75rem_minmax(0,14rem)_minmax(0,1fr)_auto_auto]"
      >
        <span
          class="avatar"
          :class="w.by.you ? 'you' : ''"
          :style="{ '--h': avatarHue(who(w)) }"
          aria-hidden="true"
        >{{ initialsOf(who(w)) }}</span>

        <div class="min-w-0 font-ui text-sm">
          <span class="block truncate font-medium text-fg">{{ who(w) }}</span>
          <span class="block truncate font-code text-xs text-muted">{{ where(w) }}</span>
        </div>

        <div class="col-start-2 min-w-0 sm:col-start-auto">
          <a
            :href="w.url"
            target="_blank"
            rel="noopener"
            class="block truncate font-ui text-sm font-semibold text-fg no-underline hover:text-accent"
          >
            <span
              v-if="badge(w)"
              class="mr-1.5 rounded-1 border px-1.5 py-0.5 align-middle font-ui text-xs font-medium tracking-wide uppercase"
              :class="badge(w)?.class"
            >{{ badge(w)?.label }}</span>{{ w.title || w.id }}
          </a>
          <p v-if="w.note" class="m-0 truncate font-ui text-xs" :class="blocked(w) ? 'text-warn' : 'text-muted'">
            “{{ w.note }}”
          </p>
        </div>

        <span
          class="col-start-2 flex items-center gap-1.5 font-ui text-xs whitespace-nowrap sm:col-start-auto sm:justify-self-end"
          :class="w.state === 'stalled' ? 'text-warn' : 'text-muted'"
        >
          <span class="size-2 rounded-pill" :class="w.state === 'stalled' ? 'bg-warn' : 'bg-ok'" aria-hidden="true" />
          <template v-if="person(w)">took it {{ rel(w.claimed_at) }}</template>
          <template v-else>{{ w.state === "stalled" ? "went quiet" : "heard" }} {{ rel(heard(w)) }}</template>
        </span>

        <!-- Its own track, not a fifth thing squeezed into the timing's: without one it wrapped to
             the next implicit row and landed in the 1.75rem avatar column, where "Take it back"
             broke across three lines and read as "sack". An `auto` track is zero wide on the rows
             that have no button. -->
        <button
          v-if="canTakeBack(w)"
          class="btn sm col-start-2 justify-self-start whitespace-nowrap sm:col-start-auto sm:justify-self-end"
          type="button"
          :disabled="taking === w.id"
          :title="`Put ${w.title || w.id} back, and tell whoever has it`"
          @click="takeBack(w)"
        >
          {{ taking === w.id ? "Taking back…" : "Take it back" }}
        </button>
      </li>
    </ul>
  </section>
</template>
