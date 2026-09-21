<!--
  The task queue, as columns read top to bottom rather than side by side: this is a page that is
  scanned for the one thing that needs you, and a row of seven narrow columns on a laptop is a row
  of seven truncated titles.

  Ordered by who has to act. Review first — an agent finished and is waiting on you. Stalled next —
  an agent went quiet holding something. Then what is moving, what is queued, what is waiting on
  another task, what you have not released yet, and last what is done, folded away because it
  needs nothing.
-->
<script setup lang="ts">
import type { Task } from "~/types/hub";

usePage({
  title: "Tasks · Passalong",
  description: "Work queued for agents, and what came back.",
  noindex: true,
});

const { data } = useHub();

const COLUMNS: { state: Task["state"]; title: string; note: string }[] = [
  {
    state: "review",
    title: "Waiting for review",
    note: "An agent finished. Read what came back, then approve or send it back.",
  },
  {
    state: "stalled",
    title: "Stalled",
    note: "The agent went quiet. It is still locked to that agent until you take it back.",
  },
  { state: "claimed", title: "In progress", note: "An agent has it." },
  {
    state: "ready",
    title: "Ready",
    note: "The next agent in the right repo takes these, oldest first.",
  },
  {
    state: "blocked",
    title: "Blocked",
    note: "Waiting until the tasks they depend on are approved.",
  },
  { state: "draft", title: "Draft", note: "Not in the queue until you make them ready." },
];

const byState = computed(() => {
  const out = new Map<Task["state"], Task[]>();
  for (const t of data.value.tasks) out.set(t.state, [...(out.get(t.state) || []), t]);
  return out;
});
const done = computed(() => byState.value.get("done") || []);
</script>

<template>
  <HubShell heading="Tasks">
    <template #sub>Work queued for agents, and what came back.</template>

    <div v-if="!data.tasks.length" class="empty">
      <p class="mt-0">
        No tasks yet. Write one with <code>passalong task "what needs doing"</code>, or ask an agent
        to plan a larger goal — it lands here as drafts for you to read.
      </p>
      <p class="mb-0">
        Then, in the repo it is for, run <code>passalong work</code> or tell an agent to take the
        next task.
      </p>
    </div>

    <template v-else>
      <template v-for="col in COLUMNS" :key="col.state">
        <section v-if="byState.get(col.state)?.length" class="mt-8 first:mt-0">
          <h2 class="m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted">
            {{ col.title }} · {{ byState.get(col.state)?.length }}
          </h2>
          <p class="mt-1 mb-3 font-ui text-sm text-muted">{{ col.note }}</p>
          <ul class="m-0 list-none overflow-hidden rounded-2 border border-line p-0">
            <HubTaskRow v-for="t in byState.get(col.state)" :key="t.id" :t="t" />
          </ul>
        </section>
      </template>

      <details v-if="done.length" class="mt-8">
        <summary class="cursor-pointer font-ui text-xs font-semibold uppercase tracking-widest text-muted">
          Done · {{ done.length }}
        </summary>
        <ul class="m-0 mt-3 list-none overflow-hidden rounded-2 border border-line p-0">
          <HubTaskRow v-for="t in done" :key="t.id" :t="t" />
        </ul>
      </details>
    </template>
  </HubShell>
</template>
