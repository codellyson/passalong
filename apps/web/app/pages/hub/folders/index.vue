<script setup lang="ts">
import type { Folder } from "~/types/folder";

usePage({
  title: "Folders · Passalong",
  description: "Documents and assets for work you share with agents.",
  noindex: true,
});

const { api, data, scope, signedIn } = useHub();
const folders = ref<Folder[]>([]);
const selected = ref<string[]>([]);
const movingTo = ref("root");
const actionBusy = ref(false);
const colorChoices = [
  { value: "", label: "Neutral" },
  { value: "coral", label: "Coral" },
  { value: "amber", label: "Amber" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "violet", label: "Violet" },
];
const folderById = computed(() => new Map(folders.value.map((folder) => [folder.id, folder])));
const rows = computed(() => {
  const children = new Map<string, Folder[]>();
  for (const folder of folders.value) {
    const parent = folderById.value.has(folder.parent_id) ? folder.parent_id : "";
    const siblings = children.get(parent) || [];
    siblings.push(folder);
    children.set(parent, siblings);
  }
  const result: { folder: Folder; depth: number; color: string }[] = [];
  const seen = new Set<string>();
  function add(parent: string, depth: number, inheritedColor = "") {
    for (const folder of (children.get(parent) || []).sort((a, b) =>
      a.title.localeCompare(b.title),
    )) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      const color = folder.color || inheritedColor;
      result.push({ folder, depth, color });
      add(folder.id, depth + 1, color);
    }
  }
  add("", 0);
  return result;
});
const selectedFolders = computed(() =>
  selected.value
    .map((id) => folderById.value.get(id))
    .filter((folder): folder is Folder => Boolean(folder)),
);
const selectedRoots = computed(() => {
  const ids = new Set(selected.value);
  return selectedFolders.value.filter((folder) => {
    let parent = folder.parent_id;
    while (parent) {
      if (ids.has(parent)) return false;
      parent = folderById.value.get(parent)?.parent_id || "";
    }
    return true;
  });
});
const moveOptions = computed(() => {
  const blocked = new Set(selected.value);
  for (const folder of folders.value) {
    let parent = folder.parent_id;
    while (parent) {
      if (blocked.has(parent)) {
        blocked.add(folder.id);
        break;
      }
      parent = folderById.value.get(parent)?.parent_id || "";
    }
  }
  const scopeKey = selectedRoots.value[0]?.team_id || "";
  return [
    { value: "root", label: "Top level" },
    ...rows.value
      .filter(({ folder }) => folder.team_id === scopeKey && !blocked.has(folder.id))
      .map(({ folder, depth }) => ({
        value: folder.id,
        label: `${"  ".repeat(depth)}${folder.title}`,
      })),
  ];
});
const scopeOptions = computed(() => [
  { value: "all", label: "All folders" },
  { value: "mine", label: "Only me" },
  ...(data.value.me?.teams || []).map((team) => ({
    value: team.slug,
    label: team.name || team.slug,
  })),
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
    selected.value = [];
  } catch (error) {
    trouble.value = error instanceof Error ? error.message : "Your folders didn't load.";
  } finally {
    busy.value = false;
  }
}

watch([signedIn, scope], load, { immediate: true });
watch(selected, () => {
  movingTo.value = "root";
});

function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((entry) => entry !== id)
    : [...selected.value, id];
}

async function changeSelected(patch: Record<string, string>) {
  actionBusy.value = true;
  trouble.value = "";
  try {
    for (const folder of selectedRoots.value) {
      await api(`/v1/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
    }
    await load();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Those folders couldn't be changed.";
    await load();
    trouble.value = message;
  } finally {
    actionBusy.value = false;
  }
}

async function colorSelected(color: string) {
  // Color is per selected folder, including a child selected with its parent.
  actionBusy.value = true;
  trouble.value = "";
  try {
    for (const folder of selectedFolders.value)
      await api(`/v1/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ color }),
      });
    await load();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Those colors couldn't be changed.";
    await load();
    trouble.value = message;
  } finally {
    actionBusy.value = false;
  }
}

async function deleteSelected() {
  if (!selectedRoots.value.every((folder) => Boolean(folder.manage))) {
    trouble.value = "Only a folder's creator or a team owner can delete it.";
    return;
  }
  if (
    !confirm(
      `Delete ${selectedRoots.value.length} selected folder${selectedRoots.value.length === 1 ? "" : "s"} and everything inside them? This cannot be undone.`,
    )
  )
    return;
  actionBusy.value = true;
  trouble.value = "";
  try {
    for (const folder of selectedRoots.value)
      await api(`/v1/folders/${folder.id}`, { method: "DELETE" });
    await load();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Those folders couldn't be deleted.";
    await load();
    trouble.value = message;
  } finally {
    actionBusy.value = false;
  }
}
</script>

