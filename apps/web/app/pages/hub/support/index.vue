<!--
  Support: every customer request, one row each, whoever is waiting on us first (docs/LOOP.md §1a).
  A register like Needs you: customer, request (title and their latest words), project, state and how
  long they have waited while the next word is ours. One read (`GET /v1/support`, supportRequests()
  in apps/api/src/needs.ts) gives every column, the state included, so nothing is derived here.

  Four views at their own addresses (`?tab=ours|theirs|solved|all`). Coral is the one thing it
  always means: the customer (or anyone) changed it since you last looked. The team owner's
  tell-the-customer reminder sits at the foot, never in Settings.
-->
<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import type { SupportList, SupportRow } from "~/types/hub";
import { age, toneOf } from "~/utils/projects";

usePage({
  title: "Support · Passalong",
  description: "Every customer request, whoever is waiting on us first.",
  noindex: true,
});
const route = useRoute();
const { api, json, signedIn, data: hub } = useHub();
const { data, isPending, isError, error, refetch } = useQuery({
  queryKey: hubKeys.support,
  queryFn: async () => (await api<SupportList>("/v1/support")) ?? { requests: [], teams: [] },
  enabled: signedIn,
});
const rows = computed(() => data.value?.requests ?? []);

const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick = setInterval(() => (now.value = Date.now()), 60_000);
});
onBeforeUnmount(() => clearInterval(tick));

const STATE: Record<SupportRow["state"], string> = {
  new: "New",
  needs_reply: "Needs reply",
  with_development: "With the team",
  waiting: "Waiting on the customer",
  solved: "Solved",
};
/** The next word is ours: these states are what the page is opened to find. */
const ours = (r: SupportRow) => r.state === "new" || r.state === "needs_reply";

const TABS = [
  { key: "ours", label: "Waiting on us", has: ours },
  {
    key: "development",
    label: "With the team",
    has: (r: SupportRow) => r.state === "with_development",
  },
  {
    key: "theirs",
    label: "Waiting on the customer",
    has: (r: SupportRow) => r.state === "waiting",
  },
  { key: "solved", label: "Solved", has: (r: SupportRow) => r.state === "solved" },
  { key: "all", label: "All", has: () => true },
] as const;
const tab = computed(() => TABS.find((t) => t.key === route.query.tab) ?? TABS[0]);

const q = ref("");
const found = computed(() => {
  const words = q.value.trim().toLowerCase();
  if (!words) return rows.value;
  return rows.value.filter((r) =>
    [r.customer.name, r.customer.email, r.ref, r.title, r.said]
      .join(" ")
      .toLowerCase()
      .includes(words),
  );
});
/** Said per row only when it tells rows apart; when every row is late the summary says so once. */
const allLate = computed(() => list.value.every((r) => r.late));
const countOf = (t: (typeof TABS)[number]) => found.value.filter(t.has).length;
const list = computed(() =>
  found.value
    .filter(tab.value.has)
    // Who has waited longest first; then the most recently moved.
    .sort((a, b) =>
      a.waiting_since && b.waiting_since
        ? a.waiting_since.localeCompare(b.waiting_since)
        : a.waiting_since
          ? -1
          : b.waiting_since
            ? 1
            : b.updated.localeCompare(a.updated),
    ),
);

const summary = computed(() => {
  const waiting = rows.value.filter(ours).length;
  const late = rows.value.filter((r) => r.late).length;
  const changed = rows.value.filter((r) => r.changed).length;
  const parts: string[] = [];
  parts.push(
    !waiting
      ? "Nobody is waiting on us"
      : late === waiting
        ? `${waiting} waiting on us, ${waiting === 1 ? "for" : "all for"} more than 4 hours`
        : late
          ? `${waiting} waiting on us · ${late} for more than 4 hours`
          : `${waiting} waiting on us`,
  );
  if (changed) parts.push(`${changed} changed since you last looked`);
  return parts.join(" · ");
});
const who = (r: SupportRow) => r.customer.name || r.customer.email;

/** An owner's switch: remind the team to tell a customer when a fix made from their request is done. */
const queryClient = useQueryClient();
const setting = ref("");
const tellProblem = ref("");
async function setTell(slug: string, on: boolean) {
  setting.value = slug;
  tellProblem.value = "";
  try {
    await api(`/v1/teams/${encodeURIComponent(slug)}/tell-customer`, json("PUT", { on }));
    await queryClient.invalidateQueries({ queryKey: hubKeys.support });
  } catch (e) {
    tellProblem.value = (e as Error).message;
  } finally {
    setting.value = "";
  }
}

/**
 * Nothing yet: the address to give customers, read only then. With the team in it, as Integrations
 * shows it, so what customers send lands on the team's board.
 */
