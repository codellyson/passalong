<!--
  Support: every customer request, one row each (docs/LOOP.md §1a). The states lead, as the filter
  over the table, because the question support opens this page with is "what is where". A row opens
  the request's own page, where the conversation happens and the task it became is shown.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { SupportRow } from "~/types/hub";

usePage({
  title: "Support · Passalong",
  description: "Every customer request and where it stands.",
  noindex: true,
});
const { api, signedIn } = useHub();
const { data, isPending, error } = useQuery({
  queryKey: ["support"],
  queryFn: async () => (await api<{ requests: SupportRow[] }>("/v1/support"))?.requests ?? [],
  enabled: signedIn,
});
const rows = computed(() => data.value ?? []);

const STATES: { id: SupportRow["state"]; label: string }[] = [
  { id: "new", label: "New" },
  { id: "needs_reply", label: "Needs reply" },
  { id: "with_development", label: "With development" },
  { id: "waiting", label: "Waiting on customer" },
  { id: "solved", label: "Solved" },
];
const label = (s: SupportRow["state"]) => STATES.find((x) => x.id === s)?.label ?? s;
const count = (s: SupportRow["state"]) => rows.value.filter((r) => r.state === s).length;

/** "" is every open request; solved ones show only when asked for. */
const shown = ref<SupportRow["state"] | "">("");
const list = computed(() =>
  rows.value
    .filter((r) => (shown.value ? r.state === shown.value : r.state !== "solved"))
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

/** How long someone has waited, the way a person says it: "12 min", "5 h", "2 days". */
function waited(iso: string): string {
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, Math.floor(m))} min`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} h`;
  return `${Math.floor(m / 1440)} days`;
}

const open = (r: SupportRow) => navigateTo(`/hub/support/${r.id}`);
const head =
  "border-0 border-b border-b-line bg-transparent px-3 py-2 text-left font-ui text-xs font-semibold tracking-wide text-muted uppercase";
const cell = "border-0 border-b border-b-line px-3 py-3 align-top font-ui text-sm";
</script>

<template>
  <HubShell>
    <div class="flex flex-col gap-6">
      <h1 class="m-0">Support</h1>

      <div class="flex flex-wrap gap-2" role="group" aria-label="Show requests by state">
        <button
          class="btn sm"
          :class="shown === '' ? 'primary' : ''"
          type="button"
          :aria-pressed="shown === ''"
          @click="shown = ''"
        >Open <span class="tabular-nums">{{ rows.length - count("solved") }}</span></button>
        <button
          v-for="s in STATES"
          :key="s.id"
          class="btn sm"
          :class="shown === s.id ? 'primary' : ''"
          type="button"
          :aria-pressed="shown === s.id"
          @click="shown = s.id"
        >{{ s.label }} <span class="tabular-nums">{{ count(s.id) }}</span></button>
      </div>

      <p v-if="error" class="m-0 font-ui text-sm text-danger">{{ error.message }}</p>
      <HubSkeleton v-else-if="isPending" variant="lines" :rows="5" label="Loading support requests" />
      <p v-else-if="!rows.length" class="m-0 font-ui text-sm text-muted">
        No customer has written in yet. Customers write to your support address, under
        <NuxtLink to="/hub/settings#integrations">Integrations</NuxtLink>.
      </p>
      <p v-else-if="!list.length" class="m-0 font-ui text-sm text-muted">Nothing here right now.</p>
      <div v-else class="overflow-x-auto rounded-3 bg-raised px-2 shadow-edge">
        <table class="w-full border-collapse">
          <thead class="max-sm:hidden">
            <tr>
              <th :class="head">Customer</th>
              <th :class="head">Request</th>
              <th :class="head">State</th>
              <th :class="head" class="text-right">Waiting</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in list"
              :key="r.id"
              class="cursor-pointer hover:bg-field max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:border-b max-sm:border-line max-sm:py-2"
              @click="open(r)"
            >
              <td :class="cell" class="w-[13rem] max-sm:w-auto max-sm:border-0 max-sm:pb-0">
                <NuxtLink
                  :to="`/hub/support/${r.id}`"
                  class="font-medium text-fg no-underline"
                  @click.stop
                >{{ r.customer.name || r.customer.email }}</NuxtLink>
              </td>
              <td :class="cell" class="max-sm:col-span-2 max-sm:row-start-2 max-sm:border-0 max-sm:py-1">
                <span class="block text-fg">{{ r.title }}</span>
                <span v-if="r.last.line" class="mt-0.5 block text-muted">
                  {{ r.last.by === "team" ? "You:" : "" }} {{ shorten(r.last.line, 90).text }}
                </span>
              </td>
              <td :class="cell" class="w-[11rem] whitespace-nowrap max-sm:col-span-2 max-sm:row-start-3 max-sm:w-auto max-sm:border-0 max-sm:pt-0 max-sm:text-muted">{{ label(r.state) }}</td>
              <td :class="cell" class="w-[6rem] text-right whitespace-nowrap tabular-nums max-sm:col-start-2 max-sm:row-start-1 max-sm:w-auto max-sm:border-0 max-sm:pb-0">
                <span v-if="r.waiting_since" class="text-fg">{{ waited(r.waiting_since) }}</span>
                <span v-else class="text-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </HubShell>
</template>
