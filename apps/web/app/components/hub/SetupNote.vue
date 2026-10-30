<!--
  Setup on Needs you: "You're set up." once, right after the last step, naming what is ready and
  what is left; then, while any step is left and the person has not put it away, a quiet "Finish
  setting up" line with the way back to the first step left. Only for someone who runs a team or
  has none yet: an invited teammate has nothing to set up.
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

/** What is ready, in concrete words where they are cheap: the team's name, how many projects. */
const ready = computed(() => {
  const projects = (projectsQ.data.value?.folders ?? []).filter(
    (f) => !f.parent_id && (f.team_slug || "") === (team.value?.slug ?? ""),
  ).length;
  const words: Record<SetupStep, string> = {
    team: team.value?.name ?? "your team",
    people: "invites",
    groups: "groups",
    projects: projects ? `${projects} project${projects === 1 ? "" : "s"}` : "projects",
    know: "what to know",
    inbox: "your addresses",
    agents: "an agent connected",
  };
  return STEPS.filter((s) => setup.value.done.includes(s.id)).map((s) => words[s.id]);
});
const list = (xs: string[]) =>
  xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

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
  <section
    v-if="show"
    aria-labelledby="setup-h"
    class="settle mb-8 flex flex-wrap items-center gap-x-6 gap-y-3"
  >
    <div class="min-w-0 grow basis-80">
      <h2 id="setup-h" class="m-0 font-ui text-base font-medium tracking-normal text-fg">
        {{ finished ? "You're set up." : "Finish setting up" }}
      </h2>
      <p class="m-0 mt-1 font-ui text-sm text-muted">
        <template v-if="ready.length">Ready: <span class="text-fg">{{ list(ready) }}</span>. </template>
        <template v-if="left.length">
          Left:
          <template v-for="(s, i) in left" :key="s.id">
            <NuxtLink :to="`/hub/start?step=${s.id}`">{{ s.left }}</NuxtLink><template v-if="i < left.length - 2">, </template><template v-else-if="i === left.length - 2"> and </template>
          </template>.
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
  </section>
</template>
