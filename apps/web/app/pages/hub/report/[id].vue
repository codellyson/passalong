<!--
  One report, and the issues filed under it.

  The board shows each issue on its own, because each one is a guide someone takes and answers for
  separately — that is the whole reason an issue is a guide. But a QA pass is also a thing that
  happened once, and until this page existed the only place five issues were five-issues-together
  was the receipt you saw for a few seconds after filing them.

  So this is the set's own address: what was swept, where, and how much of it is still open.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";
import { areaLabel, severityLabel } from "~/utils/report";

interface ReportView {
  id: string;
  title: string;
  environment: string;
  created: string;
  team: string;
  to: string;
  from: string;
  issues: number;
  failing: number;
  areas: { area: string; issues: Guide[] }[];
}

const route = useRoute();
const id = computed(() => String(route.params.id));
const { api, signedIn } = useHub();

const report = ref<ReportView | null>(null);
const trouble = ref("");

usePage({ title: "Bug report", description: "One report and its issues.", noindex: true });

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

const severityTone: Record<string, string> = {
  s1: "bg-danger-soft text-danger",
  s2: "bg-warn-soft text-warn",
  s3: "bg-accent-soft text-accent",
  s4: "bg-surface text-muted",
};

/** Where an issue has got to, in the words the board already uses. */
function state(issue: Guide) {
  if (issue.failing) return { label: "not working", tone: "text-danger" };
  if (issue.verdict?.ok) return { label: "fixed", tone: "text-ok" };
  if (issue.pulls) return { label: "someone has it", tone: "text-muted" };
  return { label: "nobody has taken it", tone: "text-warn" };
}

const heading = computed(() => report.value?.title || "Bug report");
</script>

<template>
  <HubShell heading="Bug report">
    <template #sub>
      <template v-if="report">
        Filed{{ report.team ? ` to ${report.team}` : "" }}{{ report.environment ? ` against ${report.environment}` : "" }}.
      </template>
      <template v-else>One report and the issues filed under it.</template>
    </template>

    <p v-if="trouble" class="rounded-3 border border-line bg-raised px-4 py-3 font-ui text-sm text-danger">
      {{ trouble }}
    </p>

    <section v-else-if="report" class="flex flex-col gap-4">
      <div class="rounded-3 border border-line bg-raised p-4">
        <h2 class="mt-0 mb-1 text-h2">{{ heading }}</h2>
        <p class="m-0 flex flex-wrap items-baseline gap-x-2 font-code text-sm text-muted">
          <b class="font-semibold text-fg">{{ report.issues }}</b>
          issue{{ report.issues === 1 ? "" : "s" }} across
          <b class="font-semibold text-fg">{{ report.areas.length }}</b>
          area{{ report.areas.length === 1 ? "" : "s" }}
          <template v-if="report.failing">
            · <span class="text-danger">{{ report.failing }} not working</span>
          </template>
        </p>
      </div>

      <!-- One block per area, in the order they were filed. The grouping is derived from the
           issues every time, so an area with nothing left in it stops appearing. -->
      <section
        v-for="group in report.areas"
        :key="group.area || 'none'"
        class="overflow-hidden rounded-3 border border-line bg-raised"
      >
        <div class="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
          <h3 class="m-0 font-ui text-h3 font-semibold">{{ areaLabel(group.area) }}</h3>
          <span class="font-code text-xs text-muted">
            {{ group.issues.length }} issue{{ group.issues.length === 1 ? "" : "s" }}
          </span>
        </div>

        <ul class="m-0 list-none p-0">
          <li
            v-for="issue in group.issues"
            :key="issue.id"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-3 first:border-t-0"
          >
            <span
              v-if="issue.severity"
              class="shrink-0 rounded-pill px-2 py-0.5 font-code text-[11px] uppercase"
              :class="severityTone[issue.severity] || 'bg-surface text-muted'"
              :title="severityLabel(issue.severity)"
            >{{ issue.severity }}</span>
            <a :href="issue.url" target="_blank" rel="noopener" class="min-w-0 flex-1 font-ui text-sm font-medium">
              {{ issue.title || issue.id }}
            </a>
            <span class="shrink-0 font-code text-xs" :class="state(issue).tone">
              {{ state(issue).label }}
            </span>
            <code class="shrink-0 font-code text-xs text-muted">{{ issue.id }}</code>
          </li>
        </ul>
      </section>

      <div class="flex flex-wrap gap-2">
        <NuxtLink to="/hub/report" class="btn primary">Report more bugs</NuxtLink>
        <NuxtLink to="/hub" class="btn">Back to the board</NuxtLink>
      </div>
    </section>

    <p v-else class="font-ui text-sm text-muted">Loading the report…</p>
  </HubShell>
</template>
