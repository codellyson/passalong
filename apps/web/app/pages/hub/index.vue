<!--
  Needs you: the hub's first screen. What waits on the signed-in person, ranked by the server
  (`GET /v1/needs`, apps/api/src/needs.ts) — customers waiting on us, an agent's question, work sent
  to you that nobody took, an agent gone quiet, your work that came back — and beside it the
  customers waiting and what was finished lately, each with Reopen.

  A coral bar at a row's left edge, with a line naming what changed, is the one meaning coral has in
  the hub: changed since you last looked. It stays until the work is opened (`markSeen`).

  `/hub` was the Work page, so links carrying a work query (`?tab=`, `?q=`, `?follows=`,
  `?done=1`) are still out in the world. They go on to /hub/work with that query. `?verified=` and
  `?forgot=` are the shell's and stay here.
-->
<script setup lang="ts">
import type { NeedRow, Needs } from "~/types/hub";
import { age, toneOf } from "~/utils/projects";

// Inline: definePageMeta is lifted out of this script and cannot see its variables.
definePageMeta({
  middleware: (to) => {
    if (["tab", "q", "follows", "done"].some((k) => k in to.query))
      return navigateTo({ path: "/hub/work", query: to.query }, { replace: true });
  },
});

usePage({
  title: "Needs you · Passalong",
  description: "What waits on you, ranked: customers, questions from agents, work nobody took.",
  noindex: true,
});

const { needsQ, readAll, onReopen, refresh } = useHub();
const none = ref("");
// Only for the first-run check: an account with nothing in it gets the steps instead.
const { first } = useWorkLists(none, none);

const needs = computed<Needs | null>(() => needsQ.data.value ?? null);
const rows = computed(() => needs.value?.rows ?? []);
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick = setInterval(() => (now.value = Date.now()), 60_000);
});
onBeforeUnmount(() => clearInterval(tick));

const changedCount = computed(
  () =>
    rows.value.filter((r) => r.changed).length +
    (needs.value?.closed ?? []).filter((c) => c.changed).length,
);
const customerCount = computed(() => rows.value.filter((r) => r.reason === "customer").length);
const summary = computed(() => {
  const parts = rows.value.length ? [`${rows.value.length} waiting on you`] : [];
  if (customerCount.value)
    parts.push(`${customerCount.value} customer${customerCount.value === 1 ? "" : "s"}`);
  if (changedCount.value) parts.push(`${changedCount.value} changed since you last looked`);
  return parts.join(" · ") || "Nothing waiting on you";
});

const STATE: Record<NeedRow["reason"], string> = {
  customer: "Needs a reply",
  asking: "Asking you",
  stuck: "Went quiet",
  untaken: "Nobody took it",
  came_back: "Came back",
};
const VERB: Record<NeedRow["reason"], string> = {
  customer: "Reply",
  asking: "Answer",
  stuck: "Open",
  untaken: "Open",
  came_back: "Open",
};
const href = (r: { id: string; reason?: NeedRow["reason"] }) =>
  r.reason === "customer" ? `/hub/support/${r.id}` : `/hub/g/${r.id}`;

/** Finished in the last day: what the empty state says happened overnight. */
const overnight = computed(() =>
  (needs.value?.closed ?? []).filter((c) => now.value - Date.parse(c.at) < 864e5),
);

const reopening = ref("");
const reopenBusy = ref(false);
async function sendReopen(id: string, form: HTMLFormElement) {
  const why = field(form, "why").trim();
  if (!why) return;
  reopenBusy.value = true;
  const ok = await onReopen(id, why);
  reopenBusy.value = false;
  if (ok) {
    reopening.value = "";
    await refresh(hubKeys.needs);
  }
}

const label = "font-ui text-[0.6875rem] font-medium tracking-wider text-muted uppercase";
</script>

