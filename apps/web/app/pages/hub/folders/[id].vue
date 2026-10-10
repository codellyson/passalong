<script setup lang="ts">
import type { Folder, FolderAsset, FolderDocument, FolderGuide } from "~/types/folder";
import { renderFolderMarkdown } from "~/utils/folder-markdown";

usePage({
  title: "Folder · Passalong",
  description: "Documents, assets and guides for one project.",
  noindex: true,
});

const route = useRoute();
const { api, token, signedIn, data } = useHub();
const id = computed(() => String(route.params.id || ""));
const loadedId = ref("");
const folder = ref<Folder | null>(null);
const documents = ref<FolderDocument[]>([]);
const assets = ref<FolderAsset[]>([]);
const guides = ref<FolderGuide[]>([]);
const children = ref<Folder[]>([]);
const hasDocuments = computed(() => documents.value.length > 0);
const breadcrumbs = ref<{ id: string; title: string; color: string }[]>([]);
const displayColor = computed(
  () => [...breadcrumbs.value].reverse().find((crumb) => crumb.color)?.color || "",
);
const current = ref<FolderDocument | null>(null);
const draft = ref("");
const editing = ref(false);
const loading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const trouble = ref("");
const notice = ref("");
const newName = ref("");
const newSubfolderName = ref("");
const addingDocument = ref(false);
const addingSubfolder = ref(false);
const newDocumentInput = ref<HTMLInputElement | null>(null);
const newSubfolderInput = ref<HTMLInputElement | null>(null);
const guideId = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const revisions = ref<{ version: number; saved_at: string }[]>([]);
const showingHistory = ref(false);
const rendered = computed(() => renderFolderMarkdown(current.value?.body || ""));
const availableGuides = computed(() => {
  const rows = [...data.value.guides, ...data.value.tasks];
  const linked = new Set(guides.value.map((g) => g.id));
  const seen = new Set<string>();
  return rows
    .filter((g) => {
      if (seen.has(g.id) || linked.has(g.id)) return false;
      seen.add(g.id);
      return folder.value?.team_id ? g.team === folder.value.team_slug : !g.team && g.mine;
    })
    .map((g) => ({ id: g.id, title: g.title || g.id }))
    .sort((a, b) => a.title.localeCompare(b.title));
});
const guideOptions = computed(() =>
  availableGuides.value.map((guide) => ({ value: guide.id, label: guide.title })),
);

async function startDocument() {
  addingDocument.value = true;
  await nextTick();
  newDocumentInput.value?.focus();
}

async function startSubfolder() {
  addingSubfolder.value = true;
  await nextTick();
  newSubfolderInput.value?.focus();
}

async function createSubfolder() {
  if (!newSubfolderName.value.trim()) return;
  saving.value = true;
  trouble.value = "";
  try {
    const result = await api<{ folder: Folder }>("/v1/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: newSubfolderName.value.trim(), parent: id.value }),
    });
    if (result?.folder.id) await navigateTo(`/hub/folders/${result.folder.id}`);
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "That subfolder couldn't be made.";
  } finally {
    saving.value = false;
  }
}

async function load() {
  if (!signedIn.value || !id.value) return;
  if (loadedId.value !== id.value) {
    current.value = null;
    editing.value = false;
    addingSubfolder.value = false;
    newSubfolderName.value = "";
    loadedId.value = id.value;
  }
  loading.value = true;
  trouble.value = "";
  try {
    const result = await api<{
      folder: Folder;
      documents: FolderDocument[];
      assets: FolderAsset[];
      guides: FolderGuide[];
      children: Folder[];
      breadcrumbs: { id: string; title: string; color: string }[];
    }>(`/v1/folders/${id.value}`);
    folder.value = result?.folder || null;
    documents.value = result?.documents || [];
    assets.value = result?.assets || [];
    guides.value = result?.guides || [];
    children.value = result?.children || [];
    breadcrumbs.value = result?.breadcrumbs || [];
    if (documents.value.length && !documents.value.some((doc) => doc.id === current.value?.id)) {
      await openDocument(documents.value[0]!.id);
    }
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "This folder didn't load.";
  } finally {
    loading.value = false;
  }
}

