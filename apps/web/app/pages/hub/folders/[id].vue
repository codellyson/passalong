<script setup lang="ts">
import type { Folder, FolderAsset, FolderDocument, FolderGuide } from "~/types/folder";

usePage({
  title: "Folder · Passalong",
  description: "Documents, assets and guides for one project.",
  noindex: true,
});

const route = useRoute();
const { api, token, signedIn, data } = useHub();
const id = computed(() => String(route.params.id || ""));
const folder = ref<Folder | null>(null);
const documents = ref<FolderDocument[]>([]);
const assets = ref<FolderAsset[]>([]);
const guides = ref<FolderGuide[]>([]);
const current = ref<FolderDocument | null>(null);
const draft = ref("");
const editing = ref(false);
const loading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const trouble = ref("");
const notice = ref("");
const newName = ref("");
const guideId = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const revisions = ref<{ version: number; saved_at: string }[]>([]);
const showingHistory = ref(false);
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

async function load() {
  if (!signedIn.value || !id.value) return;
  loading.value = true;
  trouble.value = "";
  try {
    const result = await api<{
      folder: Folder;
      documents: FolderDocument[];
      assets: FolderAsset[];
      guides: FolderGuide[];
    }>(`/v1/folders/${id.value}`);
    folder.value = result?.folder || null;
    documents.value = result?.documents || [];
    assets.value = result?.assets || [];
    guides.value = result?.guides || [];
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "This folder didn't load.";
  } finally {
    loading.value = false;
  }
}

