<!--
  The runners (`passalong work --watch`) of you and your teammates, as they last reported
  (GET /v1/runners): one line per computer, the repos it serves, and what each of its agents is on
  with the last thing it did, so nobody has to look at a terminal to know. Draws nothing when no
  runner was seen today.

  One line per computer, not per report: six runners started in six repos on one Mac were six
  identical lines saying "Runner on Mac · waiting", none of them naming its repo (2026-11-06).
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { age } from "~/utils/projects";
import type { RunnerRow } from "~/utils/runner";

const { api, signedIn } = useHub();
const runnersQ = useQuery({
  queryKey: ["runners"],
  queryFn: async () => (await api<{ runners: RunnerRow[] }>("/v1/runners"))?.runners ?? [],
  enabled: signedIn,
  // A runner reports once a minute and its agents' steps every few seconds: looking every 15s keeps
  // "what it did last" close to true without asking much.
  refetchInterval: 15_000,
});
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick = setInterval(() => (now.value = Date.now()), 30_000);
});
onBeforeUnmount(() => clearInterval(tick));

interface Machine {
  key: string;
  host: string;
  who: string;
  mine: boolean;
  live: boolean;
  repos: string[];
  running: RunnerRow["running"];
  runs_today: number;
  per_day: number;
  /** When it stopped or went quiet, for one that isn't live. */
  last: string;
  stopped: boolean;
}

/** The reports, folded into one per computer and person: live ones first. */
const machines = computed<Machine[]>(() => {
  const by = new Map<string, Machine>();
  for (const r of runnersQ.data.value ?? []) {
    const key = `${r.host}|${r.who}`;
    const m =
      by.get(key) ??
      ({
        key,
        host: r.host,
        who: r.who,
        mine: r.mine,
        live: false,
        repos: [],
        running: [],
        runs_today: 0,
        per_day: r.per_day,
        last: "",
        stopped: true,
      } as Machine);
    if (r.live) {
      m.live = true;
      m.repos.push(...(r.repos?.length ? r.repos : [r.repo]).filter((x) => !m.repos.includes(x)));
      m.running.push(...r.running);
    }
    // They share a day's count on one computer, so the largest is the true one.
    m.runs_today = Math.max(m.runs_today, r.runs_today);
    m.per_day = Math.max(m.per_day, r.per_day);
    if (!r.live && (!m.last || (r.stopped || r.seen) > m.last)) {
      m.last = r.stopped || r.seen;
      m.stopped = Boolean(r.stopped);
    }
    by.set(key, m);
  }
  return [...by.values()].sort((a, b) => Number(b.live) - Number(a.live));
});

const where = (m: Machine) => `${m.host}${m.mine ? "" : `, ${m.who}'s`}`;
const short = (repo: string) => repo.split("/").pop() || repo;
/** "khaime-mobile", "3 repos", with every name in the title. */
const serving = (m: Machine) =>
  m.repos.length === 1 ? short(m.repos[0] ?? "") : `${m.repos.length} repos`;
/**
 * "3 runs today". A runner from before 1.3.0 still stops at its own count of ten a day, so for one
 * of those the line says so, with how to lift it.
 */
const today = (m: Machine) =>
  m.per_day && m.runs_today >= m.per_day
    ? `all ${m.per_day} of today's runs used: update it (npm i -g passalong@latest) to run without a daily limit`
    : `${m.runs_today} run${m.runs_today === 1 ? "" : "s"} today`;
</script>

<template>
  <section v-if="machines.length" aria-label="Runners" class="flex flex-col gap-1.5 font-ui text-sm">
    <div v-for="m in machines" :key="m.key" class="flex flex-col gap-0.5">
      <p class="m-0 flex flex-wrap items-baseline gap-x-2">
        <span
          class="inline-block size-2 shrink-0 self-center rounded-full"
          :class="m.live ? 'bg-ok' : 'bg-line-strong'"
          aria-hidden="true"
        />
        <span class="font-medium">Runner on {{ where(m) }}</span>
        <template v-if="m.live">
          <span class="text-muted">·</span>
          <span class="text-muted" :title="m.repos.join('\n')">serving {{ serving(m) }}</span>
          <span v-if="!m.running.length" class="text-muted">· waiting for work marked safe to run alone</span>
          <span class="text-muted">· {{ today(m) }}</span>
        </template>
        <span v-else class="text-muted">
          · {{ m.stopped ? "stopped" : "not heard from" }} {{ age(m.last, now) }} ago
        </span>
      </p>
      <!-- Each agent it is running, with the last thing it did: the link opens all of it. -->
      <p v-for="t in m.running" :key="t.id" class="m-0 flex min-w-0 flex-wrap items-baseline gap-x-2 pl-4">
        <NuxtLink :to="`/hub/w/${t.id}`" class="min-w-0 truncate font-medium text-fg">{{ t.title }}</NuxtLink>
        <span v-if="t.step" class="min-w-0 truncate text-muted">· {{ t.step.text }} · {{ age(t.step.at, now) }} ago</span>
        <span v-else class="text-muted">· starting</span>
      </p>
    </div>
  </section>
</template>
