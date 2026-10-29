<!--
  One document of a project: read it, edit it, see its earlier versions and put one back.

  Every save carries the version that was opened, and the server refuses a stale one (folders.ts),
  so a person's edit and an agent's cannot silently replace each other. Refused, the text stays in
  the editor and the page says how to get the newer version. An earlier version is shown read-only
  at its own address (`?doc=…&v=…`), which is where History links to.
-->
<script setup lang="ts">
import type { Folder, FolderDocument } from "~/types/folder";
import { renderFolderMarkdown } from "~/utils/folder-markdown";
import { age, viaOf } from "~/utils/projects";

const props = defineProps<{
  /** The project the document is in. */
  folder: string;
  space: string;
  doc: string;
  version?: number;
  startEditing?: boolean;
  /** The document's row from the project's list: who saved it last, which a single read lacks. */
  row?: FolderDocument;
}>();
const emit = defineEmits<{ changed: []; gone: [message: string] }>();

const { api, json } = useHub();
const current = ref<FolderDocument | null>(null);
const earlier = ref<{ version: number; body: string; saved_at: string } | null>(null);
const draft = ref("");
const editing = ref(false);
const saving = ref(false);
const stale = ref(false);
const problem = ref("");
const notice = ref("");
const loading = ref(true);
const renaming = ref(false);
const showVersions = ref(false);
const versions = ref<{ version: number; saved_at: string }[]>([]);
const now = ref(Date.now());

const base = computed(() => `/v1/folders/${props.folder}/documents/${props.doc}`);
const shown = computed(() => (earlier.value ? earlier.value.body : current.value?.body || ""));
const rendered = computed(() => renderFolderMarkdown(shown.value));
const docLink = (v?: number) => ({
  query: { tab: "documents", doc: props.doc, ...(v ? { v } : {}) },
});

