<!--
  One customer request: the conversation, and the Passalong task it became (docs/LOOP.md §1a).
  The conversation is the page; the task sits beside it so support sees what development is doing
  for this customer without leaving. The task's own page — the document, the hand-in, every
  developer action — is one link away, never on this one.
-->
<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import type { GuideContext, SupportRow } from "~/types/hub";

const route = useRoute();
const id = computed(() => String(route.params.id));
const queryClient = useQueryClient();
const { api, signedIn } = useHub();

usePage({ title: "Support · Passalong", description: "One customer request.", noindex: true });

const { data: ctx, error } = useQuery({
  queryKey: computed(() => hubKeys.context(id.value)),
  queryFn: async () => (await api<GuideContext>(`/v1/guides/${id.value}/context`)) ?? null,
  enabled: signedIn,
});
const { data: rows } = useQuery({
  queryKey: ["support"],
  queryFn: async () => (await api<{ requests: SupportRow[] }>("/v1/support"))?.requests ?? [],
  enabled: signedIn,
});
const row = computed(() => rows.value?.find((r) => r.id === id.value) ?? null);
const g = computed(() => ctx.value?.guide ?? null);
const customer = computed(() => ctx.value?.customer ?? null);
const name = computed(() => customer.value?.name || customer.value?.email || "the customer");
useHead({
  title: computed(() => (customer.value ? `${name.value} · Support` : "Support · Passalong")),
});

const STATE: Record<SupportRow["state"], string> = {
  new: "New",
  needs_reply: "Needs reply",
  with_development: "With development",
  waiting: "Waiting on customer",
  solved: "Solved",
};

/** Where the task stands, in the words the board uses. */
const taskStage = computed(() => {
  if (!g.value || !ctx.value) return "";
  if (g.value.status === "consumed") return "Done";
  if (g.value.status === "draft") return "Draft";
  const held = ctx.value.claims.find((k) => k.state !== "review");
  if (held)
    return held.state === "stalled"
      ? `Held by ${held.by.name || held.by.handle || "an agent"}, gone quiet`
      : `In progress · ${held.agent ? "an agent" : held.by.name || "someone"} is on it`;
  return "Ready, nobody has it yet";
});

/** Work made from the request — a bug sent to development — and where each stands. */
const work = computed(() =>
  (ctx.value?.children ?? []).map((c) => ({
    id: c.id,
    title: c.title || "Untitled",
    kind: kindBadge(c.kind)?.label ?? "",
    stage: c.status === "consumed" ? (c.outcome === "archived" ? "Closed" : "Done") : "Open",
    at: c.updated || "",
    done: c.status === "consumed" && c.outcome !== "archived",
  })),
);
const finished = computed(() => work.value.filter((w) => w.done));

const refresh = () => {
  queryClient.invalidateQueries({ queryKey: hubKeys.context(id.value) });
  queryClient.invalidateQueries({ queryKey: ["support"] });
};
</script>

<template>
  <HubShell>
    <p v-if="error" class="m-0 font-ui text-sm text-danger">
      {{ error.message }} <NuxtLink to="/hub/support">Back to Support</NuxtLink>
    </p>
    <article v-else-if="ctx && g" class="flex flex-col gap-6">
      <nav class="font-ui text-sm" aria-label="Back">
        <NuxtLink to="/hub/support" class="text-muted no-underline hover:text-fg">← Support</NuxtLink>
      </nav>

      <header class="m-0 flex flex-col gap-2 border-b-0 p-0">
        <h1 class="m-0">{{ name }}</h1>
        <p class="m-0 font-ui text-lg leading-snug text-fg">{{ g.title }}</p>
        <p class="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 font-ui text-sm text-muted">
          <span v-if="row" class="font-medium text-fg">{{ STATE[row.state] }}</span>
          <span v-if="customer?.name">{{ customer.email }}</span>
          <span v-if="customer?.ref" class="tabular-nums">{{ customer.ref }}</span>
          <span>wrote {{ rel(g.created) }}</span>
        </p>
      </header>

      <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <HubConversation :guide-id="id" :name="name" :finished="finished" @sent="refresh" />

        <aside class="flex flex-col gap-4 rounded-3 bg-raised px-4 py-3 shadow-edge" aria-labelledby="task-h">
          <h2 id="task-h" class="m-0 font-ui text-base font-medium">The task</h2>
          <div class="flex flex-col gap-1 font-ui text-sm">
            <NuxtLink :to="`/hub/g/${id}`" class="font-medium">{{ g.title }}</NuxtLink>
            <span class="text-muted">{{ taskStage }}</span>
          </div>
          <div v-if="work.length" class="flex flex-col gap-2 border-t border-line pt-3 font-ui text-sm">
            <h3 class="m-0 font-ui text-sm font-medium">Made from it</h3>
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
              <li v-for="w in work" :key="w.id" class="flex flex-col">
                <NuxtLink :to="`/hub/g/${w.id}`">{{ w.title }}</NuxtLink>
                <span class="text-muted">{{ w.kind ? `${w.kind} · ` : "" }}{{ w.stage }}</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </article>
    <HubSkeleton v-else variant="lines" :rows="4" label="Loading the request" />
  </HubShell>
</template>
