<!--
  One project in setup's "What to know" step: how its README gets written.

  A project with a repo (`project.repo`) gets the sentence to paste into the person's own agent, which
  can read the code (Passalong never runs one). Without a repo, the person answers three short
  questions or pastes what they already have. What they type lives in `draft`, which the page owns:
  its Continue writes every project's README at once, and its Skip asks before dropping any. A README
  somebody already wrote is said to exist and left alone.
-->
<script setup lang="ts">
import type { ProjectDocument } from "~/types/project";
import { readmeAsk } from "~/utils/asks";
import { toneOf } from "~/utils/projects";
import type { KnowDraft } from "~/utils/setup";

const props = defineProps<{
  project: { id: string; title: string; description?: string; color: string; repo?: string };
  draft: KnowDraft;
}>();

const { api } = useHub();

const isReadme = (d: { name: string }) => /^readme(\.md)?$/i.test(d.name.trim());
const readme = ref<ProjectDocument | null>(null);
const loaded = ref(false);
const problem = ref("");

async function load() {
  problem.value = "";
  try {
    const got = await api<{ documents: ProjectDocument[] }>(`/v1/projects/${props.project.id}`);
    readme.value = got?.documents.find(isReadme) ?? null;
    props.draft.written = Boolean(readme.value);
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    loaded.value = true;
  }
}
onMounted(load);
// The page saved this draft: show the README it wrote.
watch(
  () => props.draft.written,
  (w) => {
    if (w && !readme.value) load();
  },
);

const prompt = computed(() =>
  readmeAsk({ id: props.project.id, title: props.project.title, repo: props.project.repo }),
);
function copyPrompt(el: EventTarget | null) {
  copy(prompt.value, el);
  props.draft.copied = true;
}

const uid = computed(() => `know-${props.project.id}`);
const field = "w-full resize-none [field-sizing:content]";
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
    <template v-else-if="project.repo">
      <p class="m-0 font-ui text-sm text-muted">
        Paste this into your agent (Claude Code, Codex, Cursor) in a session that can read
        <code class="font-code text-xs">{{ project.repo }}</code>. It writes the README, a page per area and a Log page here.
      </p>
      <div class="flex max-w-full items-stretch overflow-hidden rounded-2 border border-line-strong bg-field">
        <p class="m-0 min-w-0 flex-1 px-3 py-2 font-code text-xs leading-5 text-fg">{{ prompt }}</p>
        <button type="button" class="btn sm h-auto shrink-0 self-stretch rounded-none border-0 border-l border-line-strong" @click="copyPrompt($event.currentTarget)">
          <AppIcon name="copy" /><span data-label>Copy</span>
        </button>
      </div>
      <p v-if="readme" class="m-0 font-ui text-xs text-muted">
        It has a README already, version {{ readme.version }}.
        <NuxtLink :to="`/hub/projects/${project.id}?tab=documents&doc=${readme.id}`">Open it</NuxtLink>
      </p>
    </template>

    <p v-else-if="readme" class="m-0 flex flex-wrap items-baseline gap-x-2 font-ui text-sm">
      <AppIcon name="check" class="self-center text-fg" />
      <span class="font-medium text-fg">README written</span>
      <span class="text-muted">· version {{ readme.version }}</span>
      <NuxtLink :to="`/hub/projects/${project.id}?tab=documents&doc=${readme.id}`" class="text-sm">Open it</NuxtLink>
    </p>

    <!-- No repo and no README: the person's own words, written when they press Continue. -->
    <div v-else class="flex flex-col gap-4">
      <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="`How to write ${project.title}'s README`">
        <label class="chip-pick font-ui text-sm">
          <input v-model="draft.how" type="radio" :name="`${uid}-how`" value="questions">Answer three questions
        </label>
        <label class="chip-pick font-ui text-sm">
          <input v-model="draft.how" type="radio" :name="`${uid}-how`" value="paste">Paste what you have
        </label>
      </div>

      <template v-if="draft.how === 'questions'">
        <label class="flex flex-col gap-2 font-ui text-sm">
          <span class="font-medium text-fg">What is it?</span>
          <textarea v-model="draft.what" :class="field" class="min-h-[4.5rem]" :placeholder="project.description || 'The app our customers pay us through'" />
        </label>
        <label class="flex flex-col gap-2 font-ui text-sm">
          <span class="font-medium text-fg">Who uses it?</span>
          <textarea v-model="draft.who" :class="field" class="min-h-[4.5rem]" placeholder="Shop owners, mostly on their phones; our support team answers them" />
        </label>
        <label class="flex flex-col gap-2 font-ui text-sm">
          <span class="font-medium text-fg">Words you use</span>
          <span class="text-xs text-muted">One per line, with what it means, so a new person or agent says it your way.</span>
          <textarea v-model="draft.words" :class="field" class="min-h-[5.5rem]" placeholder="Plan: what a customer pays for each month" />
        </label>
      </template>
      <label v-else class="flex flex-col gap-2 font-ui text-sm">
        <span class="font-medium text-fg">What you already have</span>
        <span class="text-xs text-muted">A doc, a pitch, notes. Kept as you paste it; Markdown works.</span>
        <textarea v-model="draft.pasted" :class="field" class="min-h-[10rem]" />
      </label>
    </div>

    <div v-if="problem" role="alert" class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
      <p class="m-0 min-w-0 grow font-ui text-sm text-danger">{{ problem }}</p>
      <button class="btn outline danger sm" type="button" @click="load">Try again</button>
    </div>
  </section>
</template>