async function load() {
  loading.value = true;
  problem.value = "";
  stale.value = false;
  try {
    const got = await api<{ document: FolderDocument }>(base.value);
    current.value = got?.document ?? null;
    earlier.value = null;
    if (props.version && current.value && props.version !== current.value.version) {
      const r = await api<{ revision: { version: number; body: string; saved_at: string } }>(
        `${base.value}/revisions/${props.version}`,
      );
      earlier.value = r?.revision ?? null;
    }
    draft.value = current.value?.body || "";
    editing.value = Boolean(props.startEditing) && !earlier.value;
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}
watch(() => [props.doc, props.folder, props.version], load, { immediate: true });

async function save() {
  if (!current.value) return;
  saving.value = true;
  problem.value = "";
  notice.value = "";
  stale.value = false;
  try {
    const got = await api<{ document: FolderDocument }>(
      base.value,
      json("PUT", { body: draft.value, version: current.value.version }),
    );
    if (got?.document) current.value = got.document;
    editing.value = false;
    notice.value = `Saved as version ${current.value.version}.`;
    emit("changed");
    if (props.version) await navigateTo(docLink());
  } catch (err) {
    problem.value = (err as Error).message;
    stale.value = (err as { status?: number }).status === 409;
  } finally {
    saving.value = false;
  }
}

/** The newer version, after a refused save: the text written here is lost unless copied first. */
async function reopen() {
  if (
    draft.value !== current.value?.body &&
    !confirm("Load the newer version? What you wrote here will be replaced.")
  )
    return;
  await load();
  editing.value = true;
}

/** An earlier version into the editor, to be saved as the newest. */
function putBack() {
  if (!earlier.value) return;
  draft.value = earlier.value.body;
  earlier.value = null;
  editing.value = true;
  notice.value = `Version ${props.version} is in the editor. Save it to make it the current version.`;
}

async function toggleVersions() {
  showVersions.value = !showVersions.value;
  if (!showVersions.value) return;
  try {
    const got = await api<{ revisions: { version: number; saved_at: string }[] }>(
      `${base.value}/revisions`,
    );
    versions.value = got?.revisions ?? [];
  } catch (err) {
    problem.value = (err as Error).message;
  }
}

async function rename(form: HTMLFormElement) {
  const name = field(form, "name").trim();
  if (!name || !current.value) return;
  saving.value = true;
  problem.value = "";
  try {
    await api(base.value, json("PATCH", { name }));
    current.value = { ...current.value, name };
    renaming.value = false;
    emit("changed");
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    saving.value = false;
  }
}

// Moving: only within the project's own space, the rule the route enforces.
const moveOpen = ref(false);
const moveMenu = ref<HTMLElement | null>(null);
const targets = ref<{ id: string; title: string; depth: number }[]>([]);
async function openMove() {
  moveOpen.value = !moveOpen.value;
  if (!moveOpen.value) return;
  try {
    const got = await api<{ folders: Folder[] }>("/v1/folders");
    const all = (got?.folders ?? []).filter((f) => f.team_id === props.space);
    const byId = new Map(all.map((f) => [f.id, f]));
    const path = (f: Folder): string => {
      const parent = byId.get(f.parent_id);
      return parent ? `${path(parent)} / ${f.title}` : f.title;
    };
    targets.value = all
      .filter((f) => f.id !== props.folder)
      .map((f) => ({ id: f.id, title: path(f), depth: 0 }))
      .sort((a, b) => a.title.localeCompare(b.title));
  } catch (err) {
    problem.value = (err as Error).message;
  }
}
async function move(to: { id: string; title: string }) {
  if (!current.value) return;
  moveOpen.value = false;
  try {
    await api(base.value, json("PATCH", { folder: to.id }));
    emit("gone", `${current.value.name} moved to ${to.title}.`);
  } catch (err) {
    problem.value = (err as Error).message;
  }
}
function onDocClick(e: MouseEvent) {
  if (moveOpen.value && !moveMenu.value?.contains(e.target as Node)) moveOpen.value = false;
}
onMounted(() => document.addEventListener("click", onDocClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocClick));

async function remove() {
  if (
    !current.value ||
    !confirm(`Delete ${current.value.name} and every version of it? This cannot be undone.`)
  )
    return;
  try {
    await api(base.value, { method: "DELETE" });
    emit("gone", `Deleted ${current.value.name}.`);
  } catch (err) {
    problem.value = (err as Error).message;
  }
}

function cancel() {
  if (draft.value !== current.value?.body && !confirm("Discard your edits?")) return;
  draft.value = current.value?.body || "";
  editing.value = false;
  stale.value = false;
  problem.value = "";
}
</script>

<template>
  <article class="flex min-w-0 flex-col gap-4" aria-label="Document">
    <NuxtLink :to="{ query: { tab: 'documents' } }" class="self-start font-ui text-sm text-muted no-underline hover:text-fg">← All documents</NuxtLink>

    <HubSkeleton v-if="loading && !current" variant="lines" :rows="6" label="Opening the document" />

    <div v-else-if="!current" role="alert" class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
      <div class="min-w-0 grow basis-64">
        <p class="m-0 font-ui text-sm font-semibold text-danger">This document didn't open</p>
        <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ problem }}</p>
      </div>
      <button class="btn outline danger sm" type="button" @click="load">Try again</button>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-fg pb-3">
        <form v-if="renaming" class="flex min-w-0 flex-1 flex-wrap items-center gap-2" @submit.prevent="rename($event.target as HTMLFormElement)" @keydown.esc="renaming = false">
          <label class="sr-only" for="doc-name">Document name</label>
          <input id="doc-name" name="name" class="min-w-0 flex-1" maxlength="120" :value="current.name" required />
          <button class="btn primary sm" type="submit" :disabled="saving">Save name</button>
          <button class="btn sm" type="button" @click="renaming = false">Cancel</button>
        </form>
        <div v-else class="min-w-0">
          <h2 class="m-0 text-h2 font-medium tracking-tight">{{ current.name }}</h2>
          <p class="m-0 mt-1 font-ui text-xs text-muted tabular-nums">
            Version {{ current.version }}
            <template v-if="row?.editor"> · saved by {{ row.editor }}<template v-if="viaOf(row.client)"> ({{ viaOf(row.client) }})</template></template>
            · {{ age(current.updated, now) }} ago
          </p>
        </div>
        <div v-if="!renaming && !editing && !earlier" class="flex flex-wrap gap-2">
          <button class="btn primary sm" type="button" @click="editing = true">Edit</button>
          <button class="btn sm" type="button" :aria-expanded="showVersions" @click="toggleVersions">Versions</button>
          <button class="btn sm" type="button" @click="renaming = true">Rename</button>
          <div ref="moveMenu" class="relative" @keydown.esc="moveOpen = false">
            <button class="btn sm" type="button" aria-haspopup="menu" :aria-expanded="moveOpen" @click="openMove">Move to…</button>
            <div v-if="moveOpen" class="menu right-0 max-h-72 overflow-y-auto" role="menu" aria-label="Move this document to">
              <button v-for="t in targets" :key="t.id" class="menu-item" type="button" role="menuitem" @click="move(t)">
                <span class="min-w-0 break-words">{{ t.title }}</span>
              </button>
              <p v-if="!targets.length" class="menu-note">No other project in this space yet.</p>
            </div>
          </div>
          <button class="btn sm outline danger" type="button" @click="remove">Delete</button>
        </div>
      </div>

      <p v-if="notice" role="status" class="m-0 font-ui text-sm">{{ notice }}</p>
      <div v-if="problem" role="alert" class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
        <p class="m-0 min-w-0 grow font-ui text-sm text-danger">{{ problem }}</p>
        <button v-if="stale" class="btn outline danger sm" type="button" @click="reopen">Load the newer version</button>
      </div>

      <section v-if="showVersions && !editing" aria-label="Versions" class="rounded-3 border border-line bg-raised px-4 pt-3 pb-1">
        <h3 class="m-0 border-b border-fg pb-2 font-ui text-sm font-semibold tracking-normal">Every version is kept</h3>
        <ol class="m-0 list-none p-0">
          <li v-for="r in versions" :key="r.version" class="flex items-baseline gap-3 border-b border-line py-2 font-ui text-sm last:border-b-0">
            <NuxtLink :to="docLink(r.version)" class="grow text-fg no-underline hover:underline">Version {{ r.version }}<template v-if="r.version === current.version"> (current)</template></NuxtLink>
            <span class="text-xs text-muted tabular-nums">{{ age(r.saved_at, now) }}</span>
          </li>
        </ol>
      </section>

      <div v-if="earlier" class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2 border border-fg px-4 py-3">
        <p class="m-0 min-w-0 grow font-ui text-sm">
          <span class="font-medium">Version {{ earlier.version }}</span>, saved {{ age(earlier.saved_at, now) }} ago. The current one is version {{ current.version }}.
        </p>
        <button class="btn primary sm" type="button" @click="putBack">Put this version back</button>
        <NuxtLink :to="docLink()" class="btn sm">See the current one</NuxtLink>
      </div>

      <form v-if="editing" class="flex flex-col gap-3" @submit.prevent="save">
        <label class="sr-only" for="doc-body">Document text</label>
        <textarea id="doc-body" v-model="draft" class="min-h-[28rem] w-full font-code text-sm" spellcheck="true" />
        <div class="flex flex-wrap gap-2">
          <button class="btn primary" type="submit" :disabled="saving">{{ saving ? "Saving…" : "Save version" }}</button>
          <button class="btn" type="button" @click="cancel">Cancel</button>
        </div>
      </form>
      <!-- Sanitised by renderFolderMarkdown before it reaches v-html. -->
      <div v-else-if="shown" class="overflow-x-auto"><div class="prose project-doc" v-html="rendered" /></div>
      <p v-else class="m-0 font-ui text-sm text-muted">Nothing written yet. Edit to start.</p>
    </template>
  </article>
</template>

<style scoped>
.project-doc {
  max-width: 46rem;
  font-family: var(--font-sans);
  font-size: 0.9375rem;
  line-height: 1.65;
}
.project-doc :deep(h1) {
  margin: 0 0 var(--s-4);
  font: 500 1.5rem / 1.3 var(--font-sans);
  letter-spacing: -0.025em;
}
.project-doc :deep(table) {
  border-collapse: collapse;
  min-width: 32rem;
  width: 100%;
}
.project-doc :deep(th),
.project-doc :deep(td) {
  padding: var(--s-2) var(--s-3);
  border-bottom: 1px solid var(--line);
  text-align: left;
}
.project-doc :deep(thead th) {
  border-bottom-color: var(--fg);
}
.project-doc :deep(.contains-task-list) {
  padding-left: 0;
  list-style: none;
}
</style>
