<!--
  Which project a piece of work is in, and the choice to move it to another in the same space.
  Opened from "Move to project…" on the work page. Choosing calls POST /v1/projects/:id/work with
  `move: true`, which takes it out of every other project it was in: one place, so its id, thread
  and history go with it. Only the projects of the work's own space are offered, since a team's work
  cannot sit in a private project or another team's.
-->
<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import { toneOf } from "~/utils/projects";

const props = defineProps<{ id: string; team: string; current: string[] }>();
const emit = defineEmits<{ done: [moved?: boolean] }>();
const { api, json, projectsQ } = useHub();
const queryClient = useQueryClient();

const choices = computed(() =>
  (projectsQ.data.value?.projects ?? [])
    .filter((p) => (p.team_slug || "") === props.team && !p.archived)
    .sort((a, b) => a.title.localeCompare(b.title)),
);

const busy = ref(false);
const problem = ref("");
async function pick(to: string) {
  if (busy.value) return;
  if (props.current.length === 1 && props.current[0] === to) return emit("done");
  busy.value = true;
  problem.value = "";
  try {
    await api(
      `/v1/projects/${encodeURIComponent(to)}/work`,
      json("POST", { work: props.id, move: true }),
    );
    await queryClient.invalidateQueries({ queryKey: hubKeys.projects });
    emit("done", true);
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-0.5" role="group" aria-label="Move to project">
    <p class="menu-note mt-0 mb-1">Move it to:</p>
    <p v-if="projectsQ.isPending.value" class="menu-note">Loading projects…</p>
    <p v-else-if="!choices.length" class="menu-note">There are no projects here to move it to.</p>
    <button
      v-for="p in choices"
      :key="p.id"
      type="button"
      class="menu-item"
      :aria-current="current.includes(p.id) ? 'true' : undefined"
      :disabled="busy"
      @click="pick(p.id)"
    >
      <AppIcon v-if="current.includes(p.id)" name="check" class="shrink-0 text-ok" />
      <span class="project-mark h-3.5 w-[3px] shrink-0 rounded-[1px]" :data-tone="toneOf(p)" aria-hidden="true" />
      <span class="truncate" :class="current.includes(p.id) ? 'font-semibold' : ''">{{ p.title }}</span>
    </button>
    <p v-if="problem" class="m-0 text-xs text-danger" role="alert">{{ problem }}</p>
    <p class="menu-note">It leaves the project it is in now; its thread and history go with it.</p>
  </div>
</template>
