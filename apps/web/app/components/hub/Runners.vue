<!--
  The runners (`passalong work --watch`) of you and your teammates, as they last reported
  (GET /v1/runners): which machine, what its agents are on, and how much of today's allowance is
  used, so nobody has to look at a terminal to know. Draws nothing when no runner was seen today.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { age } from "~/utils/projects";

interface Runner {
  host: string;
  repo: string;
  mine: boolean;
  who: string;
  running: { id: string; title: string }[];
  runs_today: number;
  per_day: number;
  at_once: number;
  live: boolean;
  stopped: string;
  seen: string;
}

const { api, signedIn } = useHub();
const runnersQ = useQuery({
  queryKey: ["runners"],
  queryFn: async () => (await api<{ runners: Runner[] }>("/v1/runners"))?.runners ?? [],
  enabled: signedIn,
  // A runner reports once a minute; looking as often keeps the line true without asking more.
  refetchInterval: 60_000,
});
const runners = computed(() => runnersQ.data.value ?? []);
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick = setInterval(() => (now.value = Date.now()), 30_000);
});
onBeforeUnmount(() => clearInterval(tick));

const where = (r: Runner) => `${r.host}${r.mine ? "" : `, ${r.who}'s`}`;
/** "3 of 10 runs today", or that the day's allowance is used up. */
const today = (r: Runner) =>
  r.per_day && r.runs_today >= r.per_day
    ? `all ${r.per_day} of today's runs used, picking up again tomorrow`
    : `${r.runs_today} of ${r.per_day} runs today`;
</script>

<template>
  <section v-if="runners.length" aria-label="Runners" class="flex flex-col gap-1 font-ui text-sm">
    <p v-for="r in runners" :key="`${r.host}|${r.repo}|${r.who}`" class="m-0 flex flex-wrap items-baseline gap-x-2">
      <span
        class="inline-block size-2 shrink-0 self-center rounded-full"
        :class="r.live ? 'bg-ok' : 'bg-line-strong'"
        aria-hidden="true"
      />
      <span class="font-medium">Runner on {{ where(r) }}</span>
      <template v-if="r.live">
        <span class="text-muted">·</span>
        <span v-if="r.running.length" class="min-w-0">
          working on
          <template v-for="(t, i) in r.running" :key="t.id">
            <NuxtLink :to="`/hub/w/${t.id}`" class="text-fg">{{ t.title }}</NuxtLink><span v-if="i < r.running.length - 1">, </span>
          </template>
        </span>
        <span v-else class="text-muted">waiting for work marked safe to run alone</span>
        <span class="text-muted">· {{ today(r) }}</span>
      </template>
      <span v-else class="text-muted">
        · {{ r.stopped ? "stopped" : "not heard from" }} {{ age(r.stopped || r.seen, now) }} ago
      </span>
    </p>
  </section>
</template>
