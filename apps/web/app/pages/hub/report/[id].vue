<!--
  One report, and the bugs filed under it.

  Reports are filed by agents — a test run, a QA pass, a review — not by a form in the hub. This is
  where the set lives afterwards: what was checked, where, and how much of it is still open. Each
  bug is still its own guide someone takes and answers for, so each row says where that one got to.
-->
<script setup lang="ts">
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
const { data, api, signedIn } = useHub();

const report = ref<ReportView | null>(null);
const trouble = ref("");

usePage({
  title: "Bug report · Passalong",
  description: "One report and its bugs.",
  noindex: true,
});

async function load() {
  try {
    const answer = await api<{ report: ReportView }>(`/v1/reports/${id.value}`);
    report.value = answer?.report || null;
  } catch (e) {
    trouble.value = (e as Error).message;
  }
}

// Nothing is fetched during SSR — the credential is not visible from the server — so the shell
// renders signed-out first and this runs once the client knows who it is.
onMounted(load);
watch(signedIn, (yes) => yes && !report.value && load());

/** Where a bug has got to, in the same words the guides page uses. */
function state(issue: Guide) {
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
</script>

<template>
  <HubShell>
    <p v-if="trouble" class="rounded-3 border border-line bg-raised px-4 py-3 font-ui text-sm text-danger">
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
        class="overflow-hidden rounded-3 border border-line bg-raised"
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
            <a :href="issue.url" target="_blank" rel="noopener" class="min-w-0 flex-1 font-ui text-sm font-medium">
              {{ issue.title || "Untitled bug" }}
            </a>
            <span class="shrink-0 font-ui text-xs" :class="state(issue).tone">
              {{ state(issue).label }}
            </span>
          </li>
        </ul>
      </section>

      <div>
        <NuxtLink to="/hub" class="btn">Back to your guides</NuxtLink>
      </div>
    </section>

    <p v-else class="font-ui text-sm text-muted">Loading the report…</p>
  </HubShell>
</template>