<template>
  <HubShell :heading="first ? 'Get started' : ''">
    <HubFirstRun v-if="first" />

    <div v-else class="grid items-start gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby="needs-h" class="min-w-0">
        <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-fg pb-3">
          <div class="min-w-0">
            <h1 id="needs-h" class="m-0 text-h2 font-medium tracking-tight">Needs you</h1>
            <p v-if="needs" class="m-0 mt-1 font-ui text-sm text-muted">{{ summary }}</p>
          </div>
          <button v-if="changedCount" type="button" class="btn sm" @click="readAll()">
            Mark all seen
          </button>
        </header>

        <HubSkeleton v-if="needsQ.isPending.value" :rows="4" label="Loading what needs you" class="mt-4" />

        <div
          v-else-if="needsQ.isError.value && !needs"
          role="alert"
          class="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3"
        >
          <div class="min-w-0 grow basis-64">
            <p class="m-0 font-ui text-sm font-semibold text-danger">This list didn't load</p>
            <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ needsQ.error.value?.message }}</p>
          </div>
          <button class="btn outline danger sm" type="button" @click="needsQ.refetch()">Try again</button>
        </div>

        <div v-else-if="!rows.length" class="flex flex-col gap-4 py-10">
          <p class="m-0 text-h3 font-medium">Nothing needs you.</p>
          <p class="m-0 max-w-[36rem] font-ui text-sm text-muted">
            A customer waiting on an answer, an agent's question, work sent to you that nobody took,
            an agent that went quiet: each lands here, oldest first.
          </p>
          <div v-if="overnight.length" class="mt-2 flex flex-col gap-2">
            <p :class="label" class="m-0">Closed in the last day</p>
            <ul class="m-0 flex list-none flex-col p-0">
              <li v-for="c in overnight" :key="c.id" class="flex items-baseline gap-3 border-t border-line py-2 font-ui text-sm">
                <NuxtLink :to="`/hub/g/${c.id}`" class="min-w-0 grow no-underline">{{ c.title }}</NuxtLink>
                <span class="shrink-0 text-xs text-muted tabular-nums">{{ age(c.at, now) }}</span>
              </li>
            </ul>
          </div>
        </div>

        <ol v-else class="m-0 list-none p-0">
          <li
            v-for="r in rows"
            :key="r.id"
            class="relative flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line py-4 pr-1 pl-5"
          >
            <span v-if="r.changed" class="absolute inset-y-0 left-0 w-[3px] bg-coral" aria-hidden="true" />
            <div class="flex min-w-0 grow basis-[28rem] flex-col gap-1">
              <p v-if="r.changed" class="m-0 font-ui text-xs font-medium text-accent">
                Changed<span class="text-muted"> · {{ r.changed }}</span>
              </p>
              <NuxtLink :to="href(r)" class="font-ui text-base font-medium text-fg no-underline hover:underline">
                {{ r.title }}
              </NuxtLink>
              <p v-if="r.said || r.summary" class="m-0 max-w-[65ch] font-ui text-sm text-muted">
                <template v-if="r.said">“{{ r.said }}”</template>
                <template v-else>{{ r.summary }}</template>
              </p>
              <dl class="m-0 mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-1 border border-line bg-line sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_4.5rem]">
                <div class="flex min-w-0 flex-col gap-0.5 bg-bg px-3 py-1.5">
                  <dt :class="label">Project</dt>
                  <dd class="m-0 flex min-w-0 items-center gap-2 font-ui text-sm">
                    <template v-if="r.project">
                      <span class="project-mark size-2 shrink-0 rounded-[1px]" :data-tone="toneOf(r.project)" aria-hidden="true" />
                      <span class="min-w-0 break-words">{{ r.project.title }}</span>
                    </template>
                    <span v-else class="text-muted">None</span>
                  </dd>
                </div>
                <div class="flex min-w-0 flex-col gap-0.5 bg-bg px-3 py-1.5">
                  <dt :class="label">With</dt>
                  <dd class="m-0 min-w-0 font-ui text-sm break-words">{{ r.with || "Nobody" }}</dd>
                </div>
                <div class="flex min-w-0 flex-col gap-0.5 bg-bg px-3 py-1.5">
                  <dt :class="label">State</dt>
                  <dd class="m-0 font-ui text-sm">{{ STATE[r.reason] }}</dd>
                </div>
                <div class="flex min-w-0 flex-col gap-0.5 bg-bg px-3 py-1.5">
                  <dt :class="label">Waiting</dt>
                  <dd class="m-0 font-ui text-sm tabular-nums">{{ age(r.since, now) }}</dd>
                </div>
              </dl>
            </div>
            <NuxtLink :to="href(r)" class="btn sm shrink-0">
              {{ VERB[r.reason] }}
            </NuxtLink>
          </li>
        </ol>
      </section>

      <aside class="flex min-w-0 flex-col gap-10" aria-label="Customers and closed work">
        <section aria-labelledby="cust-h" class="flex flex-col">
          <div class="flex items-baseline justify-between border-b border-fg pb-2">
            <h2 id="cust-h" class="m-0 font-ui text-sm font-semibold tracking-normal">Customers waiting</h2>
            <NuxtLink to="/hub/support" class="font-ui text-xs text-muted">All</NuxtLink>
          </div>
          <HubSkeleton v-if="needsQ.isPending.value" variant="lines" :rows="3" label="Loading customers" class="mt-3" />
          <p v-else-if="!needs?.customers.length" class="m-0 py-3 font-ui text-sm text-muted">No customer is waiting.</p>
          <ul v-else class="m-0 flex list-none flex-col p-0">
            <li v-for="c in needs.customers" :key="c.id" class="relative border-b border-line py-3 pl-3">
              <span v-if="c.changed" class="absolute inset-y-0 left-0 w-[3px] bg-coral" aria-hidden="true" />
              <NuxtLink :to="`/hub/support/${c.id}`" class="flex flex-col gap-0.5 no-underline">
                <span class="flex items-baseline gap-3">
                  <span class="min-w-0 grow font-ui text-sm font-medium break-words text-fg">{{ c.customer }}</span>
                  <span class="shrink-0 font-ui text-xs tabular-nums" :class="c.ours ? 'text-fg' : 'text-muted'">{{ age(c.since, now) }}</span>
                </span>
                <span class="font-ui text-xs break-words text-muted">{{ c.title }}</span>
                <span class="font-ui text-xs" :class="c.ours ? 'font-medium text-fg' : 'text-muted'">
                  {{ c.ours ? "Waiting on us" : "Waiting on them" }}
                </span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section aria-labelledby="closed-h" class="flex flex-col">
          <div class="border-b border-fg pb-2">
            <h2 id="closed-h" class="m-0 font-ui text-sm font-semibold tracking-normal">Closed by the agent</h2>
          </div>
          <HubSkeleton v-if="needsQ.isPending.value" variant="lines" :rows="3" label="Loading closed work" class="mt-3" />
          <p v-else-if="!needs?.closed.length" class="m-0 py-3 font-ui text-sm text-muted">Nothing was finished this week.</p>
          <ul v-else class="m-0 flex list-none flex-col p-0">
            <li v-for="c in needs.closed" :key="c.id" class="relative flex flex-col gap-1 border-b border-line py-3 pl-3">
              <span v-if="c.changed" class="absolute inset-y-0 left-0 w-[3px] bg-coral" aria-hidden="true" />
              <span class="flex items-baseline gap-3">
                <NuxtLink :to="`/hub/g/${c.id}`" class="min-w-0 grow font-ui text-sm font-medium break-words text-fg no-underline hover:underline">{{ c.title }}</NuxtLink>
                <span class="shrink-0 font-ui text-xs text-muted tabular-nums">{{ age(c.at, now) }}</span>
              </span>
              <span class="flex items-center gap-2 font-ui text-xs text-muted">
                <template v-if="c.project">
                  <span class="project-mark size-2 shrink-0 rounded-[1px]" :data-tone="toneOf(c.project)" aria-hidden="true" />
                  <span class="min-w-0 break-words">{{ c.project.title }}</span>
                  <span aria-hidden="true">·</span>
                </template>
                <span class="min-w-0 grow break-words">{{ c.by ? `by ${c.by}` : "Finished" }}</span>
                <button
                  type="button"
                  class="btn sm h-7 shrink-0 px-2 text-xs"
                  :aria-expanded="reopening === c.id"
                  @click="reopening = reopening === c.id ? '' : c.id"
                >
                  Reopen
                </button>
              </span>
              <form
                v-if="reopening === c.id"
                class="mt-1 flex gap-2"
                @submit.prevent="sendReopen(c.id, $event.target as HTMLFormElement)"
              >
                <label class="sr-only" :for="`why-${c.id}`">Why reopen it?</label>
                <input :id="`why-${c.id}`" name="why" class="h-8 min-w-0 grow text-sm" placeholder="What's still wrong" required />
                <button class="btn primary sm" type="submit" :disabled="reopenBusy">
                  {{ reopenBusy ? "Reopening…" : "Reopen" }}
                </button>
              </form>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  </HubShell>
</template>
