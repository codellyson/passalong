<!--
  One document of a project: read it, edit it, see its earlier versions and put one back.

  Every save carries the version that was opened, and the server refuses a stale one (projects.ts),
  so a person's edit and an agent's cannot silently replace each other. Refused, the text stays in
  the editor and the page says how to get the newer version. An earlier version is shown read-only
  at its own address (`?doc=…&v=…`), which is where History links to.
-->
<script setup lang="ts">
import type { Project, ProjectDocument } from "~/types/project";
import { outline } from "~/utils/doc-outline";
import { type DocRef, renderProjectMarkdown } from "~/utils/project-markdown";
import { age, byLine, viaOf } from "~/utils/projects";
import { isReadme, README_SHOWN, readmeBudget } from "~/utils/readme-budget";

const props = defineProps<{
  /** The project the document is in. */
  project: string;
  /** The project's name, which a README's first heading usually repeats. */
  projectTitle?: string;
  space: string;
  doc: string;
  version?: number;
  startEditing?: boolean;
  /** The document's row from the project's list: who saved it last, which a single read lacks. */
  row?: ProjectDocument;
  /** The document as the page already holds it (the README comes with the project), so it is not read twice. */
  given?: ProjectDocument;
  /** The project's documents, so links between its pages open them. */
  docs?: DocRef[];
}>();
const emit = defineEmits<{ changed: []; gone: [message: string] }>();

const { api, json } = useHub();
const current = ref<ProjectDocument | null>(null);
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
/** Remounts the editor when its text is replaced from outside: a reload or a version put back. */
const editorKey = ref(0);

