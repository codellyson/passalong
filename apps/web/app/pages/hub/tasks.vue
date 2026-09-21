<!--
  The task queue, led by what needs you.

  The top of the page is the review: an inbox of your tasks that are waiting on you, and beside it
  the one you picked, with what you asked for next to what the agent says it checked (HubTaskReview).
  That is where the time goes and where the page used to create friction, so it gets the space.

  Everything else — what is moving, queued, waiting on another task, still a draft, or done —
  follows as the plain list it was, grouped by column, because it needs a glance rather than a
  decision. A teammate's task that needs its author lands here too: the review is yours to give.
-->
<script setup lang="ts">
import type { Task } from "~/types/hub";

usePage({
  title: "Tasks · Passalong",
  description: "Work queued for agents, and what came back.",
  noindex: true,
});

const { data } = useHub();

/** In the review inbox: yours, and waiting on you. Mirrors the groups in HubTaskReview. */
const needsYou = (t: Task) =>
  t.mine &&
  (t.state === "review" ||
    t.state === "stalled" ||
    (t.state === "claimed" && /^BLOCKED:/i.test(t.claim?.note || "")));

const COLUMNS: { state: Task["state"]; title: string; note: string }[] = [
  {
    state: "review",
    title: "Waiting for its author",
    note: "A teammate's task, finished and waiting on them.",
  },
  {
    state: "stalled",
    title: "Stalled",
    note: "The agent went quiet. It is still locked to that agent.",
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

const rest = computed(() => {
  const out = new Map<Task["state"], Task[]>();
  for (const t of data.value.tasks)
    if (!needsYou(t)) out.set(t.state, [...(out.get(t.state) || []), t]);
  return out;
});
const waiting = computed(() => data.value.tasks.filter(needsYou).length);
const done = computed(() => rest.value.get("done") || []);
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
      <HubTaskReview :tasks="data.tasks" />
      <p v-if="!waiting" class="m-0 font-ui text-sm text-muted">
        Nothing needs you. Anything an agent finishes lands here for you to review.
      </p>

      <template v-for="col in COLUMNS" :key="col.state">
        <section v-if="rest.get(col.state)?.length" class="mt-10">
          <h2 class="m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted">
            {{ col.title }} · {{ rest.get(col.state)?.length }}
          </h2>
          <p class="mt-1 mb-3 font-ui text-sm text-muted">{{ col.note }}</p>
          <ul class="m-0 list-none overflow-hidden rounded-2 border border-line p-0">
            <HubTaskRow v-for="t in rest.get(col.state)" :key="t.id" :t="t" />
          </ul>
        </section>
      </template>

      <details v-if="done.length" class="mt-10">
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
