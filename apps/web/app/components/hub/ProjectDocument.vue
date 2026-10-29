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
import { age, byLine, viaOf } from "~/utils/projects";

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
/** What is read, without a first heading that only repeats the document's name above it. */
const shown = computed(() => {
  const body = earlier.value ? earlier.value.body : current.value?.body || "";
  const first = body.match(/^\s*#\s+(.+)\n?/);
  return first && first[1]?.trim().toLowerCase() === current.value?.name.trim().toLowerCase()
    ? body.slice(first[0].length)
    : body;
});
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
    editorKey.value++;
    editing.value = Boolean(props.startEditing) && !earlier.value;
    // Opened is looked at: its change mark clears, on the server, for this account only.
    if (current.value && props.row?.changed) {
      await api(`${base.value}/seen`, { method: "PUT" }).catch(() => null);
      emit("changed");
    }
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

/**
 * The newer version, after a refused save. The refusal itself asks, in place: load it (what was
 * written here is replaced) or keep writing, and copy it out first.
 */
async function reopen() {
  await load();
  editing.value = true;
}
function keepWriting() {
  problem.value = "";
  stale.value = false;
}
/** Remounts the editor when its text is replaced from outside: a reload or a version put back. */
const editorKey = ref(0);

/** An earlier version into the editor, to be saved as the newest. */
function putBack() {
  if (!earlier.value) return;
  draft.value = earlier.value.body;
  editorKey.value++;
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

/** Delete asks in place, saying what goes. */
const confirmingDelete = ref(false);
async function remove() {
  if (!current.value) return;
  try {
    await api(base.value, { method: "DELETE" });
    emit("gone", `Deleted ${current.value.name}.`);
  } catch (err) {
    problem.value = (err as Error).message;
  }
}

/** Cancel with edits asks in place before throwing them away. */
const confirmingDiscard = ref(false);
function cancel() {
  if (draft.value !== current.value?.body && !confirmingDiscard.value) {
    confirmingDiscard.value = true;
    return;
  }
  confirmingDiscard.value = false;
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
          <h2 class="m-0 text-h3 font-medium tracking-tight">{{ current.name }}</h2>
          <p class="m-0 mt-1 font-ui text-xs text-muted">
            Version {{ current.version }}<template v-if="row?.editor"> by {{ byLine(row.editor, viaOf(row.client)) }}</template>
            · <span class="tabular-nums">{{ age(current.updated, now) }}</span>
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
          <button class="btn sm outline danger" type="button" :aria-expanded="confirmingDelete" @click="confirmingDelete = true">Delete…</button>
        </div>
      </div>
      <div v-if="confirmingDelete" class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line pb-3" role="alert">
        <p class="m-0 min-w-0 grow font-ui text-sm">Delete {{ current.name }} and all {{ current.version }} of its versions? This cannot be undone.</p>
        <button class="btn sm outline danger" type="button" @click="remove">Delete</button>
        <button class="btn sm" type="button" @click="confirmingDelete = false">Keep it</button>
      </div>

      <p v-if="notice" role="status" class="m-0 font-ui text-sm">{{ notice }}</p>
      <div v-if="problem" role="alert" class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
        <p class="m-0 min-w-0 grow font-ui text-sm text-danger">
          <template v-if="stale">Someone saved a newer version while you were writing. Load it? What you wrote here will be replaced, so copy anything you want to keep first.</template>
          <template v-else>{{ problem }}</template>
        </p>
        <template v-if="stale">
          <button class="btn outline danger sm" type="button" @click="reopen">Load the newer version</button>
          <button class="btn sm" type="button" @click="keepWriting">Keep writing</button>
        </template>
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
          <span class="font-medium">Version {{ earlier.version }}</span>, saved <span class="tabular-nums">{{ age(earlier.saved_at, now) }}</span> before now. The current one is version {{ current.version }}.
        </p>
        <button class="btn primary sm" type="button" @click="putBack">Put this version back</button>
        <NuxtLink :to="docLink()" class="btn sm">See the current one</NuxtLink>
      </div>

      <form v-if="editing" class="flex flex-col gap-3" @submit.prevent="save">
        <!-- The editor exists only in the browser; the server draws a field of its size. -->
        <ClientOnly>
          <HubDocEditor :key="editorKey" :markdown="draft" :label="current.name" @change="draft = $event" />
          <template #fallback><div class="writer-shell min-h-[30rem]" /></template>
        </ClientOnly>
        <div v-if="confirmingDiscard" class="flex flex-wrap items-center gap-x-3 gap-y-2" role="alert">
          <p class="m-0 min-w-0 grow font-ui text-sm">Discard your edits? What you wrote since opening it is lost.</p>
          <button class="btn sm outline danger" type="button" @click="cancel">Discard</button>
          <button class="btn sm" type="button" @click="confirmingDiscard = false">Keep writing</button>
        </div>
        <div v-else class="flex flex-wrap gap-2">
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
/* Below the page's own headings, in order: the same scale as the README panel. */
.project-doc :deep(h1) {
  margin: 0 0 var(--s-3);
  font: 500 1.125rem / 1.4 var(--font-sans);
  letter-spacing: -0.015em;
}
.project-doc :deep(h2) {
  margin: var(--s-5) 0 var(--s-2);
  font: 550 1rem / 1.4 var(--font-sans);
  letter-spacing: -0.01em;
}
.project-doc :deep(h3) {
  margin: var(--s-4) 0 var(--s-2);
  font: 550 0.875rem / 1.4 var(--font-sans);
  letter-spacing: 0;
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
