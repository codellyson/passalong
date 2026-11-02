<!--
  Setup on Needs you. Right after the last step, and while any step is left and the person has not
  put it away: the seven steps as a short register, each done one with an ink check and what it made
  where that is cheap to say, each left one a link back to it. "You're set up." only when nothing is
  left; otherwise "Finish setting up". Only for someone who runs a team or has none yet: an invited
  teammate has nothing to set up.
-->
<script setup lang="ts">
import { leftOf, NO_SETUP, type SetupState, type SetupStep, STEPS } from "~/utils/setup";

const { data, api, json, setMe, projectsQ } = useHub();
const route = useRoute();
const router = useRouter();

const me = computed(() => data.value.me);
const setup = computed<SetupState>(() => me.value?.setup ?? NO_SETUP);
const team = computed(() => me.value?.teams.find((t) => t.role === "owner") ?? null);
const eligible = computed(
  () => Boolean(me.value?.setup) && (!me.value?.teams.length || Boolean(team.value)),
);
const finished = computed(() => route.query.setup === "done");
const left = computed(() => leftOf(setup.value));
const show = computed(
  () => eligible.value && (finished.value || (left.value.length > 0 && !setup.value.dismissed)),
);

/** What a done step made, where it is cheap to say: the team's name, how many projects. */
const made = computed<Partial<Record<SetupStep, string>>>(() => {
  const n = (projectsQ.data.value?.projects ?? []).filter(
    (f) => !f.parent_id && (f.team_slug || "") === (team.value?.slug ?? ""),
  ).length;
  return {
    team: team.value?.name,
    projects: n ? `${n} project${n === 1 ? "" : "s"}` : undefined,
  };
});
const isDone = (id: SetupStep) => setup.value.done.includes(id);

const busy = ref(false);
async function putAway() {
  busy.value = true;
  try {
    const got = await api<{ setup: SetupState }>("/v1/me/setup", json("PUT", { dismissed: true }));
    if (got && me.value) setMe({ ...me.value, setup: got.setup });
    if (finished.value) {
      const { setup: _, ...rest } = route.query;
      await router.replace({ query: rest });
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section v-if="show" aria-labelledby="setup-h" class="settle mb-10 flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div class="min-w-0">
        <h2 id="setup-h" class="m-0 font-ui text-base font-medium tracking-normal text-fg">
          {{ left.length ? "Finish setting up" : "You're set up." }}
        </h2>
        <p class="m-0 mt-1 font-ui text-sm text-muted">
          <template v-if="left.length">
            <span class="tabular-nums">{{ left.length }}</span> {{ left.length === 1 ? "step" : "steps" }} left. Work that comes in lands here meanwhile.
          </template>
          <template v-else>Work that comes in lands here, oldest first.</template>
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <NuxtLink v-if="left.length" :to="`/hub/start?step=${left[0]!.id}`" class="btn sm">Continue setup</NuxtLink>
        <button class="btn sm" type="button" :disabled="busy" @click="putAway">
          {{ left.length ? "Dismiss" : "Done" }}
        </button>
      </div>
    </div>
    <!-- The seven steps, two columns from a wide container: done in ink, left as links. -->
    <ul class="m-0 grid list-none grid-cols-1 gap-x-8 p-0 sm:grid-cols-2">
      <li v-for="s in STEPS" :key="s.id" class="flex min-w-0 items-center gap-2 border-t border-line py-2 font-ui text-sm">
        <span class="flex w-4 shrink-0 justify-center" :class="isDone(s.id) ? 'text-fg' : 'text-muted'" aria-hidden="true">
          <AppIcon v-if="isDone(s.id)" name="check" />
          <span v-else class="size-1.5 rounded-full border border-current" />
        </span>
        <template v-if="isDone(s.id)">
          <span class="text-fg">{{ s.name }}</span>
          <span v-if="made[s.id]" class="min-w-0 truncate text-muted">· {{ made[s.id] }}</span>
          <span class="sr-only">, done</span>
        </template>
        <NuxtLink v-else :to="`/hub/start?step=${s.id}`" class="text-muted">{{ s.name }}<span class="sr-only">, not done</span></NuxtLink>
      </li>
    </ul>
  </section>
</template>