type Inbound = { available: boolean; addresses: { support: string } | null };
const inbound = ref<Inbound | null>(null);
const team = computed(
  () =>
    hub.value.team?.slug || (hub.value.me?.teams?.length === 1 ? hub.value.me.teams[0]!.slug : ""),
);
const address = computed(() => {
  const a = inbound.value?.addresses?.support ?? "";
  return team.value && a ? a.replace("@", `+${team.value}@`) : a;
});
watch(
  () => !isPending.value && !isError.value && !rows.value.length,
  async (empty) => {
    if (empty && !inbound.value)
      inbound.value = await api<Inbound>("/v1/inbound").catch(() => null);
  },
  { immediate: true },
);

const label = "font-ui text-[0.6875rem] font-medium tracking-wider text-muted uppercase";
/** The register's columns, stated once and shared by its header and every row. */
const cols = "@2xl:grid-cols-[10rem_minmax(0,1fr)_8rem_8.5rem_3.5rem]";
</script>

<template>
  <HubShell>
    <section class="@container flex min-w-0 flex-col" aria-labelledby="support-h">
      <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-4">
        <div class="min-w-0">
          <h1 id="support-h" class="m-0 text-h2 font-medium tracking-tight">Support</h1>
          <p v-if="data && rows.length" class="m-0 mt-1 font-ui text-sm text-muted">{{ summary }}</p>
        </div>
        <label v-if="rows.length" class="flex w-full items-center @2xl:w-64">
          <span class="sr-only">Search requests</span>
          <input
            v-model="q"
            type="search"
            class="h-8 w-full text-sm"
            placeholder="Search customers and requests"
          />
        </label>
      </div>

      <HubSkeleton v-if="isPending" :rows="6" label="Loading support requests" />

      <div
        v-else-if="isError && !data"
        role="alert"
        class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3"
      >
        <div class="min-w-0 grow basis-64">
          <p class="m-0 font-ui text-sm font-semibold text-danger">Support didn't load</p>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ error?.message }}</p>
        </div>
        <button class="btn outline danger sm" type="button" @click="refetch()">Try again</button>
      </div>

      <!-- Nobody has written yet: what to give them, so someone can. -->
      <div v-else-if="!rows.length" class="flex flex-col gap-4 border-t border-fg py-10">
        <p class="m-0 text-h3 font-medium">No customer has written in yet.</p>
        <p class="m-0 max-w-[36rem] font-ui text-sm text-muted">
          Give customers your support address, or forward your support inbox to it. Each request
          lands here as one conversation, the customer gets a tracking number, and you answer from
          here by email.
        </p>
        <div v-if="address" class="flex max-w-[36rem] flex-wrap items-center gap-2">
          <code
            class="flex h-[var(--control-h)] min-w-0 flex-1 items-center overflow-x-auto rounded-1 border border-line-strong bg-field px-3 font-code text-sm whitespace-nowrap text-fg"
          >{{ address }}</code>
          <button class="btn" type="button" @click="copy(address, $event.currentTarget)">
            <AppIcon name="copy" /><span data-label>Copy</span>
          </button>
        </div>
        <p v-else-if="inbound && !inbound.available" class="m-0 font-ui text-sm text-muted">
          Email in isn't set up on this server yet.
        </p>
        <p v-else-if="inbound" class="m-0 font-ui text-sm">
          <NuxtLink to="/hub/settings#integrations">Get your support address</NuxtLink>
          <span class="text-muted"> under Integrations.</span>
        </p>
      </div>

      <template v-else>
        <!-- The hairline is the nav's own inset edge: the row can scroll sideways on a phone
             without clipping the current tab's bar. -->
        <nav
          class="flex gap-5 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)] @max-3xl:pr-12 @max-3xl:[mask-image:linear-gradient(to_right,#000_calc(100%-3rem),transparent)] @2xl:gap-6"
          aria-label="Requests"
        >
          <NuxtLink
            v-for="t in TABS"
            :key="t.key"
            :to="{ query: t.key === 'ours' ? {} : { tab: t.key } }"
            class="tab flex shrink-0 items-baseline gap-2 border-b-2 py-2 font-ui text-sm whitespace-nowrap no-underline"
            :class="tab.key === t.key ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg'"
            :aria-current="tab.key === t.key ? 'page' : undefined"
          >
            {{ t.label }}
            <span class="text-xs text-muted tabular-nums">{{ countOf(t) }}</span>
          </NuxtLink>
        </nav>

        <div v-if="!list.length" class="flex flex-col items-start gap-3 py-10">
          <p class="m-0 text-h3 font-medium">
            <template v-if="q.trim()">Nothing matches “{{ q.trim() }}”{{ tab.key === "all" ? "" : ` in ${tab.label}` }}.</template>
            <template v-else-if="tab.key === 'ours'">Nobody is waiting on us.</template>
            <template v-else-if="tab.key === 'development'">Nothing is with the team.</template>
            <template v-else-if="tab.key === 'theirs'">Nobody owes us an answer.</template>
            <template v-else>Nothing solved yet.</template>
          </p>
          <button v-if="q.trim()" class="btn sm" type="button" @click="q = ''">Clear search</button>
          <NuxtLink v-else :to="{ query: { tab: 'all' } }" class="btn sm">See all requests</NuxtLink>
        </div>

        <template v-else>
          <div aria-hidden="true" class="mt-4 hidden gap-x-3 border-b border-fg pb-2 pl-4 @2xl:grid" :class="[cols, label]">
            <span>Customer</span><span>Request</span><span>Project</span><span>State</span><span class="text-right">Waiting</span>
          </div>
          <ol class="m-0 mt-1 list-none p-0 @2xl:mt-0">
            <li
              v-for="r in list"
              :key="r.id"
              class="group relative grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-b border-line py-3 pl-4 hover:bg-surface @2xl:grid-rows-1"
              :class="cols"
            >
              <span v-if="r.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
              <!-- Customer -->
              <p class="m-0 min-w-0 font-ui text-sm">
                <span class="block break-words text-fg">{{ who(r) }}</span>
                <span v-if="r.ref" class="block text-xs text-muted tabular-nums">{{ r.ref }}</span>
              </p>
              <!-- Waiting: beside the name on a narrow row, last column on a wide one. -->
              <span
                class="col-start-2 row-start-1 text-right font-ui text-sm tabular-nums @2xl:col-start-5"
                :class="r.waiting_since ? 'font-medium text-fg' : 'text-muted'"
              >
                <template v-if="r.waiting_since">{{ age(r.waiting_since, now) }}<span v-if="r.late && !allLate" class="sr-only">, waiting too long</span></template>
                <template v-else><span aria-hidden="true">—</span><span class="sr-only">not waiting on us</span></template>
              </span>
              <!-- Request: the whole row opens it. -->
              <div class="col-span-2 min-w-0 @2xl:col-span-1 @2xl:col-start-2 @2xl:row-start-1">
                <p class="m-0 flex flex-wrap items-baseline gap-x-2 font-ui text-sm">
                  <NuxtLink
                    :to="`/hub/support/${r.id}`"
                    class="font-medium text-fg no-underline after:absolute after:inset-0 group-hover:underline"
                  >{{ r.title }}</NuxtLink>
                  <span v-if="r.changed" class="text-xs font-medium text-changed">Changed · {{ r.changed }}</span>
                </p>
                <p v-if="r.said" class="m-0 mt-0.5 font-ui text-xs break-words text-muted">“{{ shorten(r.said, 110).text }}”</p>
              </div>
              <!-- Project and state: one muted fact line on a narrow row. -->
              <span class="col-span-2 flex min-w-0 flex-wrap items-baseline gap-x-2 font-ui text-xs @2xl:contents">
                <span class="flex min-w-0 items-baseline gap-2 @2xl:col-start-3 @2xl:row-start-1 @2xl:text-sm">
                  <template v-if="r.project">
                    <span class="project-mark h-3.5 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf(r.project)" aria-hidden="true" />
                    <span class="min-w-0 break-words">{{ r.project.title }}</span>
                  </template>
                  <span v-else class="text-muted">Not in a project</span>
                </span>
                <span class="@2xl:col-start-4 @2xl:row-start-1 @2xl:text-sm" :class="ours(r) ? 'font-medium text-fg' : 'text-muted'">
                  <span class="@2xl:hidden" aria-hidden="true">· </span>{{ STATE[r.state] }}
                </span>
              </span>
            </li>
          </ol>
        </template>
      </template>

      <!-- The owner's reminder: a quiet setting row, here and never in Settings. -->
      <section
        v-if="data?.teams.length"
        class="mt-10 flex flex-col gap-2 border-t border-line pt-4"
        aria-label="Reminder"
      >
        <label v-for="t in data.teams" :key="t.slug" class="flex items-start gap-3 font-ui text-sm">
          <input
            type="checkbox"
            class="mt-0.5 size-4 shrink-0 accent-[var(--chosen)]"
            :checked="t.tell"
            :disabled="setting === t.slug"
            @change="setTell(t.slug, ($event.target as HTMLInputElement).checked)"
          />
          <span>
            Tell the customer when a fix is done{{ data.teams.length > 1 ? ` · ${t.name}` : "" }}
            <span class="block text-xs text-muted">
              When work made from a request finishes, its page says so and the agent drafts the
              message. Someone still presses Send.
            </span>
          </span>
        </label>
        <p v-if="tellProblem" class="m-0 font-ui text-sm text-danger" role="alert">{{ tellProblem }}</p>
      </section>
    </section>
  </HubShell>
</template>
