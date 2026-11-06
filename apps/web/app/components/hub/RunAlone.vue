<!--
  On a piece of work's page: whether the runner (`passalong work --watch`) may take it with nobody
  watching, which repo it runs in, and whether anything will take it. It sat at the foot of the More
  menu, and ticking it said nothing about where it would run, so ticked work waited forever with no
  word why (2026-11-06). The repo is chosen from the ones the team's runners serve, so a pick always
  matches one; a project's repo or a target that names a repo is used when nobody picks.
-->
<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import type { RunnerRow } from "~/utils/runner";
import { runnerFor } from "~/utils/runner";

const props = defineProps<{
  id: string;
  alone: boolean;
  /** Where it runs now: the pick, its project's repo, or its target. "" when none. */
  runsIn: string;
  /** Repos the team's runners served in the last day. */
  repos: string[];
  done: boolean;
}>();

const { api, json, signedIn } = useHub();
const queryClient = useQueryClient();
const runnersQ = useQuery({
  queryKey: ["runners"],
  queryFn: async () => (await api<{ runners: RunnerRow[] }>("/v1/runners"))?.runners ?? [],
  enabled: signedIn,
  refetchInterval: 60_000,
});
const runner = computed(() => runnerFor(runnersQ.data.value ?? [], props.runsIn));
const choices = computed(() => [
  ...new Set([...(props.runsIn ? [props.runsIn] : []), ...props.repos]),
]);

const saving = ref(false);
const problem = ref("");
async function save(body: { on: boolean; repo?: string }) {
  saving.value = true;
  problem.value = "";
  try {
    await api(`/v1/work/${props.id}/alone`, json("PUT", body));
    await queryClient.invalidateQueries({ queryKey: hubKeys.context(props.id) });
    await queryClient.invalidateQueries({ queryKey: hubKeys.board });
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

/** Why it will or won't be taken, in one sentence. */
const said = computed(() => {
  if (!props.runsIn) return "Pick the repo it runs in. Until then no runner can take it.";
  const r = runner.value;
  if (r)
    return `The runner on ${r.host}${r.mine ? "" : `, ${r.who}'s,`} will take it within a minute.`;
  return `No runner serves ${props.runsIn} right now. Start \`passalong work --watch\` in that repo, or in the folder that holds it.`;
});
</script>

<template>
  <div v-if="!done" class="flex flex-col gap-2 rounded-2 border border-line px-3 py-2.5 font-ui text-sm">
    <label class="flex items-start gap-2">
      <input
        type="checkbox"
        class="mt-0.5"
        :checked="alone"
        :disabled="saving"
        @change="save({ on: ($event.target as HTMLInputElement).checked })"
      />
      <span>
        Let an always-on agent take this on its own
        <span class="block text-xs text-muted">Only for work that needs no decision, secret or permission from a person.</span>
      </span>
    </label>
    <div v-if="alone" class="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6">
      <label for="runs-in" class="text-muted">Runs in</label>
      <select
        id="runs-in"
        class="min-w-0 max-w-full"
        :value="runsIn"
        :disabled="saving"
        @change="save({ on: true, repo: ($event.target as HTMLSelectElement).value })"
      >
        <option v-if="!runsIn" value="" disabled>Pick a repo</option>
        <option v-for="r in choices" :key="r" :value="r">{{ r }}</option>
      </select>
      <p class="m-0 basis-full text-xs" :class="runner ? 'text-muted' : 'text-warn'">
        {{ said }}
        <template v-if="!choices.length"> Repos appear here once a runner has started.</template>
      </p>
    </div>
    <p v-if="problem" role="alert" class="m-0 text-xs text-danger">{{ problem }}</p>
  </div>
</template>