async function openDocument(documentId: string) {
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
      `Delete ${folder.value.title}, its documents and files? Linked guides stay where they are.`,
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
  <HubShell :heading="folder?.title || 'Folder'">
    <template #sub>{{ folder?.description || "Writing and assets in one place." }}</template>
    <div class="mb-6 flex items-center justify-between gap-4"><NuxtLink to="/hub/folders" class="font-ui text-sm">← All folders</NuxtLink><button v-if="folder?.manage" class="btn sm outline danger" type="button" @click="deleteFolder">Delete folder</button></div>
    <p v-if="trouble" role="alert" class="rounded-2 border border-danger bg-danger-soft px-4 py-3 font-ui text-sm text-danger">{{ trouble }}</p>
    <p v-if="notice" role="status" class="rounded-2 bg-ok-soft px-4 py-3 font-ui text-sm text-ok">{{ notice }}</p>
    <p v-if="loading && !folder" class="empty">Loading folder…</p>
    <div v-else-if="folder" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section class="min-w-0 rounded-3 bg-surface-raised p-5 shadow-edge" aria-label="Documents">
        <div class="mb-4 flex items-center justify-between gap-3"><h2 class="m-0 text-h3">Documents</h2><span class="font-ui text-xs text-muted">{{ documents.length }}</span></div>
        <form class="mb-4 flex gap-2" @submit.prevent="createDocument"><input v-model="newName" class="min-w-0 flex-1" maxlength="120" placeholder="script.md" aria-label="New document name" /><button class="btn" type="submit" :disabled="saving || !newName.trim()">Add</button></form>
        <div v-if="documents.length" class="mb-6 flex flex-wrap gap-2">
          <button v-for="doc in documents" :key="doc.id" class="btn sm" :class="current?.id === doc.id ? 'primary' : ''" type="button" @click="openDocument(doc.id)">{{ doc.name }}</button>
        </div>
        <p v-else class="font-ui text-sm text-muted">Start with a brief or script. You and an agent can both edit it.</p>

        <template v-if="current">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><div><h3 class="m-0 font-ui text-base font-medium">{{ current.name }}</h3><p class="m-0 font-ui text-xs text-muted">Version {{ current.version }}</p></div><div class="flex gap-2"><button class="btn sm" type="button" :aria-expanded="showingHistory" @click="showHistory">History</button><button v-if="!editing" class="btn sm" type="button" @click="editing = true">Edit</button><button class="btn sm outline danger" type="button" @click="deleteDocument">Delete</button></div></div>
          <div v-if="showingHistory" class="mb-4 rounded-2 bg-field p-3"><p class="mt-0 font-ui text-xs font-medium text-muted">Earlier versions</p><div class="flex flex-wrap gap-2"><button v-for="revision in revisions" :key="revision.version" class="btn sm" type="button" @click="openRevision(revision.version)">Version {{ revision.version }}</button></div></div>
          <form v-if="editing" @submit.prevent="saveDocument"><label class="sr-only" for="folder-document-body">Document text</label><textarea id="folder-document-body" v-model="draft" class="min-h-96 w-full font-mono text-sm" spellcheck="true" /><div class="mt-3 flex gap-2"><button class="btn primary" type="submit" :disabled="saving">{{ saving ? "Saving…" : "Save version" }}</button><button class="btn" type="button" @click="editing = false; draft = current?.body || ''">Cancel</button></div></form>
          <pre v-else class="m-0 min-h-52 overflow-x-auto whitespace-pre-wrap font-ui text-sm leading-relaxed">{{ current.body || "This document is empty. Choose Edit to start writing." }}</pre>
        </template>
      </section>

      <div class="flex min-w-0 flex-col gap-6">
        <section class="rounded-3 bg-surface-raised p-5 shadow-edge" aria-label="Assets">
          <div class="mb-4 flex items-center justify-between"><h2 class="m-0 text-h3">Assets</h2><span class="font-ui text-xs text-muted">{{ assets.length }}</span></div>
          <input ref="fileInput" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.zip,.md,.txt,.csv,.json" @change="uploadFile" />
          <button class="btn w-full" type="button" :disabled="uploading" @click="fileInput?.click()">{{ uploading ? "Uploading…" : "Add a file" }}</button>
          <p class="font-ui text-xs text-muted">Screenshots, references and source files, up to 10 MB each.</p>
          <ul v-if="assets.length" class="m-0 list-none p-0">
            <li v-for="asset in assets" :key="asset.id" class="flex items-center gap-3 border-t border-line py-3">
              <HubFolderAssetPreview :folder="id" :asset="asset.id" :type="asset.type" :name="asset.name" />
              <div class="min-w-0 flex-1"><button class="max-w-full break-all text-left font-ui text-sm text-fg underline" type="button" @click="download(asset)">{{ asset.name }}</button><span class="block font-ui text-xs text-muted">{{ Math.ceil(asset.bytes / 1024) }} KB</span></div>
              <button class="font-ui text-xs text-muted underline hover:text-danger" type="button" :aria-label="`Delete ${asset.name}`" @click="deleteAsset(asset)">Delete</button>
            </li>
          </ul>
        </section>
        <section class="rounded-3 bg-surface-raised p-5 shadow-edge" aria-label="Guides">
          <h2 class="mt-0 text-h3">Guides</h2>
          <p class="font-ui text-sm text-muted">Link a task or handoff that uses this folder.</p>
          <form class="flex gap-2" @submit.prevent="linkGuide">
            <AppSelect v-model="guideId" class="min-w-0 flex-1" label="Guide to link" placeholder="Choose a guide" :options="guideOptions" :disabled="!guideOptions.length" :short-at="20" />
            <button class="btn" type="submit" :disabled="!guideId">Link</button>
          </form>
          <ul v-if="guides.length" class="mb-0 list-none p-0"><li v-for="guide in guides" :key="guide.id" class="flex items-start justify-between gap-2 border-t border-line py-3"><div><NuxtLink :to="`/hub/g/${guide.id}`" class="font-ui text-sm">{{ guide.title }}</NuxtLink><p class="m-0 font-ui text-xs text-muted">{{ guide.kind }} · {{ guide.status }}</p></div><button class="font-ui text-xs text-muted underline hover:text-fg" type="button" :aria-label="`Unlink ${guide.title}`" @click="unlinkGuide(guide)">Unlink</button></li></ul>
        </section>
      </div>
    </div>
  </HubShell>
</template>