async function openDocument(documentId: string) {
  if (current.value?.id === documentId && !editing.value) return;
  if (
    editing.value &&
    draft.value !== current.value?.body &&
    !confirm("Discard your unsaved edits?")
  )
    return;
  trouble.value = "";
  notice.value = "";
  try {
    const result = await api<{ document: FolderDocument }>(
      `/v1/folders/${id.value}/documents/${documentId}`,
    );
    current.value = result?.document || null;
    draft.value = result?.document.body || "";
    editing.value = false;
    showingHistory.value = false;
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "That document didn't open.";
  }
}

async function createDocument() {
  if (!newName.value.trim()) return;
  saving.value = true;
  trouble.value = "";
  try {
    const result = await api<{ document: FolderDocument }>(`/v1/folders/${id.value}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName.value.trim(), body: "" }),
    });
    newName.value = "";
    addingDocument.value = false;
    await load();
    if (result?.document) await openDocument(result.document.id);
    editing.value = true;
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "That document couldn't be created.";
  } finally {
    saving.value = false;
  }
}

async function saveDocument() {
  if (!current.value) return;
  saving.value = true;
  trouble.value = "";
  try {
    const result = await api<{ document: FolderDocument }>(
      `/v1/folders/${id.value}/documents/${current.value.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft.value, version: current.value.version }),
      },
    );
    if (result?.document) current.value = result.document;
    editing.value = false;
    notice.value = "Saved as a new version.";
    await load();
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "That document couldn't be saved.";
  } finally {
    saving.value = false;
  }
}

async function showHistory() {
  if (!current.value) return;
  showingHistory.value = !showingHistory.value;
  if (!showingHistory.value) return;
  const result = await api<{ revisions: { version: number; saved_at: string }[] }>(
    `/v1/folders/${id.value}/documents/${current.value.id}/revisions`,
  );
  revisions.value = result?.revisions || [];
}

async function openRevision(version: number) {
  if (!current.value) return;
  const result = await api<{ revision: { body: string } }>(
    `/v1/folders/${id.value}/documents/${current.value.id}/revisions/${version}`,
  );
  if (result?.revision) {
    draft.value = result.revision.body;
    editing.value = true;
    notice.value = `Version ${version} is in the editor. Save to make it the current version.`;
  }
}

async function uploadFile(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  uploading.value = true;
  trouble.value = "";
  try {
    const headers: Record<string, string> = {
      "content-type": file.type || "application/octet-stream",
      "x-file-name": file.name,
    };
    if (token.value) headers.authorization = `Bearer ${token.value}`;
    const response = await fetch(`/v1/folders/${id.value}/assets`, {
      method: "POST",
      headers,
      body: file,
    });
    if (!response.ok) {
      const failed = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(failed.message || "The file couldn't be uploaded.");
    }
    await load();
    notice.value = `${file.name} is in the folder.`;
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "The file couldn't be uploaded.";
  } finally {
    uploading.value = false;
    target.value = "";
  }
}

async function download(asset: FolderAsset) {
  trouble.value = "";
  try {
    const headers: Record<string, string> = {};
    if (token.value) headers.authorization = `Bearer ${token.value}`;
    const response = await fetch(`/v1/folders/${id.value}/assets/${asset.id}`, { headers });
    if (!response.ok) throw new Error("That file couldn't be downloaded.");
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = asset.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "That file couldn't be downloaded.";
  }
}

async function linkGuide() {
  if (!guideId.value.trim()) return;
  trouble.value = "";
  try {
    await api(`/v1/folders/${id.value}/guides`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guide: guideId.value.trim() }),
    });
    guideId.value = "";
    await load();
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "That guide couldn't be added.";
  }
}

async function unlinkGuide(guide: FolderGuide) {
  try {
    await api(`/v1/folders/${id.value}/guides/${guide.id}`, { method: "DELETE" });
    await load();
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "That guide couldn't be unlinked.";
  }
}

