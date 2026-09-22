<!--
  Bugs filed together, as one row. A report of eleven used to be eleven rows that differed only in
  their titles, each repeating the team, the time, the report's name and the same three tags.

  Closed, it says how many, whether one blocks, and how far the batch has got. Open, it lists the
  bugs worst first with one status each.
-->
<script setup lang="ts">
import type { ReportGroup } from "~/utils/lanes";

const props = defineProps<{
  group: ReportGroup;
  /** A search is running: show what matched. */
  open?: boolean;
}>();

const { data } = useHub();

const expanded = ref(false);
const shown = computed(() => expanded.value || props.open);

const rows = computed(() => props.group.rows);
const blockers = computed(() => rows.value.filter((r) => r.g.severity === "s1").length);
const team = computed(() =>
  rows.value[0] ? teamLabel(rows.value[0].g, data.value.me?.teams) : "",
);

/** How far the batch has got, in the one phrase that matters most right now. */
const progress = computed(() => {
  const n = rows.value.length;
  const problems = rows.value.filter((r) => r.state?.attention).length;
  if (problems)
    return { text: `${problems} of ${n} sent back or not working`, tone: "text-danger" };
  const taken = rows.value.filter((r) => r.g.taken_by?.length).length;
  if (taken) return { text: `${taken} of ${n} being worked on`, tone: "" };
  const opened = rows.value.filter((r) => r.g.pulled_by?.length).length;
  if (opened) return { text: `${opened} opened, nobody has taken one yet`, tone: "" };
  return { text: "not opened yet", tone: "" };
});

const DOT: Record<string, string> = {
  s1: "bg-danger",
  s2: "bg-warn",
  s3: "bg-accent",
  s4: "bg-line-strong",
};
const TONE = {
  danger: "text-danger",
  accent: "text-accent",
  ok: "text-ok",
  "": "text-muted",
} as const;
</script>

<template>
  <li
    class="group/report m-0 bg-raised shadow-[inset_0_1px_0_var(--line)] first:rounded-t-[var(--r-3)] first:shadow-none last:rounded-b-[var(--r-3)]"
  >
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <button
        type="button"
        class="min-w-0 flex-1 basis-72 cursor-pointer border-0 bg-transparent p-0 text-left"
        :aria-expanded="shown"
        @click="expanded = !expanded"
      >
        <span class="flex items-center gap-2 text-base font-semibold leading-snug text-fg">
          <AppIcon
            name="reveal"
            class="shrink-0 text-muted transition-[rotate] duration-150 ease-out"
            :class="shown ? '' : '-rotate-90'"
          />
          {{ group.title || "Bug report" }}
        </span>
        <span class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-6 font-ui text-sm text-muted">
          <span>{{ plural(rows.length, "bug") }}</span>
          <span
            v-if="blockers"
            class="rounded-pill bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger"
          >{{ plural(blockers, "blocker") }}</span>
          <span v-if="team">· to <b class="font-medium text-fg">{{ team }}</b></span>
          <span>· {{ rel(group.created) }}</span>
          <span :class="progress.tone">· {{ progress.text }}</span>
        </span>
      </button>
      <NuxtLink :to="`/hub/report/${group.report}`" class="btn sm">
        <AppIcon name="open" />Open report
      </NuxtLink>
    </div>

    <ul
      v-if="shown"
      class="m-0 list-none border-t border-line bg-surface p-0 py-1 group-last/report:rounded-b-[var(--r-3)]"
    >
      <li
        v-for="r in rows"
        :key="r.g.id"
        class="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2 pr-4 pl-10"
      >
        <span class="min-w-0 flex-1 basis-64 text-sm leading-snug">
          <span
            class="mr-2 inline-block size-2 rounded-full align-middle"
            :class="DOT[r.g.severity || ''] || 'bg-line-strong'"
            :title="r.g.severity ? severityLabel(r.g.severity) : 'no severity'"
          />
          <a :href="r.g.url" target="_blank" rel="noopener" class="text-fg no-underline hover:text-accent">
            {{ r.g.title || "Untitled bug" }}
          </a>
        </span>
        <span class="font-ui text-xs" :class="TONE[statusLine(r).tone]">{{ statusLine(r).text }}</span>
      </li>
    </ul>
  </li>
</template>
