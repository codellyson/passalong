<!--
  One report, and the bugs filed under it.

  Reports are filed by agents — a test run, a QA pass, a review — not by a form in the hub. This is
  where the set lives afterwards: what was checked, where, and how much of it is still open. Each
  bug is still its own guide someone takes and answers for, so each row says where that one got to.
-->
<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import type { Guide } from "~/types/hub";
import { areaLabel, severityLabel, severityTone } from "~/utils/severity";

interface ReportView {
  id: string;
  title: string;
  environment: string;
  created: string;
  team: string;
  team_name?: string;
  to: string;
  from: string;
  issues: number;
  failing: number;
  areas: { area: string; issues: Guide[] }[];
}

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data, api, signedIn, onCloseGuide } = useHub();
const queryClient = useQueryClient();

usePage({
  title: "Bug report · Passalong",
  description: "One report and its bugs.",
  noindex: true,
});

// Nothing is fetched during SSR — the credential is not visible from the server — so the query
// waits until the client knows who it is.
const {
  data: loaded,
  isPending,
  error,
} = useQuery({
  queryKey: computed(() => ["report", id.value] as const),
  queryFn: async () =>
    (await api<{ report: ReportView }>(`/v1/reports/${id.value}`))?.report ?? null,
  enabled: signedIn,
});
const report = computed(() => loaded.value ?? null);
const trouble = computed(() => (error.value ? error.value.message : ""));

/** Where a bug has got to, in the same words the guides page uses. */
function state(issue: Guide) {
  // First, because a bug taken off the board is off it whatever it last said. The hub's rows drop
  // out of the lane at that point; here they stay, so the row has to say so itself — and it says
  // the same word `statusLine` says.
  if (issue.status === "consumed") return { label: "archived", tone: "text-muted" };
  if (issue.failing) return { label: "didn't work", tone: "text-danger" };
  if (issue.verdict?.ok) return { label: "fixed", tone: "text-ok" };
  if (issue.taken_by?.length) return { label: "being worked on", tone: "text-muted" };
  if (issue.pulled_by?.length || issue.pulls)
    return { label: "opened, nobody has taken it", tone: "text-warn" };
  return { label: "not opened yet", tone: "text-warn" };
}

const team = computed(() =>
  report.value
    ? report.value.team_name ||
      data.value.me?.teams.find((t) => t.slug === report.value?.team)?.name ||
      report.value.team
    : "",
);

/**
 * Closing, one bug or the whole set.
 *
 * A report of eleven bugs had no way off the board: the hub's group row and this page both draw
 * their own markup, so neither inherited the Close it a single guide row has had since PR #46.
 * The only exit was the fortnight the sweep waits before closing a guide nobody opened.
 *
 * Each bug is closed on its own call, because a report is a bundle of guides rather than something
 * the server closes as a unit. The page reloads once at the end, not once per bug.
 */
const open = computed(() => (report.value?.areas ?? []).flatMap((a) => a.issues).filter(closable));
const closing = ref<string | null>(null);

async function close(issues: Guide[], mark: string) {
  if (closing.value) return;
  closing.value = mark;
  try {
    for (const issue of issues) await onCloseGuide(issue);
    await queryClient.invalidateQueries({ queryKey: ["report", id.value] });
  } finally {
    closing.value = null;
  }
}
</script>

<template>
  <HubShell>
    <p v-if="trouble" class="rounded-3 bg-raised shadow-edge px-4 py-3 font-ui text-sm text-danger">
      {{ trouble }} <NuxtLink to="/hub">Go to your guides</NuxtLink>
    </p>

    <section v-else-if="report" class="flex flex-col gap-4">
      <div>
        <h1 class="mt-0 mb-1">{{ report.title || "Bug report" }}</h1>
        <p class="m-0 font-ui text-sm text-muted">
          {{ plural(report.issues, "bug") }} in {{ plural(report.areas.length, "area") }}
          <template v-if="team"> · sent to {{ team }}</template>
          <template v-if="report.environment"> · found on {{ report.environment }}</template>
          <template v-if="report.failing">
            · <span class="text-danger">{{ report.failing }} didn't work</span>
          </template>
        </p>
      </div>

      <!-- One block per area, in the order they were filed. The grouping is derived from the
           bugs every time, so an area with nothing left in it stops appearing. -->
      <section
        v-for="group in report.areas"
        :key="group.area || 'none'"
        class="overflow-hidden rounded-3 bg-raised shadow-edge"
      >
        <div class="flex flex-wrap items-baseline gap-3 border-b border-line bg-surface px-4 py-3">
          <h2 class="m-0 font-ui text-h3 font-semibold">{{ areaLabel(group.area) }}</h2>
          <span class="font-ui text-sm text-muted">{{ plural(group.issues.length, "bug") }}</span>
        </div>

        <ul class="m-0 list-none p-0">
          <li
            v-for="issue in group.issues"
            :key="issue.id"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-3 first:border-t-0"
          >
            <span
              v-if="issue.severity"
              class="shrink-0 rounded-pill px-2 py-0.5 font-ui text-xs font-semibold"
              :class="severityTone(issue.severity)"
            >{{ severityLabel(issue.severity) }}</span>
            <NuxtLink :to="`/hub/g/${issue.id}`" class="min-w-0 flex-1 font-ui text-sm font-medium">
              {{ issue.title || "Untitled bug" }}
            </NuxtLink>
            <span class="shrink-0 font-ui text-xs" :class="state(issue).tone">
              {{ state(issue).label }}
            </span>
            <button
              v-if="closable(issue)"
              class="linkish shrink-0 font-ui text-xs"
              type="button"
              :disabled="Boolean(closing)"
              @click="close([issue], issue.id)"
            >
              {{ closing === issue.id ? "Archiving…" : "Archive" }}
            </button>
          </li>
        </ul>
      </section>

      <div class="flex flex-wrap gap-3">
        <NuxtLink to="/hub" class="btn">Back to your guides</NuxtLink>
        <!-- The whole set off the board in one move, for a report whose bugs are all answered
             or no longer worth fixing. Whoever each went to is told, and each can be put back. -->
        <button
          v-if="open.length"
          class="btn"
          type="button"
          :disabled="Boolean(closing)"
          @click="close(open, 'all')"
        >
          {{
            closing === "all"
              ? "Archiving…"
              : open.length === report.issues
                ? "Archive every bug"
                : `Archive the ${open.length} still open`
          }}
        </button>
      </div>
    </section>

    <div v-else-if="isPending" class="flex flex-col gap-4">
      <span class="block h-7 w-2/3 rounded-pill bg-line-strong" aria-hidden="true" />
      <HubSkeleton :rows="4" label="Loading the report" />
    </div>
  </HubShell>
</template>