async function deleteDocument() {
  if (!current.value || !confirm(`Delete ${current.value.name} and its versions?`)) return;
  try {
    await api(`/v1/folders/${id.value}/documents/${current.value.id}`, { method: "DELETE" });
    current.value = null;
    editing.value = false;
    await load();
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "That document couldn't be deleted.";
  }
}

async function deleteAsset(asset: FolderAsset) {
  if (!confirm(`Delete ${asset.name} from this folder?`)) return;
  try {
    await api(`/v1/folders/${id.value}/assets/${asset.id}`, { method: "DELETE" });
    await load();
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "That file couldn't be deleted.";
  }
}

async function deleteFolder() {
  if (
    !folder.value?.manage ||
    !confirm(
      `Delete ${folder.value.title}, every subfolder, and their documents and files? Linked guides stay where they are. This cannot be undone.`,
    )
  )
    return;
  try {
    await api(`/v1/folders/${id.value}`, { method: "DELETE" });
    await navigateTo("/hub/folders");
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "That folder couldn't be deleted.";
  }
}

watch([signedIn, id], load, { immediate: true });
</script>

<template>
  <HubShell>
    <p v-if="trouble" role="alert" class="rounded-2 border border-danger bg-danger-soft px-4 py-3 font-ui text-sm text-danger">{{ trouble }}</p>
    <p v-if="notice" role="status" class="rounded-2 bg-ok-soft px-4 py-3 font-ui text-sm text-ok">{{ notice }}</p>
    <p v-if="loading && !folder" class="empty">Loading folder…</p>

    <template v-else-if="folder">
      <header class="folder-page-header">
        <nav class="folder-breadcrumbs flex min-w-0 flex-wrap items-center gap-2 font-ui text-sm" aria-label="Folder path">
          <NuxtLink to="/hub/folders" class="text-muted no-underline hover:text-fg">Folders</NuxtLink>
          <template v-for="crumb in breadcrumbs" :key="crumb.id">
            <span class="text-muted" aria-hidden="true">/</span>
            <span v-if="crumb.id === id" class="min-w-0 font-medium text-fg">{{ crumb.title }}</span>
            <NuxtLink v-else :to="`/hub/folders/${crumb.id}`" class="text-muted no-underline hover:text-fg">{{ crumb.title }}</NuxtLink>
          </template>
        </nav>
        <div class="folder-heading-row flex flex-wrap items-center justify-between gap-4">
          <div class="flex min-w-0 items-start gap-3">
            <span class="folder-title-icon flex size-10 shrink-0 items-center justify-center rounded-2" :data-color="displayColor || 'neutral'">
              <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3.5 6.5a2 2 0 0 1 2-2H10l2 2h6.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg>
            </span>
            <div class="min-w-0">
              <h1 class="m-0 text-h1">{{ folder.title }}</h1>
              <p v-if="folder.description" class="m-0 mt-1 font-ui text-sm text-muted">{{ folder.description }}</p>
              <p class="m-0 mt-2 font-ui text-xs text-muted">{{ folder.team_name || "Private folder" }} <span aria-hidden="true">·</span> {{ children.length }} {{ children.length === 1 ? "subfolder" : "subfolders" }} <span aria-hidden="true">·</span> {{ documents.length }} documents <span aria-hidden="true">·</span> {{ assets.length }} files</p>
            </div>
          </div>
          <button v-if="folder.manage" class="folder-delete font-ui text-xs text-muted hover:text-danger" type="button" @click="deleteFolder">Delete folder</button>
        </div>
      </header>
      <input ref="fileInput" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.zip,.md,.txt,.csv,.json" @change="uploadFile" />

    <div v-if="hasDocuments" class="folder-workspace">
      <aside class="folder-sidebar min-w-0 border-b border-line px-3 py-6 md:border-r md:border-b-0" aria-label="Folder contents">
        <h2 class="mb-5 px-3 font-ui text-sm font-medium text-fg">Contents</h2>
        <div class="mb-6">
          <div class="mb-2 flex items-center justify-between gap-3 px-3">
            <h3 class="m-0 font-ui text-xs font-medium uppercase tracking-wide text-muted">Subfolders</h3>
            <span class="font-ui text-xs text-muted">{{ children.length }}</span>
          </div>
          <NuxtLink v-for="child in children" :key="child.id" :to="`/hub/folders/${child.id}`" class="folder-child flex items-center gap-2 rounded-1 px-3 py-2 font-ui text-sm text-fg no-underline hover:bg-field">
            <svg class="folder-heading-icon size-4 shrink-0" :data-color="child.color || displayColor || 'neutral'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3.5 6.5a2 2 0 0 1 2-2H10l2 2h6.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg><span class="truncate">{{ child.title }}</span>
          </NuxtLink>
          <button v-if="!addingSubfolder" class="folder-add mx-1 rounded-1 px-3 py-2 text-left font-ui text-sm text-muted hover:text-fg" type="button" @click="startSubfolder">+ New subfolder</button>
          <form v-else class="px-2" @submit.prevent="createSubfolder">
            <input ref="newSubfolderInput" v-model="newSubfolderName" class="w-full text-sm" maxlength="100" placeholder="Subfolder name" aria-label="New subfolder name" @keydown.esc="addingSubfolder = false" />
            <div class="mt-2 flex gap-2"><button class="btn sm primary" type="submit" :disabled="saving || !newSubfolderName.trim()">Add</button><button class="btn sm" type="button" @click="addingSubfolder = false; newSubfolderName = ''">Cancel</button></div>
          </form>
        </div>
        <div class="mb-2 flex items-center justify-between gap-3 px-3">
          <h3 class="m-0 font-ui text-xs font-medium uppercase tracking-wide text-muted">Documents</h3>
          <span class="font-ui text-xs text-muted">{{ documents.length }}</span>
        </div>
        <nav v-if="documents.length" class="folder-document-list mb-3 flex gap-1 overflow-x-auto md:flex-col md:overflow-visible" aria-label="Documents">
          <button
            v-for="doc in documents"
            :key="doc.id"
            class="folder-document-link min-w-36 shrink-0 rounded-1 px-3 py-2 text-left font-ui text-sm leading-snug md:w-full md:min-w-0"
            :class="current?.id === doc.id ? 'is-current font-medium text-fg' : 'text-muted'"
            type="button"
            :aria-current="current?.id === doc.id ? 'page' : undefined"
            @click="openDocument(doc.id)"
          >{{ doc.name }}</button>
        </nav>
        <p v-else class="px-3 font-ui text-sm text-muted">No documents yet.</p>
        <button v-if="!addingDocument" class="folder-add mx-1 rounded-1 px-3 py-2 text-left font-ui text-sm text-muted hover:text-fg" type="button" :aria-expanded="addingDocument" @click="startDocument">+ New document</button>
        <form v-else class="px-2" @submit.prevent="createDocument">
          <input ref="newDocumentInput" v-model="newName" class="w-full text-sm" maxlength="120" placeholder="Document name" aria-label="New document name" @keydown.esc="addingDocument = false" />
          <div class="mt-2 flex gap-2"><button class="btn sm primary" type="submit" :disabled="saving || !newName.trim()">Add</button><button class="btn sm" type="button" @click="addingDocument = false; newName = ''">Cancel</button></div>
        </form>
        <div class="mt-6 border-t border-line pt-3">
          <a href="#folder-assets" class="folder-section-link flex items-center justify-between rounded-1 px-3 py-2 font-ui text-sm text-muted no-underline hover:bg-field hover:text-fg"><span>Assets</span><span class="text-xs">{{ assets.length }}</span></a>
          <a href="#folder-guides" class="folder-section-link flex items-center justify-between rounded-1 px-3 py-2 font-ui text-sm text-muted no-underline hover:bg-field hover:text-fg"><span>Guides</span><span class="text-xs">{{ guides.length }}</span></a>
        </div>
      </aside>

      <div class="folder-main min-w-0">
        <section class="folder-reading min-w-0 px-5 py-7 sm:px-8 sm:py-9 lg:px-12 lg:py-12" :class="{ 'has-document': current }" aria-label="Document">
          <template v-if="current">
            <div class="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <p class="m-0 font-ui text-xs text-muted">Document <span class="mx-2" aria-hidden="true">·</span> Version {{ current.version }}</p>
              <div class="flex flex-wrap gap-2">
                <button class="btn sm" type="button" :aria-expanded="showingHistory" @click="showHistory">History</button>
                <button v-if="!editing" class="btn sm" type="button" @click="editing = true">Edit</button>
              </div>
            </div>
            <div v-if="showingHistory" class="mb-6 rounded-2 bg-field p-4">
              <div class="mb-3 flex items-center justify-between gap-3"><p class="m-0 font-ui text-xs font-medium text-muted">Earlier versions</p><button class="font-ui text-xs text-muted underline hover:text-danger" type="button" @click="deleteDocument">Delete document</button></div>
              <div v-if="revisions.length" class="flex flex-wrap gap-2">
                <button v-for="revision in revisions" :key="revision.version" class="btn sm" type="button" @click="openRevision(revision.version)">Version {{ revision.version }}</button>
              </div>
              <p v-else class="mb-0 font-ui text-sm text-muted">No earlier versions.</p>
            </div>
            <form v-if="editing" @submit.prevent="saveDocument">
              <h1 class="folder-document-title">{{ current.name }}</h1>
              <label class="sr-only" for="folder-document-body">Document text</label>
              <textarea id="folder-document-body" v-model="draft" class="min-h-[32rem] w-full font-mono text-sm" spellcheck="true" />
              <div class="mt-3 flex gap-2">
                <button class="btn primary" type="submit" :disabled="saving">{{ saving ? "Saving…" : "Save version" }}</button>
                <button class="btn" type="button" @click="editing = false; draft = current?.body || ''">Cancel</button>
              </div>
            </form>
            <template v-else>
              <h1 v-if="!/^#\s+/.test(current.body.trimStart())" class="folder-document-title">{{ current.name }}</h1>
              <div v-if="current.body" class="overflow-x-auto">
                <!-- Folder Markdown is sanitized by renderFolderMarkdown before entering v-html. -->
                <article class="prose folder-document" v-html="rendered" />
              </div>
              <p v-else class="font-ui text-sm text-muted">This document is empty. Choose Edit to start writing.</p>
            </template>
          </template>
          <div v-else class="folder-reading-empty">
            <h2 class="m-0 text-h3">No documents yet</h2>
            <p class="m-0 mt-2 font-ui text-sm text-muted">Add a brief, script or reference page to this folder.</p>
            <button v-if="!addingDocument" class="btn primary mt-4" type="button" @click="startDocument">New document</button>
          </div>
        </section>

        <div class="grid gap-8 border-t border-line px-5 py-8 sm:px-8 lg:grid-cols-2 lg:px-12">
          <section id="folder-assets" class="folder-supplement min-w-0 scroll-mt-24" aria-label="Assets">
            <div class="flex w-full items-center justify-between"><h2 class="m-0 text-h3">Assets</h2><span class="font-ui text-xs text-muted">{{ assets.length }}</span></div>
            <button class="btn" type="button" :disabled="uploading" @click="fileInput?.click()">{{ uploading ? "Uploading…" : "Add a file" }}</button>
            <p class="m-0 font-ui text-xs text-muted">Screenshots, references and source files, up to 10 MB each.</p>
            <ul v-if="assets.length" class="m-0 w-full list-none p-0">
              <li v-for="asset in assets" :key="asset.id" class="flex items-center gap-3 border-t border-line py-3">
                <HubFolderAssetPreview :folder="id" :asset="asset.id" :type="asset.type" :name="asset.name" />
                <div class="min-w-0 flex-1"><button class="max-w-full break-all text-left font-ui text-sm text-fg underline" type="button" @click="download(asset)">{{ asset.name }}</button><span class="block font-ui text-xs text-muted">{{ Math.ceil(asset.bytes / 1024) }} KB</span></div>
                <button class="font-ui text-xs text-muted underline hover:text-danger" type="button" :aria-label="'Delete ' + asset.name" @click="deleteAsset(asset)">Delete</button>
              </li>
            </ul>
          </section>
          <section id="folder-guides" class="folder-supplement min-w-0 scroll-mt-24" aria-label="Guides">
            <h2 class="m-0 text-h3">Guides</h2>
            <p class="m-0 font-ui text-sm text-muted">Link a task or handoff that uses this folder.</p>
            <form class="flex w-full gap-2" @submit.prevent="linkGuide">
              <AppSelect v-model="guideId" class="min-w-0 flex-1" label="Guide to link" placeholder="Choose a guide" :options="guideOptions" :disabled="!guideOptions.length" :short-at="20" />
              <button class="btn" type="submit" :disabled="!guideId">Link</button>
            </form>
            <ul v-if="guides.length" class="m-0 w-full list-none p-0">
              <li v-for="guide in guides" :key="guide.id" class="flex items-start justify-between gap-2 border-t border-line py-3">
                <div><NuxtLink :to="'/hub/g/' + guide.id" class="font-ui text-sm">{{ guide.title }}</NuxtLink><p class="m-0 font-ui text-xs text-muted">{{ guide.kind }} · {{ guide.status }}</p></div>
                <button class="font-ui text-xs text-muted underline hover:text-fg" type="button" :aria-label="'Unlink ' + guide.title" @click="unlinkGuide(guide)">Unlink</button>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
    <div v-else class="folder-start">
      <section class="folder-start-lead">
        <p class="m-0 font-ui text-xs font-medium uppercase tracking-wide text-muted">Get started</p>
        <h2 class="m-0 mt-2 text-h2">Give this folder its first page</h2>
        <p class="m-0 mt-2 max-w-xl font-ui text-sm text-muted">A script, brief or reference document gives you and your agent a place to work from.</p>
        <button v-if="!addingDocument" class="btn primary mt-5" type="button" @click="startDocument">New document</button>
        <form v-else class="mt-5 flex max-w-md flex-wrap gap-2" @submit.prevent="createDocument">
          <input ref="newDocumentInput" v-model="newName" class="min-w-0 flex-1 text-sm" maxlength="120" placeholder="Document name" aria-label="New document name" @keydown.esc="addingDocument = false" />
          <button class="btn primary" type="submit" :disabled="saving || !newName.trim()">Create</button>
          <button class="btn" type="button" @click="addingDocument = false; newName = ''">Cancel</button>
        </form>
      </section>
      <div class="folder-start-grid">
        <section class="folder-start-option" aria-label="Subfolders">
          <h3 class="m-0 text-h3">Subfolders <span v-if="children.length" class="font-ui text-xs text-muted">{{ children.length }}</span></h3>
          <p v-if="!children.length" class="m-0 mt-2 font-ui text-sm text-muted">Keep related work together.</p>
          <ul v-else class="folder-start-items m-0 mt-3 list-none p-0">
            <li v-for="child in children" :key="child.id">
              <NuxtLink :to="`/hub/folders/${child.id}`" class="flex items-center gap-2 py-2 font-ui text-sm text-fg no-underline hover:underline">
                <svg class="folder-heading-icon size-4 shrink-0" :data-color="child.color || displayColor || 'neutral'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3.5 6.5a2 2 0 0 1 2-2H10l2 2h6.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg>
                <span>{{ child.title }}</span>
              </NuxtLink>
            </li>
          </ul>
          <button v-if="!addingSubfolder" class="folder-start-action" type="button" @click="startSubfolder">New subfolder <span aria-hidden="true">↗</span></button>
          <form v-else class="mt-4 flex flex-wrap gap-2" @submit.prevent="createSubfolder">
            <input ref="newSubfolderInput" v-model="newSubfolderName" class="min-w-0 flex-1 text-sm" maxlength="100" placeholder="Subfolder name" aria-label="New subfolder name" @keydown.esc="addingSubfolder = false" />
            <button class="btn sm primary" type="submit" :disabled="saving || !newSubfolderName.trim()">Add</button>
            <button class="btn sm" type="button" @click="addingSubfolder = false; newSubfolderName = ''">Cancel</button>
          </form>
        </section>
        <section class="folder-start-option" aria-label="Assets">
          <h3 class="m-0 text-h3">Files <span v-if="assets.length" class="font-ui text-xs text-muted">{{ assets.length }}</span></h3>
          <p v-if="!assets.length" class="m-0 mt-2 font-ui text-sm text-muted">Add screens or source material.</p>
          <ul v-else class="folder-start-items m-0 mt-3 list-none p-0">
            <li v-for="asset in assets" :key="asset.id" class="flex items-center justify-between gap-2 py-2">
              <button class="min-w-0 break-all text-left font-ui text-sm text-fg underline" type="button" @click="download(asset)">{{ asset.name }}</button>
              <button class="shrink-0 font-ui text-xs text-muted hover:text-danger" type="button" :aria-label="'Delete ' + asset.name" @click="deleteAsset(asset)">Delete</button>
            </li>
          </ul>
          <button class="folder-start-action" type="button" :disabled="uploading" @click="fileInput?.click()">{{ uploading ? "Uploading…" : "Add a file" }} <span v-if="!uploading" aria-hidden="true">↗</span></button>
        </section>
        <section class="folder-start-option" aria-label="Guides">
          <h3 class="m-0 text-h3">Guides <span v-if="guides.length" class="font-ui text-xs text-muted">{{ guides.length }}</span></h3>
          <p v-if="!guides.length" class="m-0 mt-2 font-ui text-sm text-muted">Connect a task or handoff.</p>
          <ul v-else class="folder-start-items m-0 mt-3 list-none p-0">
            <li v-for="guide in guides" :key="guide.id" class="flex items-start justify-between gap-2 py-2">
              <NuxtLink :to="'/hub/g/' + guide.id" class="min-w-0 font-ui text-sm">{{ guide.title }}</NuxtLink>
              <button class="shrink-0 font-ui text-xs text-muted hover:text-danger" type="button" :aria-label="'Unlink ' + guide.title" @click="unlinkGuide(guide)">Unlink</button>
            </li>
          </ul>
          <form class="mt-4 flex w-full gap-2" @submit.prevent="linkGuide">
            <AppSelect v-model="guideId" class="min-w-0 flex-1" label="Guide to link" placeholder="Choose a guide" :options="guideOptions" :disabled="!guideOptions.length" :short-at="20" />
            <button class="btn" type="submit" :disabled="!guideId">Link</button>
          </form>
        </section>
      </div>
    </div>
    </template>
  </HubShell>