<template>
  <HubShell heading="Folders">
    <template #sub>Keep a project's writing, screens and guides together for you and your agents.</template>

    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-2 font-ui text-sm text-muted">Show
        <AppSelect v-model="scope" class="min-w-36" label="Show folders in" :options="scopeOptions" />
      </div>
      <button v-if="folders.length" class="btn sm" type="button" @click="selected = selected.length === folders.length ? [] : folders.map((folder) => folder.id)">{{ selected.length === folders.length ? "Clear selection" : "Select all" }}</button>
    </div>

    <p v-if="trouble" role="alert" class="rounded-2 border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">{{ trouble }}</p>
    <p v-if="busy" class="empty">Loading folders…</p>
    <template v-else-if="!trouble">
      <div v-if="folders.length" class="overflow-hidden rounded-3 bg-surface-raised shadow-edge">
        <div v-for="({ folder, depth, color }, index) in rows" :key="folder.id" class="folder-row flex items-center gap-3 px-4 py-3" :class="{ 'border-t border-line': index > 0, 'is-selected': selected.includes(folder.id) }" :data-color="color || 'neutral'" :style="{ '--folder-depth': Math.min(depth, 8), '--folder-hue': color ? `var(--folder-${color})` : 'var(--muted)' }">
          <label class="flex shrink-0 items-center"><input class="size-4 accent-[var(--accent)]" type="checkbox" :checked="selected.includes(folder.id)" :aria-label="`Select ${folder.title}`" @change="toggle(folder.id)" /></label>
          <NuxtLink :to="`/hub/folders/${folder.id}`" class="folder-row-link flex min-w-0 flex-1 items-center gap-3 text-fg no-underline">
            <svg class="folder-icon size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3.5 6.5a2 2 0 0 1 2-2H10l2 2h6.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg>
            <span class="min-w-0 flex-1"><span class="block truncate font-ui text-sm font-medium">{{ folder.title }}</span><span v-if="folder.description" class="block truncate font-ui text-xs text-muted">{{ folder.description }}</span></span>
          </NuxtLink>
          <span class="hidden font-ui text-xs text-muted sm:block">{{ folder.documents || 0 }} docs · {{ folder.assets || 0 }} files</span>
          <span class="hidden min-w-20 text-right font-ui text-xs text-muted md:block">{{ folder.team_name || "Private" }}</span>
        </div>
      </div>
      <div v-else class="empty"><h2>No folders here yet</h2><p>Ask your connected agent to make one from what you are working on.</p></div>

      <div v-if="selected.length" class="mt-4 rounded-3 bg-surface-raised px-4 py-4 shadow-edge">
        <div class="flex flex-wrap items-center gap-3">
          <span class="font-ui text-sm font-medium">{{ selected.length }} selected</span>
          <span class="font-ui text-xs text-muted">Color</span>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Set selected folder colors">
            <button v-for="choice in colorChoices" :key="choice.label" class="folder-color-choice size-7 rounded-full" :data-color="choice.value || 'neutral'" type="button" :disabled="actionBusy" :aria-label="`Set ${choice.label.toLowerCase()} color`" :title="choice.label" @click="colorSelected(choice.value)" />
          </div>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <AppSelect v-model="movingTo" class="min-w-40" label="Move selected folders into" :options="moveOptions" />
            <button class="btn sm" type="button" :disabled="actionBusy || (movingTo !== 'root' && (selectedRoots.some((folder) => folder.team_id !== selectedRoots[0]?.team_id) || !moveOptions.some((option) => option.value === movingTo)))" @click="changeSelected({ parent: movingTo === 'root' ? '' : movingTo })">Move</button>
            <button class="btn sm outline danger" type="button" :disabled="actionBusy || !selectedRoots.every((folder) => Boolean(folder.manage))" @click="deleteSelected">Delete</button>
          </div>
        </div>
      </div>

      <section class="mt-8 border-t border-line pt-6" aria-label="Create a folder with your agent">
        <h2 class="m-0 text-h3">Make a folder with your agent</h2>
        <p class="mt-2 mb-3 max-w-prose font-ui text-sm text-muted">Describe the project in a sentence. Your agent can create the folder, write its first document and add the files you share.</p>
        <div class="flex flex-wrap items-center gap-3 rounded-2 bg-surface-raised px-4 py-3 shadow-edge">
          <p class="m-0 min-w-0 flex-1 font-ui text-sm text-fg">“{{ prompt }}”</p>
          <button class="btn sm" type="button" @click="copy(prompt, $event.currentTarget)">Copy example</button>
        </div>
      </section>
    </template>
  </HubShell>
</template>

<style scoped>
.folder-row, .folder-color-choice {
  --folder-coral: #e87260;
  --folder-amber: #d99c35;
  --folder-green: #53a77c;
  --folder-blue: #669bd8;
  --folder-violet: #a585d6;
}
.folder-row {
  position: relative;
  padding-left: calc(var(--s-4) + var(--folder-depth) * var(--s-5));
}
.folder-row::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--folder-hue);
  content: "";
}
.folder-row[data-color="neutral"]::before { background: transparent; }
.folder-row.is-selected { background: var(--field); }
.folder-row-link:hover { color: var(--accent); }
.folder-icon { color: var(--folder-hue); }
.folder-color-choice { border: 2px solid var(--bg); box-shadow: 0 0 0 1px var(--line-strong); background: var(--folder-hue); cursor: pointer; }
.folder-color-choice:hover { scale: 1.12; }
.folder-color-choice[data-color="neutral"] { --folder-hue: var(--muted); }
.folder-color-choice[data-color="coral"] { --folder-hue: var(--folder-coral); }
.folder-color-choice[data-color="amber"] { --folder-hue: var(--folder-amber); }
.folder-color-choice[data-color="green"] { --folder-hue: var(--folder-green); }
.folder-color-choice[data-color="blue"] { --folder-hue: var(--folder-blue); }
.folder-color-choice[data-color="violet"] { --folder-hue: var(--folder-violet); }
</style>
