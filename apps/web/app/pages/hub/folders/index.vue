<script setup lang="ts">
import type { Folder } from "~/types/folder";

usePage({
  title: "Folders · Passalong",
  description: "Documents and assets for work you share with agents.",
  noindex: true,
});

const { api, data, scope, signedIn } = useHub();
const folders = ref<Folder[]>([]);
const scopeOptions = computed(() => [
  { value: "all", label: "All folders" },
  { value: "mine", label: "Only me" },
  ...(data.value.me?.teams || []).map((team) => ({ value: team.slug, label: team.name || team.slug })),
]);
const busy = ref(false);
const trouble = ref("");
const prompt = computed(() => {
  const team = data.value.me?.teams?.find((entry) => entry.slug === scope.value);
  return `Create a Passalong folder for my tutorial video${team ? ` and share it with ${team.name}` : ""}. Draft a script there and add the screenshots I provide.`;
});

async function load() {
  if (!signedIn.value) return;
  busy.value = true;
  trouble.value = "";
  try {
    const result = await api<{ folders: Folder[] }>(
      `/v1/folders?scope=${encodeURIComponent(scope.value)}`,
    );
    folders.value = result?.folders || [];
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "Your folders didn't load.";
  } finally {
    busy.value = false;
  }
}

watch([signedIn, scope], load, { immediate: true });
</script>

<template>
  <HubShell heading="Folders">
    <template #sub>Keep a project's writing, screens and guides together for you and your agents.</template>

    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-2 font-ui text-sm text-muted">Show
        <AppSelect v-model="scope" class="min-w-36" label="Show folders in" :options="scopeOptions" />
      </div>
    </div>

    <div class="mb-8 rounded-3 bg-surface-raised px-5 py-4 shadow-edge">
      <h2 class="m-0 text-h3">Start with your agent</h2>
      <p class="mt-2 mb-3 max-w-prose font-ui text-sm text-muted">A sentence is enough. An agent connected to Passalong can make the folder, draft its documents and add files you share.</p>
      <p class="m-0 rounded-2 bg-field px-4 py-3 font-ui text-sm text-fg">“{{ prompt }}”</p>
      <button class="btn mt-3" type="button" @click="copy(prompt, $event.currentTarget)">Copy example</button>
    </div>

    <p v-if="trouble" role="alert" class="rounded-2 border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">{{ trouble }}</p>
    <p v-if="busy" class="empty">Loading folders…</p>
    <div v-else-if="folders.length" class="grid gap-4 sm:grid-cols-2">
      <NuxtLink v-for="folder in folders" :key="folder.id" :to="`/hub/folders/${folder.id}`" class="block rounded-3 bg-surface-raised p-5 text-fg no-underline shadow-edge transition-transform hover:-translate-y-0.5">
        <div class="mb-3 flex items-center justify-between gap-3"><span class="text-xs font-medium uppercase tracking-wide text-muted">{{ folder.team_name || "Private" }}</span><span class="text-xs text-muted">{{ folder.documents || 0 }} docs · {{ folder.assets || 0 }} files</span></div>
        <h2 class="mb-1 text-h3">{{ folder.title }}</h2>
        <p class="mb-0 line-clamp-2 font-ui text-sm text-muted">{{ folder.description || "Documents, assets and guides in one place." }}</p>
      </NuxtLink>
    </div>
    <div v-else-if="!trouble" class="empty"><h2>No folders here yet</h2><p>Ask your connected agent to make one from what you are working on.</p></div>
  </HubShell>
</template>
