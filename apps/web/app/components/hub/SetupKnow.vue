<!--
  One project in setup's "What to know" step: how its README gets written.

  A project with a repo gets the sentence to paste into the person's own agent, which can read the
  code (Passalong never runs one). Without a repo, the person answers three short questions or
  pastes what they already have, and the README is written from their words as they typed them.
  A README somebody already wrote is said to exist and left alone.
-->
<script setup lang="ts">
import type { FolderDocument } from "~/types/folder";
import { repoReadmeAsk } from "~/utils/asks";
import { toneOf } from "~/utils/projects";
import { readmeFromAnswers, repoOf } from "~/utils/setup";

const props = defineProps<{
  project: { id: string; title: string; description?: string; color: string };
}>();
const emit = defineEmits<{ handled: [] }>();

const { api, json } = useHub();

const isReadme = (d: { name: string }) => /^readme(\.md)?$/i.test(d.name.trim());
const readme = ref<FolderDocument | null>(null);
const loaded = ref(false);
const problem = ref("");

async function load() {
  problem.value = "";
  try {
    const got = await api<{ documents: FolderDocument[] }>(`/v1/folders/${props.project.id}`);
    const row = got?.documents.find(isReadme);
    readme.value = row
      ? ((
          await api<{ document: FolderDocument }>(
            `/v1/folders/${props.project.id}/documents/${row.id}`,
          )
        )?.document ?? null)
      : null;
    if (readme.value && !repo.value) emit("handled");
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    loaded.value = true;
  }
}
onMounted(load);

const repo = computed(() => repoOf(readme.value?.body || ""));
const prompt = computed(() =>
  repoReadmeAsk({ id: props.project.id, title: props.project.title, repo: repo.value }),
);
function copyPrompt(el: EventTarget | null) {
  copy(prompt.value, el);
  emit("handled");
}

const how = ref<"questions" | "paste">("questions");
const what = ref(props.project.description || "");
const who = ref("");
const words = ref("");
const pasted = ref("");
const saving = ref(false);
const body = computed(() =>
  how.value === "paste"
    ? pasted.value.trim()
      ? `${pasted.value.trim()}\n`
      : ""
    : what.value.trim() || who.value.trim() || words.value.trim()
      ? readmeFromAnswers(props.project.title, {
          what: what.value,
          who: who.value,
          words: words.value,
        })
      : "",
);

async function save() {
  if (!body.value || saving.value) return;
  saving.value = true;
  problem.value = "";
  try {
    await api(
      `/v1/folders/${props.project.id}/documents`,
      json("POST", { name: "README", body: body.value }),
    );
    await load();
    emit("handled");
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

const uid = computed(() => `know-${props.project.id}`);
</script>

<template>
  <section class="flex flex-col gap-3 border-t border-line py-5 first:border-t-0 first:pt-0" :aria-labelledby="`${uid}-h`">
    <div class="flex min-w-0 items-baseline gap-2">
      <span class="project-mark h-3.5 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf(project)" aria-hidden="true" />
      <h3 :id="`${uid}-h`" class="m-0 font-ui text-sm font-semibold tracking-normal text-fg">{{ project.title }}</h3>
      <span v-if="project.description" class="min-w-0 truncate font-ui text-sm text-muted">{{ project.description }}</span>
    </div>

    <HubSkeleton v-if="!loaded" variant="lines" :rows="2" :label="`Loading ${project.title}`" />

    <!-- A repo: the person's own agent reads it and writes the pages. -->
    <template v-else-if="repo">
      <p class="m-0 max-w-[40rem] font-ui text-sm text-muted">
        Paste this into your agent (Claude Code, Codex, Cursor) in a session that can read
        <code class="font-code text-xs">{{ repo }}</code>. It writes the README, a page per area and a Log page here.
      </p>
      <div class="flex max-w-full items-stretch overflow-hidden rounded-2 border border-line-strong bg-field">
        <p class="m-0 min-w-0 flex-1 px-3 py-2 font-code text-xs leading-5 text-fg">{{ prompt }}</p>
        <button type="button" class="btn sm h-auto shrink-0 self-stretch rounded-none border-0 border-l border-line-strong" @click="copyPrompt($event.currentTarget)">
          <AppIcon name="copy" /><span data-label>Copy</span>
        </button>
      </div>
    </template>

    <p v-else-if="readme" class="m-0 flex flex-wrap items-baseline gap-x-2 font-ui text-sm">
      <AppIcon name="check" class="self-center text-fg" />
      <span class="font-medium text-fg">README written</span>
      <span class="text-muted">· version {{ readme.version }}</span>
      <NuxtLink :to="`/hub/projects/${project.id}?tab=documents&doc=${readme.id}`" class="text-sm">Open it</NuxtLink>
    </p>

    <!-- No repo and no README: the person's own words. -->
    <form v-else class="flex max-w-[40rem] flex-col gap-3" @submit.prevent="save">
      <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="`How to write ${project.title}'s README`">
        <label class="chip-pick font-ui text-sm">
          <input v-model="how" type="radio" :name="`${uid}-how`" value="questions">Answer three questions
        </label>
        <label class="chip-pick font-ui text-sm">
          <input v-model="how" type="radio" :name="`${uid}-how`" value="paste">Paste what you have
        </label>
      </div>

      <template v-if="how === 'questions'">
        <label class="flex flex-col gap-2 font-ui text-sm">
          <span class="font-medium text-fg">What is it?</span>
          <textarea v-model="what" rows="2" class="w-full" placeholder="The app our customers pay us through" />
        </label>
        <label class="flex flex-col gap-2 font-ui text-sm">
          <span class="font-medium text-fg">Who uses it?</span>
          <textarea v-model="who" rows="2" class="w-full" placeholder="Shop owners, mostly on their phones; our support team answers them" />
        </label>
        <label class="flex flex-col gap-2 font-ui text-sm">
          <span class="font-medium text-fg">Words you use</span>
          <span class="text-xs text-muted">One per line, with what it means, so a new person or agent says it your way.</span>
          <textarea v-model="words" rows="3" class="w-full" placeholder="Plan: what a customer pays for each month" />
        </label>
      </template>
      <label v-else class="flex flex-col gap-2 font-ui text-sm">
        <span class="font-medium text-fg">What you already have</span>
        <span class="text-xs text-muted">A doc, a pitch, notes. Kept as you paste it; Markdown works.</span>
        <textarea v-model="pasted" rows="8" class="w-full" />
      </label>

      <div>
        <button class="btn" type="submit" :disabled="saving || !body">
          {{ saving ? "Writing…" : "Write the README" }}
        </button>
      </div>
    </form>

    <div v-if="problem" role="alert" class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
      <p class="m-0 min-w-0 grow font-ui text-sm text-danger">{{ problem }}</p>
      <button class="btn outline danger sm" type="button" @click="load">Try again</button>
    </div>
  </section>
</template>