</template>

<style scoped>
.folder-page-header {
  padding: var(--s-5) 0 var(--s-6);
}
.folder-breadcrumbs {
  margin-bottom: var(--s-5);
}
.folder-title-icon[data-color="neutral"] { color: var(--muted); background: var(--field); }
.folder-title-icon[data-color="coral"] { color: #e87260; background: #e872601a; }
.folder-title-icon[data-color="amber"] { color: #d99c35; background: #d99c351a; }
.folder-title-icon[data-color="green"] { color: #53a77c; background: #53a77c1a; }
.folder-title-icon[data-color="blue"] { color: #669bd8; background: #669bd81a; }
.folder-title-icon[data-color="violet"] { color: #a585d6; background: #a585d61a; }
.folder-delete {
  border: 0;
  background: transparent;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.folder-start {
  max-width: 64rem;
  padding-bottom: var(--s-8);
}
.folder-start-lead {
  border-radius: var(--r-3);
  padding: var(--s-6);
  background: var(--surface-raised);
  box-shadow: var(--edge-shadow);
}
.folder-start-grid {
  display: grid;
  gap: var(--s-3);
  margin-top: var(--s-4);
}
.folder-start-option {
  min-width: 0;
  border-radius: var(--r-2);
  padding: var(--s-5);
  background: var(--surface-raised);
  box-shadow: var(--edge-shadow);
}
.folder-start-items li + li {
  border-top: 1px solid var(--line);
}
.folder-start-action {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-4);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fg);
  font: 500 0.875rem var(--font-sans);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.folder-start-action:active { scale: 0.96; }
.folder-reading-empty { padding: var(--s-4) 0; }
@media (min-width: 640px) {
  .folder-start-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.folder-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.folder-sidebar {
  background: var(--surface-raised);
}
.folder-main {
  background: var(--bg);
}
.folder-heading-icon[data-color="neutral"] { color: var(--muted); }
.folder-heading-icon[data-color="coral"] { color: #e87260; }
.folder-heading-icon[data-color="amber"] { color: #d99c35; }
.folder-heading-icon[data-color="green"] { color: #53a77c; }
.folder-heading-icon[data-color="blue"] { color: #669bd8; }
.folder-heading-icon[data-color="violet"] { color: #a585d6; }
.folder-supplement {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-3);
}
.folder-document-link {
  border: 0;
  background: transparent;
  cursor: pointer;
  transition-property: background-color, color;
  transition-duration: 120ms;
}
.folder-document-link:hover,
.folder-document-link.is-current {
  background: var(--field);
  color: var(--fg);
}
.folder-document-link.is-current {
  box-shadow: inset 2px 0 var(--accent);
}
.folder-document-link:active {
  scale: 0.96;
}
.folder-add {
  border: 0;
  background: transparent;
  cursor: pointer;
}
.folder-add:active {
  scale: 0.96;
}
.folder-document-title,
.folder-document :deep(h1) {
  margin: 0 0 var(--s-6);
  font: 480 clamp(2rem, 3vw, 2.75rem) / 1.15 var(--font-serif);
  letter-spacing: -0.03em;
}
.folder-document.prose {
  max-width: none;
  font-family: var(--font-sans);
  font-size: 1rem;
  line-height: 1.7;
}
.folder-document :deep(table) {
  border-collapse: separate;
  border-spacing: 0;
  min-width: 32rem;
  width: 100%;
}
.folder-document :deep(thead th) {
  background: var(--field);
  padding: var(--s-3);
  border-bottom: 1px solid var(--line-strong);
  vertical-align: middle;
}
.folder-document :deep(thead th:first-child) {
  border-top-left-radius: var(--r-1);
}
.folder-document :deep(thead th:last-child) {
  border-top-right-radius: var(--r-1);
}
.folder-document :deep(td) {
  padding: var(--s-4) var(--s-3);
}
.folder-document :deep(th[align="right"]),
.folder-document :deep(td[align="right"]) {
  text-align: right;
}
.folder-document :deep(th[align="center"]),
.folder-document :deep(td[align="center"]) {
  text-align: center;
}
.folder-document :deep(.contains-task-list) {
  padding-left: 0;
  list-style: none;
}
.folder-document :deep(.task-list-item) {
  display: flex;
  align-items: baseline;
  gap: var(--s-2);
  list-style: none;
}
.folder-document :deep(.task-list-item input[type="checkbox"]) {
  flex: none;
  width: 1rem;
  height: 1rem;
  margin: 0;
  accent-color: var(--accent);
}
.folder-document :deep(.footnotes) {
  margin-top: var(--s-8);
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
  font-size: 0.875rem;
  color: var(--muted);
}
.folder-document :deep(del) {
  color: var(--muted);
}
@media (min-width: 768px) {
  .folder-workspace {
    grid-template-columns: 15rem minmax(0, 1fr);
  }
  .folder-sidebar {
    align-self: start;
    position: sticky;
    top: 4rem;
    height: calc(100vh - 4rem);
    overflow-y: auto;
  }
  .folder-reading.has-document {
    min-height: 32rem;
  }
}
</style>