const base = computed(() => `/v1/projects/${props.project}/documents/${props.doc}`);
const raw = computed(() => (earlier.value ? earlier.value.body : current.value?.body || ""));
/** The README is the project's own page, under the project's name; any other is named above it. */
const readme = computed(() => Boolean(current.value && isReadme(current.value.name)));
/** What is read, without a first heading that only repeats a name the page already shows. */
const shown = computed(() => {
  const first = raw.value.match(/^\s*#\s+(.+)\n?/);
  const said = first?.[1]?.trim().toLowerCase();
  const names = [current.value?.name, props.projectTitle].map((n) => n?.trim().toLowerCase());
  return first && names.includes(said) ? raw.value.slice(first[0].length) : raw.value;
});
const outlined = computed(() => outline(renderProjectMarkdown(shown.value, props.docs)));
const { active, go } = useScrollSpy(() =>
  editing.value ? [] : outlined.value.items.map((i) => i.id),
);
/** What an agent taking work here is shown of this README: the draft while editing. */
const budget = computed(() =>
  current.value && isReadme(current.value.name)
    ? readmeBudget(editing.value ? draft.value : raw.value)
    : null,
);
const shownLimit = README_SHOWN.toLocaleString("en");
/** A link to another of the project's pages opens it here, without reloading the hub. */
function openDocLink(e: MouseEvent) {
  const href = (e.target as HTMLElement | null)?.closest("a")?.getAttribute("href") ?? "";
  if (!href.startsWith("?tab=documents&doc=") || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  navigateTo({ query: { tab: "documents", doc: new URLSearchParams(href.slice(1)).get("doc") } });
}
const docLink = (v?: number) => ({
  query: { tab: "documents", doc: props.doc, ...(v ? { v } : {}) },
});

async function load() {
  loading.value = true;
  problem.value = "";
  stale.value = false;
  try {
    const held = props.given?.id === props.doc && props.given.version === props.row?.version;
    const got = held
      ? { document: props.given }
      : await api<{ document: ProjectDocument }>(base.value);
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
watch(() => [props.doc, props.project, props.version], load, { immediate: true });

async function save() {
  if (!current.value) return;
  saving.value = true;
  problem.value = "";
  notice.value = "";
  stale.value = false;
  try {
    const got = await api<{ document: ProjectDocument }>(
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
/** The More menu, and whether it is showing the projects to move to rather than its items. */
const moreOpen = ref(false);
const moving = ref(false);
watch(moreOpen, (on) => {
  if (!on) moving.value = false;
});
const targets = ref<{ id: string; title: string; depth: number }[]>([]);
async function openMove() {
  moving.value = true;
  try {
    const got = await api<{ projects: Project[] }>("/v1/projects");
    const all = (got?.projects ?? []).filter((f) => f.team_id === props.space);
    const byId = new Map(all.map((f) => [f.id, f]));
    const path = (f: Project): string => {
      const parent = byId.get(f.parent_id);
      return parent ? `${path(parent)} / ${f.title}` : f.title;
    };
    targets.value = all
      .filter((f) => f.id !== props.project)
      .map((f) => ({ id: f.id, title: path(f), depth: 0 }))
      .sort((a, b) => a.title.localeCompare(b.title));
  } catch (err) {
    problem.value = (err as Error).message;
  }
}
async function move(to: { id: string; title: string }) {
  if (!current.value) return;
  moreOpen.value = false;
  try {
    await api(base.value, json("PATCH", { project: to.id }));
    emit("gone", `Moved ${current.value.name} to ${to.title}.`);
  } catch (err) {
    problem.value = (err as Error).message;
  }
}
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
  <article class="@container flex min-w-0 flex-col gap-4" aria-label="Document">
    <HubSkeleton v-if="loading && !current" variant="lines" :rows="6" label="Opening the document" />

    <div v-else-if="!current" role="alert" class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
      <div class="min-w-0 grow basis-64">
        <p class="m-0 font-ui text-sm font-semibold text-danger">This document didn't open</p>
        <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ problem }}</p>
      </div>
      <button class="btn outline danger sm" type="button" @click="load">Try again</button>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-line pb-3">
        <form v-if="renaming" class="flex min-w-0 flex-1 flex-wrap items-center gap-2" @submit.prevent="rename($event.target as HTMLFormElement)" @keydown.esc="renaming = false">
          <label class="sr-only" for="doc-name">Document name</label>
          <input id="doc-name" name="name" class="min-w-0 flex-1" maxlength="120" :value="current.name" required />
          <button class="btn primary sm" type="submit" :disabled="saving">Save name</button>
          <button class="btn sm" type="button" @click="renaming = false">Cancel</button>
        </form>
        <div v-else class="min-w-0">
          <!-- The README sits under the project's own name; every other page is named in the serif it is set in. -->
          <h2 v-if="!readme" class="m-0 mb-2 font-reading text-[1.75rem] leading-tight font-medium tracking-tight break-words">{{ current.name }}</h2>
          <p class="m-0 font-ui text-xs text-muted">
            <span v-if="readme" class="font-medium text-fg">README · </span>Version {{ current.version }}<template v-if="row?.editor"> by {{ byLine(row.editor, viaOf(row.client)) }}</template>
            · <span class="tabular-nums">{{ age(current.updated, now) }}</span>
            · <button class="linkish cursor-pointer border-0 bg-transparent p-0 font-ui text-xs" type="button" :aria-expanded="showVersions" @click="toggleVersions">Versions</button>
          </p>
        </div>
        <div v-if="!renaming && !editing && !earlier" class="flex gap-2">
          <button class="btn primary sm" type="button" @click="editing = true">Edit</button>
          <HubPopMenu v-model:open="moreOpen" v-slot="{ close }" :label="moving ? 'Move this document to' : 'More for this document'" menu-class="max-h-72 overflow-y-auto">
            <template v-if="moving">
              <p class="menu-note mt-0 mb-1">Move {{ current.name }} to</p>
              <button v-for="t in targets" :key="t.id" class="menu-item" type="button" role="menuitem" @click="move(t)">
                <span class="min-w-0 break-words">{{ t.title }}</span>
              </button>
              <p v-if="!targets.length" class="menu-note">No other project in this space yet.</p>
            </template>
            <template v-else>
              <button class="menu-item" type="button" role="menuitem" @click="close(); renaming = true">Rename</button>
              <button class="menu-item" type="button" role="menuitem" @click="openMove">Move to…</button>
              <button class="menu-item destructive" type="button" role="menuitem" @click="close(); confirmingDelete = true">Delete…</button>
            </template>
          </HubPopMenu>
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
        <h3 class="m-0 border-b border-line-strong pb-2 font-ui text-sm font-semibold tracking-normal">Every version is kept</h3>
        <ol class="m-0 list-none p-0">
          <li v-for="r in versions" :key="r.version" class="flex items-baseline gap-3 border-b border-line py-2 font-ui text-sm last:border-b-0">
            <NuxtLink :to="docLink(r.version)" class="grow text-fg no-underline hover:underline">Version {{ r.version }}<template v-if="r.version === current.version"> (current)</template></NuxtLink>
            <span class="text-xs text-muted tabular-nums">{{ age(r.saved_at, now) }}</span>
          </li>
        </ol>
      </section>

      <div v-if="earlier" class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2 border border-fg px-4 py-3">
        <p class="m-0 min-w-0 grow font-ui text-sm">
          <span class="font-medium">Version {{ earlier.version }}</span>, saved <span class="tabular-nums">{{ age(earlier.saved_at, now) }}</span> ago. The current one is version {{ current.version }}.
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
        <p v-if="budget" class="m-0 font-ui text-xs" :class="budget.cut ? 'text-warn' : 'text-muted'" aria-live="polite">
          <template v-if="budget.cut">
            Agents see the first {{ shownLimit }} characters of the README, and this one is
            {{ budget.length.toLocaleString("en") }}. They stop at "{{ budget.stopsAt }}", so put what
            they must know before that, and the rest on other pages.
          </template>
          <template v-else>Agents see all of this README ({{ budget.length.toLocaleString("en") }} of {{ shownLimit }} characters).</template>
        </p>
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
      <!-- The document, and above it how much of a README agents see. The note sits inside this
           branch: between the form and it, it split the v-if chain and hid the text of any README
           over the limit (2026-11-08). -->
      <template v-else-if="shown">
        <p v-if="budget?.cut" class="m-0 font-ui text-xs text-warn">
          Agents taking work here see only the first {{ shownLimit }} characters of this README, up to
          "{{ budget.stopsAt }}".
        </p>
        <div class="@4xl:grid @4xl:grid-cols-[minmax(0,40rem)_12rem] @4xl:gap-10">
          <!-- Sanitised by renderProjectMarkdown before it reaches v-html; outline() only adds ids. -->
          <div class="min-w-0 overflow-x-auto"><article class="prose project-doc" @click="openDocLink" v-html="outlined.html" /></div>
          <nav v-if="outlined.items.length > 1" class="hidden font-ui text-sm @4xl:sticky @4xl:top-6 @4xl:flex @4xl:flex-col @4xl:self-start" aria-label="On this page">
            <p class="m-0 mb-2 text-xs font-semibold tracking-widest text-muted uppercase">On this page</p>
            <a
              v-for="t in outlined.items"
              :key="t.id"
              :href="`#${t.id}`"
              class="border-l-2 py-1 pr-1 leading-snug no-underline transition-colors"
              :class="[t.level === 3 ? 'pl-6' : 'pl-3', active === t.id ? 'border-accent font-medium text-fg' : 'border-line text-muted hover:text-fg']"
              :aria-current="active === t.id ? 'location' : undefined"
              @click="go(t.id, $event)"
              >{{ t.label }}</a
            >
          </nav>
        </div>
      </template>
      <p v-else class="m-0 font-ui text-sm text-muted">Nothing written yet. Edit to start.</p>
    </template>
  </article>
</template>

<style scoped>
/* Set by article.prose in styles.css, as the share pages set it: one look for a document wherever it is read. */
.project-doc :deep(h2),
.project-doc :deep(h3) {
  scroll-margin-top: var(--s-6);
}
.project-doc :deep(.contains-task-list) {
  padding-left: 0;
}
</style>
