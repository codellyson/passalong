<!--
  On Needs you: for each project Passalong made for a new repo (claims.fileWork), the one question
  it asks: is this repo part of a product you already have? Joining moves the repo, its work and its
  documents into that product, so its agents read one README; "It's its own" keeps it. Unanswered,
  it stays its own project and nothing waits on it. Asked once (projects.ts, /join).
-->
<script setup lang="ts">
type Question = {
  id: string;
  title: string;
  repo: string;
  team_name: string;
  into: { id: string; title: string }[];
};

const { api, json, projectsQ, signedIn } = useHub();
const questions = ref<Question[]>([]);
const chosen = reactive<Record<string, string>>({});
const busy = ref("");
const problem = ref("");

async function load() {
  const got = await api<{ questions: Question[] }>("/v1/projects/questions").catch(() => null);
  questions.value = got?.questions ?? [];
  for (const q of questions.value) chosen[q.id] ??= q.into[0]?.id ?? "";
}
watch(signedIn, (on) => on && load(), { immediate: true });

async function answer(q: Question, into: string) {
  busy.value = q.id;
  problem.value = "";
  try {
    await api(`/v1/projects/${q.id}/join`, json("POST", { into }));
    questions.value = questions.value.filter((x) => x.id !== q.id);
    projectsQ.refetch();
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <section v-if="questions.length" aria-labelledby="repos-h" class="settle mb-8 flex flex-col gap-3">
    <h2 id="repos-h" class="m-0 font-ui text-base font-medium tracking-normal text-fg">
      {{ questions.length === 1 ? "A new repo" : "New repos" }}
    </h2>
    <div
      v-for="q in questions"
      :key="q.id"
      class="flex flex-col gap-3 rounded-3 border border-line bg-raised px-4 py-3"
    >
      <p class="m-0 font-ui text-sm">
        Work from <span class="font-code">{{ q.repo }}</span> went into a new project,
        <NuxtLink :to="`/hub/projects/${q.id}`">{{ q.title }}</NuxtLink>. Is it part of a product
        you already have? Its agents would then read that product's README.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <label class="sr-only" :for="`into-${q.id}`">Product</label>
        <select :id="`into-${q.id}`" v-model="chosen[q.id]" class="min-w-0 basis-56 grow">
          <option v-for="p in q.into" :key="p.id" :value="p.id">{{ p.title }}</option>
        </select>
        <button class="btn primary sm" type="button" :disabled="busy === q.id || !chosen[q.id]" @click="answer(q, chosen[q.id] || '')">
          Join it
        </button>
        <button class="btn sm" type="button" :disabled="busy === q.id" @click="answer(q, '')">It's its own</button>
      </div>
    </div>
    <p v-if="problem" role="alert" class="m-0 font-ui text-sm text-danger">{{ problem }}</p>
  </section>
</template>
