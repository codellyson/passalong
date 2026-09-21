<!--
  Who is working on what: every task an agent holds right now, one line per agent.

  An agent holds one task at a time (claims.next), so a line is an agent and its task at once. It
  says whose agent it is — a teammate's agent can take your task — where it runs, what it last
  said, and when it was last heard from. A stalled agent stays on the list: it still holds the
  lock, and that is exactly when you want to see it.

  Read-only. Taking a task back is the author's call and lives on the task's own row.
-->
<script setup lang="ts">
import type { Task } from "~/types/hub";

const props = defineProps<{ tasks: Task[] }>();

/** Heard from most recently first; stalled ones sink, since their last word is oldest. */
const held = computed(() =>
  props.tasks
    .filter((t) => (t.state === "claimed" || t.state === "stalled") && t.claim)
    .sort((a, b) => (b.claim!.lease_until > a.claim!.lease_until ? 1 : -1)),
);

const who = (t: Task) => {
  const by = t.claim?.by;
  if (!by || by.you) return "You";
  return personName(by.name, by.handle) || "A teammate";
};

/** The host and the last part of the worktree path, as TaskRow shows it. */
const where = (t: Task) => {
  const c = t.claim!;
  const tree = c.worktree.split("/").filter(Boolean).pop() || "";
  return [c.host, tree].filter(Boolean).join(":") || c.agent;
};

/** The lease runs 30 minutes from the agent's last call (LEASE_MS in apps/api/src/claims.ts). */
const heard = (t: Task) =>
  new Date(Date.parse(t.claim!.lease_until) - 30 * 60 * 1000).toISOString();

const blocked = (t: Task) => /^BLOCKED:/i.test(t.claim?.note || "");

const initials = (label: string) =>
  label
    .replace(/^@/, "")
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
</script>

<template>
  <section v-if="held.length" aria-labelledby="working-h" class="mb-10">
    <h2 id="working-h" class="m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted">
      Working now · {{ held.length }}
    </h2>
    <p class="mt-1 mb-3 font-ui text-sm text-muted">Each agent holds one task until it hands it in.</p>
    <ul class="m-0 list-none overflow-hidden rounded-[var(--r-3)] bg-raised p-0 shadow-edge">
      <li
        v-for="t in held"
        :key="t.id"
        class="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3 px-4 py-3 shadow-[inset_0_1px_0_var(--line)] first:shadow-none sm:grid-cols-[1.75rem_minmax(0,14rem)_minmax(0,1fr)_auto]"
      >
        <span
          class="grid size-7 place-items-center rounded-pill bg-surface font-ui text-xs font-semibold text-muted"
          aria-hidden="true"
        >{{ who(t) === "You" ? "Y" : initials(who(t)) }}</span>

        <div class="min-w-0 font-ui text-sm">
          <span class="block truncate font-medium text-fg">{{ who(t) }}</span>
          <span class="block truncate font-code text-xs text-muted">{{ where(t) }}</span>
        </div>

        <div class="col-start-2 min-w-0 sm:col-start-auto">
          <a
            :href="t.url"
            target="_blank"
            rel="noopener"
            class="block truncate font-ui text-sm font-semibold text-fg no-underline hover:text-accent"
          >{{ t.title || t.id }}</a>
          <p v-if="t.claim?.note" class="m-0 truncate font-ui text-xs" :class="blocked(t) ? 'text-warn' : 'text-muted'">
            “{{ t.claim.note }}”
          </p>
        </div>

        <span
          class="col-start-2 flex items-center gap-1.5 font-ui text-xs whitespace-nowrap sm:col-start-auto sm:justify-self-end"
          :class="t.state === 'stalled' ? 'text-warn' : 'text-muted'"
        >
          <span
            class="size-2 rounded-pill"
            :class="t.state === 'stalled' ? 'bg-warn' : 'bg-ok'"
            aria-hidden="true"
          />
          {{ t.state === "stalled" ? "went quiet" : "heard" }} {{ rel(heard(t)) }}
        </span>
      </li>
    </ul>
  </section>
</template>
