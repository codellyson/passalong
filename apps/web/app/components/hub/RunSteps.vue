<!--
  What a runner's agent is doing, a line at a time ("Editing src/deals/form.tsx", "Running `npm
  test`"), as the runner reads it from the agent and sends it (GET /v1/work/:id/steps). There was no
  way to see what an agent left running alone was doing until it finished or gave up (2026-11-06).

  Asked for every few seconds while the work is held, newest at the bottom, the last few shown with
  the rest a click away. Draws nothing for work no runner has touched.
-->
<script setup lang="ts">
const props = defineProps<{ id: string; live: boolean }>();
const { api } = useHub();

interface Step {
  id: number;
  at: string;
  text: string;
}
const steps = ref<Step[]>([]);
const all = ref(false);
const SHOWN = 8;

async function load() {
  const after = steps.value.at(-1)?.id ?? 0;
  try {
    const got = await api<{ steps: Step[] }>(`/v1/work/${props.id}/steps?after=${after}`);
    if (got?.steps.length) steps.value = [...steps.value, ...got.steps].slice(-200);
  } catch {}
}

let timer: ReturnType<typeof setInterval> | undefined;
function poll() {
  clearInterval(timer);
  if (props.live) timer = setInterval(load, 4000);
}
onMounted(async () => {
  await load();
  poll();
});
watch(
  () => [props.id, props.live],
  async ([id], [was]) => {
    if (id !== was) steps.value = [];
    await load();
    poll();
  },
);
onBeforeUnmount(() => clearInterval(timer));

const shown = computed(() => (all.value ? steps.value : steps.value.slice(-SHOWN)));
const time = (at: string) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
</script>

<template>
  <section v-if="steps.length" aria-labelledby="steps-h" class="flex flex-col gap-1.5 rounded-2 border border-line px-3 py-2.5 font-ui text-sm">
    <div class="flex items-baseline gap-2">
      <h2 id="steps-h" class="m-0 font-ui text-sm font-semibold">
        <span v-if="live" class="mr-1.5 inline-block size-2 rounded-full bg-ok align-middle" aria-hidden="true" />
        {{ live ? "What the agent is doing" : "What the agent did" }}
      </h2>
      <button
        v-if="steps.length > SHOWN"
        class="linkish ml-auto text-xs"
        type="button"
        :aria-expanded="all"
        @click="all = !all"
      >
        {{ all ? "Show the latest" : `Show all ${steps.length}` }}
      </button>
    </div>
    <ol class="m-0 flex list-none flex-col gap-0.5 p-0" aria-live="polite">
      <li v-for="s in shown" :key="s.id" class="flex gap-3">
        <span class="shrink-0 text-xs text-muted tabular-nums">{{ time(s.at) }}</span>
        <span class="min-w-0 break-words" :class="s.text.startsWith('That didn') || s.text.startsWith('Stopped') ? 'text-danger' : ''">{{ s.text }}</span>
      </li>
    </ol>
  </section>
</template>
