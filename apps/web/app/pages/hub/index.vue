<!--
  Needs you: the hub's first screen. What waits on the signed-in person, ranked by the server
  (`GET /v1/needs`, apps/api/src/needs.ts) — customers waiting on us, an agent's question, work sent
  to you that nobody took, an agent gone quiet, your work that came back — and beside it the
  customers waiting and what was finished lately, each with Reopen.

  It decides: the server's first row leads as Next, with Start opening the rest one at a time
  (/hub/next). The rest is grouped by reason in the server's order, the oldest three of each shown.
  The same customer asking the same thing twice is already one row (`also`, folded in needs.ts).

  An ink bar at a row's left edge, with a line naming what changed, says changed since you last
  looked (coral is the hub's active state). It stays until the work is opened (`markSeen`).
-->
<script setup lang="ts">
import type { NeedRow, Needs } from "~/types/hub";
import { age, toneOf } from "~/utils/projects";

// Inline: definePageMeta is lifted out of this script and cannot see its variables.
definePageMeta({
  middleware: async (to) => {
    // Someone with no team who never touched setup sets up before Needs you renders, so the
    // register never flashes on the way (pages/hub/start.vue). On a first load the server asks,
    // with the session cookie the request carried, and answers with a redirect; a redirect made
    // while the client hydrates left a blank page. Moving here inside the app, the client asks, and
    // the answer is cached as the shell's own `me`.
    type MeLike = Parameters<typeof needsSetup>[0];
    const app = useNuxtApp();
    let me: MeLike = null;
    if (import.meta.server) {
      me = await useRequestFetch()<MeLike>("/v1/me").catch(() => null);
    } else if (!app.isHydrating) {
      const hub = useHub();
      hub.adoptToken();
      me = await app.$queryClient
        .fetchQuery({
          queryKey: hubKeys.me,
          queryFn: () => hub.api<MeLike>("/v1/me"),
          staleTime: 30_000,
        })
        .catch(() => null);
    }
    if (needsSetup(me)) return navigateTo("/hub/start", { replace: true });
  },
});

usePage({
  title: "Needs you · Passalong",
  description: "What waits on you, ranked: customers, questions from agents, work nobody took.",
  noindex: true,
});

const { data, needsQ, readAll, onReopen, refresh } = useHub();
const noTeam = computed(() => Boolean(data.value.me) && !data.value.me?.teams.length);
const needs = computed<Needs | null>(() => needsQ.data.value ?? null);
const rows = computed(() => needs.value?.rows ?? []);
/** The other requests folded into a row by needs.ts (`also`); types/hub.ts does not name it yet. */
type Row = NeedRow;
const lead = computed<Row | undefined>(() => rows.value[0]);
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
/** Finished in the last day: what the empty state says happened overnight. */
const overnight = computed(() =>
  (needs.value?.closed ?? []).filter((c) => now.value - Date.parse(c.at) < 864e5),
);
/** Each thing said once: the customer count only when it is not the whole list. */
const summary = computed(() => {
  const n = rows.value.length;
  const c = customerCount.value;
  const parts: string[] = [];
  if (n)
    parts.push(
      c === n
        ? `${n} waiting on you, ${n === 1 ? "a customer" : "all customers"}`
        : c
          ? `${n} waiting on you · ${c} customer${c === 1 ? "" : "s"}`
          : `${n} waiting on you`,
    );
  if (changedCount.value) parts.push(`${changedCount.value} changed since you last looked`);
  return parts.join(" · ");
});

const VERB: Record<NeedRow["reason"], string> = {
  customer: "Reply",
  asking: "Answer",
  stuck: "Open",
  untaken: "Open",
  came_back: "Open",
};
const plainWords = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** The line under a title: what was said, or the summary unless it only restates the title. */
function secondLine(r: NeedRow): string {
  if (r.said) return r.said;
  const s = plainWords(r.summary);
  const t = plainWords(r.title);
  return !s || s.includes(t) || t.includes(s) ? "" : r.summary;
}
const href = (r: { id: string; reason?: NeedRow["reason"] }) =>
  r.reason === "customer" ? `/hub/support/${r.id}` : `/hub/w/${r.id}`;
/** Who it is with, and how many requests when one customer asked the same thing more than once. */
const withWho = (r: Row) =>
  r.also?.length ? `${r.with} · ${r.also.length + 1} requests` : r.with || "Nobody";

/** The groups, in the server's order of reasons; inside each, the server's rank (oldest first). */
const GROUP: Record<NeedRow["reason"], string> = {
  customer: "Customers waiting",
  asking: "Agents asking",
  stuck: "Went quiet",
  untaken: "Nobody took it",
  came_back: "Came back to you",
};
const SHOWN = 3;
/** Requests, not rows: Support lists each one a customer opened. */
const customerRequests = computed(() =>
  rows.value.reduce(
    (n, r: Row) => n + (r.reason === "customer" ? 1 + (r.also?.length ?? 0) : 0),
    0,
  ),
);
const groups = computed(() => {
  const by = new Map<NeedRow["reason"], Row[]>();
  for (const r of rows.value.slice(1)) by.set(r.reason, [...(by.get(r.reason) ?? []), r]);
  return [...by].map(([reason, list]) => ({ reason, list }));
});
const opened = ref(new Set<string>());
function toggle(reason: string) {
  const next = new Set(opened.value);
  if (!next.delete(reason)) next.add(reason);
  opened.value = next;
}

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
/** The register's columns, stated once and shared by its header and every row. */
const cols = "@2xl:grid-cols-[minmax(0,1fr)_8.5rem_8rem_3.5rem_4.75rem]";
</script>

<template>
  <HubShell>
    <div class="grid items-start gap-x-10 gap-y-12 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <section aria-labelledby="needs-h" class="@container min-w-0">
        <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-4">
          <div class="min-w-0">
            <h1 id="needs-h" class="m-0 text-h2 font-medium tracking-tight">Needs you</h1>
            <p v-if="needs && summary" class="m-0 mt-1 font-ui text-sm text-muted">{{ summary }}</p>
          </div>
          <button v-if="changedCount" type="button" class="btn sm" @click="readAll()">
            Mark all seen
          </button>
        </div>

        <HubSetupNote />

        <HubSkeleton v-if="needsQ.isPending.value" :rows="6" label="Loading what needs you" />

        <div
          v-else-if="needsQ.isError.value && !needs"
          role="alert"
          class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3"
        >
          <div class="min-w-0 grow basis-64">
            <p class="m-0 font-ui text-sm font-semibold text-danger">This list didn't load</p>
            <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ needsQ.error.value?.message }}</p>
          </div>
          <button class="btn outline danger sm" type="button" @click="needsQ.refetch()">Try again</button>
        </div>

        <div v-else-if="!rows.length" class="flex flex-col gap-4 border-t border-fg py-10">
          <p class="m-0 text-h3 font-medium">Nothing needs you.</p>
          <p class="m-0 max-w-[36rem] font-ui text-sm text-muted">
            A customer waiting on an answer, an agent's question, work sent to you that nobody took,
            an agent that went quiet: each lands here, oldest first.
          </p>
          <div v-if="noTeam" class="mt-2 flex flex-col gap-2">
            <p class="m-0 font-ui text-sm text-muted">Someone sent you an invite? Paste it to join their team.</p>
            <HubInvitePaste label="Invite link" />
          </div>
          <div v-if="overnight.length" class="mt-2 flex flex-col gap-2">
            <p :class="label" class="m-0">Closed in the last day</p>
            <ul class="m-0 flex list-none flex-col p-0">
              <li v-for="c in overnight" :key="c.id" class="flex items-baseline gap-3 border-t border-line py-2 font-ui text-sm">
                <NuxtLink :to="`/hub/w/${c.id}`" class="min-w-0 grow no-underline">{{ c.title }}</NuxtLink>
                <span class="shrink-0 text-xs text-muted tabular-nums">{{ age(c.at, now) }}</span>
              </li>
            </ul>
          </div>
        </div>

        <template v-else>
          <!-- Next: the server's first row, said in full, and the way into the rest one at a time. -->
          <section v-if="lead" aria-labelledby="lead-h" class="relative flex flex-col gap-3 rounded-3 border border-line bg-raised py-4 pr-4 pl-5">
            <span v-if="lead.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
            <h2 id="lead-h" class="m-0 flex flex-wrap items-baseline gap-x-2 text-h3 font-medium tracking-tight break-words">
              <NuxtLink :to="href(lead)" class="text-fg no-underline hover:underline">{{ lead.title }}</NuxtLink>
              <span v-if="lead.changed" class="font-ui text-xs font-medium text-changed">Changed · {{ lead.changed }}</span>
            </h2>
            <p v-if="secondLine(lead)" class="m-0 max-w-[65ch] font-ui text-sm break-words text-fg">
              {{ lead.said ? `“${secondLine(lead)}”` : secondLine(lead) }}
            </p>
            <p class="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-ui text-xs text-muted">
              <span class="font-medium text-fg">{{ GROUP[lead.reason] }}</span>
              <span aria-hidden="true">·</span>
              <span class="tabular-nums">{{ age(lead.since, now) }}</span>
              <span aria-hidden="true">·</span>
              <span class="break-words">{{ withWho(lead) }}</span>
              <span aria-hidden="true">·</span>
              <span class="inline-flex min-w-0 items-baseline gap-2">
                <template v-if="lead.project">
                  <span class="project-mark h-3 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf(lead.project)" aria-hidden="true" />
                  <span class="break-words">{{ lead.project.title }}</span>
                </template>
                <template v-else>Not in a project</template>
              </span>
            </p>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
              <NuxtLink :to="{ path: '/hub/next', query: { id: lead.id } }" class="btn primary">Start</NuxtLink>
              <NuxtLink :to="href(lead)" class="btn">{{ VERB[lead.reason] }}</NuxtLink>
              <span v-if="rows.length > 1" class="font-ui text-xs text-muted">
                Start goes through all {{ rows.length }}, one at a time.
              </span>
            </div>
          </section>

          <section
            v-for="(g, gi) in groups"
            :key="g.reason"
            :aria-labelledby="`grp-${g.reason}`"
            :class="gi ? 'mt-6' : 'mt-8'"
          >
            <h2 :id="`grp-${g.reason}`" class="m-0 flex items-baseline gap-2 border-b border-fg pb-2 font-ui text-sm font-semibold tracking-normal">
              {{ GROUP[g.reason] }}
              <span class="font-normal text-muted tabular-nums">{{ g.list.length }}</span>
            </h2>
            <!-- The column labels, once, under the first group's heading. -->
            <div
              v-if="!gi"
              aria-hidden="true"
              class="hidden gap-x-3 border-b border-line pt-2 pb-2 pl-4 @2xl:grid"
              :class="[cols, label]"
            >
              <span>Work</span><span>Project</span><span>With</span><span class="text-right">Waiting</span><span />
            </div>
            <ol class="m-0 list-none p-0">
              <li
                v-for="r in opened.has(g.reason) ? g.list : g.list.slice(0, SHOWN)"
                :key="r.id"
                class="relative flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line py-3 pl-4 @2xl:grid @2xl:items-baseline"
                :class="cols"
              >
                <span v-if="r.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
                <div class="min-w-0 grow basis-[calc(100%-6rem)] @2xl:basis-auto">
                  <p class="m-0 flex flex-wrap items-baseline gap-x-2 font-ui text-sm">
                    <NuxtLink :to="href(r)" class="font-medium text-fg no-underline hover:underline">{{ r.title }}</NuxtLink>
                    <span v-if="r.changed" class="text-xs font-medium text-changed">Changed · {{ r.changed }}</span>
                  </p>
                  <p v-if="secondLine(r)" class="m-0 mt-1 font-ui text-xs break-words text-muted">
                    {{ r.said ? `“${secondLine(r)}”` : secondLine(r) }}
                  </p>
                </div>
                <NuxtLink :to="href(r)" class="btn sm order-1 shrink-0 @2xl:order-none @2xl:col-start-5 @2xl:row-start-1 @2xl:justify-self-end">
                  {{ VERB[r.reason] }}
                </NuxtLink>
                <span class="order-2 flex min-w-0 items-baseline gap-2 font-ui text-xs @2xl:order-none @2xl:col-start-2 @2xl:row-start-1 @2xl:text-sm">
                  <template v-if="r.project">
                    <span class="project-mark h-3.5 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf(r.project)" aria-hidden="true" />
                    <span class="min-w-0 break-words">{{ r.project.title }}</span>
                  </template>
                  <span v-else class="text-muted">Not in a project</span>
                </span>
                <span class="order-2 min-w-0 font-ui text-xs break-words text-muted @max-2xl:-ml-2 @2xl:order-none @2xl:col-start-3 @2xl:row-start-1 @2xl:text-sm @2xl:text-fg">
                  <span class="mr-1 @2xl:hidden" aria-hidden="true">·</span>{{ withWho(r) }}
                </span>
                <span class="order-2 font-ui text-xs text-muted tabular-nums @max-2xl:-ml-2 @2xl:order-none @2xl:col-start-4 @2xl:row-start-1 @2xl:text-right @2xl:text-sm @2xl:text-fg">
                  <span class="mr-1 @2xl:hidden" aria-hidden="true">·</span>{{ age(r.since, now) }}
                </span>
              </li>
            </ol>
            <NuxtLink
              v-if="g.reason === 'customer' && g.list.length > SHOWN"
              to="/hub/support"
              class="mt-2 inline-block font-ui text-xs text-muted"
            >
              All {{ customerRequests }} in Support
            </NuxtLink>
            <button
              v-else-if="g.list.length > SHOWN"
              type="button"
              class="linkish mt-2 font-ui text-xs text-muted"
              :aria-expanded="opened.has(g.reason)"
              @click="toggle(g.reason)"
            >
              {{ opened.has(g.reason) ? "Show fewer" : `Show all ${g.list.length}` }}
            </button>
          </section>
        </template>
      </section>

      <aside class="flex min-w-0 flex-col gap-6" aria-label="Closed work and customers">
        <section aria-labelledby="closed-h" class="flex flex-col rounded-3 border border-line bg-raised px-4 pt-3 pb-1">
          <h2 id="closed-h" class="m-0 border-b border-fg pb-2 font-ui text-sm font-semibold tracking-normal">Closed by the agent</h2>
          <HubSkeleton v-if="needsQ.isPending.value" variant="lines" :rows="3" label="Loading closed work" class="my-3" />
          <p v-else-if="!needs?.closed.length" class="m-0 py-3 font-ui text-sm text-muted">Nothing was finished this week.</p>
          <ul v-else class="m-0 flex list-none flex-col p-0">
            <li v-for="c in needs.closed" :key="c.id" class="relative flex flex-col gap-1 border-b border-line py-3 pl-3 last:border-b-0">
              <span v-if="c.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
              <span class="flex items-baseline gap-3">
                <NuxtLink :to="`/hub/w/${c.id}`" class="min-w-0 grow font-ui text-sm font-medium break-words text-fg no-underline hover:underline">{{ c.title }}</NuxtLink>
                <span class="shrink-0 font-ui text-xs text-muted tabular-nums">{{ age(c.at, now) }}</span>
              </span>
              <span class="flex items-center gap-2 font-ui text-xs text-muted">
                <template v-if="c.project">
                  <span class="project-mark h-3 w-[3px] shrink-0 rounded-[1px]" :data-tone="toneOf(c.project)" aria-hidden="true" />
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

        <!-- Only the requests waiting on the customer: the ones waiting on us are rows already. -->
        <section v-if="needs?.customers.length" aria-labelledby="cust-h" class="flex flex-col rounded-3 border border-line bg-raised px-4 pt-3 pb-1">
          <div class="flex items-baseline justify-between border-b border-fg pb-2">
            <h2 id="cust-h" class="m-0 font-ui text-sm font-semibold tracking-normal">Waiting on the customer</h2>
            <NuxtLink to="/hub/support" class="font-ui text-xs text-muted">All requests</NuxtLink>
          </div>
          <ul class="m-0 flex list-none flex-col p-0">
            <li v-for="c in needs.customers" :key="c.id" class="relative border-b border-line py-3 pl-3 last:border-b-0">
              <span v-if="c.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
              <NuxtLink :to="`/hub/support/${c.id}`" class="flex flex-col gap-0.5 no-underline">
                <span class="flex items-baseline gap-3">
                  <span class="min-w-0 grow font-ui text-sm font-medium break-words text-fg">{{ c.customer }}</span>
                  <span class="shrink-0 font-ui text-xs text-muted tabular-nums">{{ age(c.since, now) }}</span>
                </span>
                <span class="font-ui text-xs break-words text-muted">{{ c.title }}</span>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  </HubShell>
</template>
