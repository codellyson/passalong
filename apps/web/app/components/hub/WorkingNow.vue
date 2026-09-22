<!--
  Who is working on what: every guide someone holds right now, of every kind, one line per taker.

  A task has one taker; a handoff can be repeated once in each repo, so it can show twice, once per
  repo (claims.working, GET /v1/working). An agent holds one thing at a time, so a line is an agent
  and its work at once. It says whose agent it is — a teammate's agent can take your work — where it
  runs, what it last said, and when it was last heard from. A stalled agent stays on the list: it
  still holds the lock, and that is exactly when you want to see it.

  Read-only. Taking work back is the author's call and lives on the work's own row.
-->
<script setup lang="ts">
import type { Working } from "~/types/hub";

const props = defineProps<{ rows: Working[] }>();

const who = (w: Working) => (w.by.you ? "You" : personName(w.by.name, w.by.handle) || "A teammate");

/** The host and the last part of the worktree path, as TaskRow shows it. */
const where = (w: Working) => {
  const tree = w.worktree.split("/").filter(Boolean).pop() || "";
  return [w.host, tree].filter(Boolean).join(":") || w.agent;
};

/** The lease runs 30 minutes from the agent's last call (LEASE_MS in apps/api/src/claims.ts). */
const heard = (w: Working) => new Date(Date.parse(w.lease_until) - 30 * 60 * 1000).toISOString();

const blocked = (w: Working) => /^BLOCKED:/i.test(w.note);

const initials = (label: string) =>
  label
    .replace(/^@/, "")
    .split(/\s+/)
    .map((x) => x[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** The kind, only when it is not the default: most of what is held is a task. */
const kindLabel = (w: Working) => (w.kind === "task" ? "" : w.kind === "bug" ? "bug" : "handoff");
</script>

<template>
  <section v-if="props.rows.length" aria-labelledby="working-h" class="scroll-mt-4">
    <!-- The same heading as the hub's other sections: this is one of them. -->
    <h2 id="working-h" class="m-0 flex items-baseline gap-2 text-h3 font-bold text-fg">
      Working now
      <span class="font-ui text-sm font-normal text-muted tabular-nums">{{ props.rows.length }}</span>
    </h2>
    <p class="mt-1 mb-3 font-ui text-sm text-muted">Each agent holds one thing until it hands it in.</p>
    <ul class="m-0 list-none overflow-hidden rounded-[var(--r-3)] bg-raised p-0 shadow-edge">
      <li
        v-for="w in props.rows"
        :key="`${w.id}-${w.agent}`"
        class="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3 px-4 py-3 shadow-[inset_0_1px_0_var(--line)] first:shadow-none sm:grid-cols-[1.75rem_minmax(0,14rem)_minmax(0,1fr)_auto]"
      >
        <span
          class="grid size-7 place-items-center rounded-pill bg-surface font-ui text-xs font-semibold text-muted"
          aria-hidden="true"
        >{{ w.by.you ? "Y" : initials(who(w)) }}</span>

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
              v-if="kindLabel(w)"
              class="mr-1.5 rounded-pill bg-surface px-1.5 py-0.5 align-middle font-ui text-xs font-medium text-muted"
            >{{ kindLabel(w) }}</span>{{ w.title || w.id }}
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
          {{ w.state === "stalled" ? "went quiet" : "heard" }} {{ rel(heard(w)) }}
        </span>
      </li>
    </ul>
  </section>
</template>
