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
const moveOpen = ref(false);
const moveMenu = ref<HTMLElement | null>(null);
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
  const result: {
    folder: Folder;
    depth: number;
    color: string;
    parent: string;
    childCount: number;
  }[] = [];
  const seen = new Set<string>();
  function add(parent: string, depth: number, inheritedColor = "") {
    for (const folder of (children.get(parent) || []).sort((a, b) =>
      a.title.localeCompare(b.title),
    )) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      const color = folder.color || inheritedColor;
      result.push({
        folder,
        depth,
        color,
        parent,
        childCount: children.get(folder.id)?.length || 0,
      });
      add(folder.id, depth + 1, color);
    }
  }
  add("", 0);
  return result;
});
// Collapsed by default, so a deep tree costs nothing until somebody opens it.
const expanded = ref(new Set<string>());
const visibleRows = computed(() => {
  const shown = new Set([""]);
  return rows.value.filter((row) => {
    if (!shown.has(row.parent)) return false;
    if (expanded.value.has(row.folder.id)) shown.add(row.folder.id);
    return true;
  });
});
function toggleOpen(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}
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
  // Folders only move within one space, so a selection spanning two can only go to the top.
  const scopeKey = selectedRoots.value[0]?.team_id || "";
  const oneSpace = selectedRoots.value.every((folder) => folder.team_id === scopeKey);
  // A destination every selected folder is already in would move nothing, so it says so.
  const here = (parent: string) =>
    selectedRoots.value.every((folder) => folder.parent_id === parent);
  return [
    { value: "", title: "Top level", depth: 0, here: here("") },
    ...(oneSpace
      ? rows.value
          .filter(({ folder }) => folder.team_id === scopeKey && !blocked.has(folder.id))
          .map(({ folder, depth }) => ({
            value: folder.id,
            title: folder.title,
            depth,
            here: here(folder.id),
          }))
      : []),
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
const loaded = ref(false);
const trouble = ref("");
const prompt = computed(() => {
  const team = data.value.me?.teams?.find((entry) => entry.slug === scope.value);
  return `Create a Passalong folder for my tutorial video${team ? ` and share it with ${team.name}` : ""}. Draft a script there and add the screenshots I provide.`;
});

/** `quiet` refreshes in place after an action, rather than swapping the list for "Loading". */
async function load(quiet = false) {
  if (!signedIn.value) return;
  if (!quiet) busy.value = true;
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
    loaded.value = true;
  }
}

watch([signedIn, scope], () => load(), { immediate: true });

// A folder deleted from its own page lands here; say so, then drop the query so a reload is quiet.
const route = useRoute();
onMounted(() => {
  const deleted = route.query.deleted;
  if (typeof deleted === "string" && deleted) {
    say(`Deleted ${deleted} and everything in it.`);
    navigateTo({ query: {} }, { replace: true });
  }
});
watch(selected, () => {
  moveOpen.value = false;
});

// An action on several folders is several requests, one after another. Each says where it has got
// to while it runs and what it did when it ends: before, the buttons went grey, the list blinked to
// "Loading folders…" and back, and nothing said whether anything had happened.
const progress = ref("");
const working = ref<string[]>([]);
const notice = ref("");
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function say(text: string) {
  notice.value = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = "";
  }, 6000);
}
const folderCount = (n: number) => `${n} ${n === 1 ? "folder" : "folders"}`;

async function runEach(
  targets: Folder[],
  verb: string,
  act: (folder: Folder) => Promise<unknown>,
  done: (count: number) => string,
  fallback: string,
) {
  actionBusy.value = true;
  trouble.value = "";
  notice.value = "";
  working.value = targets.map((folder) => folder.id);
  let finished = 0;
  try {
    for (const folder of targets) {
      progress.value = `${verb} ${finished + 1} of ${targets.length}…`;
      await act(folder);
      finished++;
    }
    await load(true);
    say(done(finished));
  } catch (error) {
    const message = error instanceof Error ? error.message : fallback;
    await load(true);
    // Say what did happen before what stopped it: a half-done batch is not a failed one.
    trouble.value = finished ? `${done(finished)} Then it stopped: ${message}` : message;
  } finally {
    actionBusy.value = false;
    progress.value = "";
    working.value = [];
  }
}

const patchFolder = (folder: Folder, body: Record<string, string>) =>
  api(`/v1/folders/${folder.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

async function moveTo(parent: string, title: string) {
  moveOpen.value = false;
  await runEach(
    selectedRoots.value,
    "Moving",
    (folder) => patchFolder(folder, { parent }),
    (n) => `Moved ${folderCount(n)} to ${title}.`,
    "Those folders couldn't be moved.",
  );
}
async function colorSelected(color: string) {
  // Color is per selected folder, including a child selected with its parent.
  const label = colorChoices.find((choice) => choice.value === color)?.label.toLowerCase() || "";
  await runEach(
    selectedFolders.value,
    "Coloring",
    (folder) => patchFolder(folder, { color }),
    (n) => `Made ${folderCount(n)} ${label}.`,
    "Those colors couldn't be changed.",
  );
}
/** A menu that stays open behind you is worse than no menu. */
function onDocument(event: MouseEvent) {
  if (moveOpen.value && !moveMenu.value?.contains(event.target as Node)) moveOpen.value = false;
}
onMounted(() => document.addEventListener("click", onDocument));
onBeforeUnmount(() => document.removeEventListener("click", onDocument));

function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((entry) => entry !== id)
    : [...selected.value, id];
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
  await runEach(
    selectedRoots.value,
    "Deleting",
    (folder) => api(`/v1/folders/${folder.id}`, { method: "DELETE" }),
    (n) => `Deleted ${folderCount(n)} and everything in ${n === 1 ? "it" : "them"}.`,
    "Those folders couldn't be deleted.",
  );
}
</script>

<template>
  <HubShell heading="Folders">
    <template #sub>Keep a project's writing, screens and guides together for you and your agents.</template>

    <!-- Nothing to filter until there is something somewhere; a narrowed, empty view keeps it to widen back. -->
    <div v-if="!loaded || folders.length || scope !== 'all'" class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-2 font-ui text-sm text-muted">Show
        <AppSelect v-model="scope" class="min-w-36" label="Show folders in" :options="scopeOptions" />
      </div>
      <button v-if="folders.length" class="btn sm" type="button" @click="selected = selected.length === folders.length ? [] : folders.map((folder) => folder.id)">{{ selected.length === folders.length ? "Clear selection" : "Select all" }}</button>
    </div>

    <p v-if="trouble" role="alert" class="rounded-2 border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">{{ trouble }}</p>
    <!-- Pinned to the bottom of the window, because a bulk action is started from the bar under a
         long list and its result has to be seen from there. -->
    <p v-if="notice" role="status" class="folder-done fixed bottom-6 left-1/2 z-40 m-0 -translate-x-1/2 rounded-pill bg-ink px-4 py-2 font-ui text-sm text-on-ink shadow-edge">{{ notice }}</p>
    <p v-if="busy" class="empty">Loading folders…</p>
    <template v-else-if="!trouble">
      <div v-if="folders.length" class="folder-list overflow-hidden rounded-3 bg-surface-raised shadow-edge" :class="{ picking: selected.length }">
        <div v-for="({ folder, depth, color, childCount }, index) in visibleRows" :key="folder.id" class="folder-row flex items-center gap-3 px-4 py-3" :class="{ 'border-t border-line': index > 0, 'is-selected': selected.includes(folder.id), 'is-working': working.includes(folder.id) }" :style="{ '--folder-depth': depth, '--folder-hue': color ? `var(--folder-${color})` : 'var(--muted)' }">
          <span v-if="depth" class="folder-rails shrink-0" aria-hidden="true" />
          <button v-if="childCount" class="folder-toggle flex size-6 shrink-0 items-center justify-center rounded-1 text-muted hover:bg-field hover:text-fg" type="button" :aria-expanded="expanded.has(folder.id)" :aria-label="`${expanded.has(folder.id) ? 'Hide' : 'Show'} subfolders of ${folder.title}`" @click="toggleOpen(folder.id)">
            <svg class="folder-toggle-chevron size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <span v-else class="size-6 shrink-0" aria-hidden="true" />
          <span class="folder-slot relative grid size-5 shrink-0 place-items-center">
            <svg class="folder-icon size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3.5 6.5a2 2 0 0 1 2-2H10l2 2h6.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg>
            <label class="folder-pick absolute inset-0 grid place-items-center"><input class="size-4 accent-[var(--accent)]" type="checkbox" :checked="selected.includes(folder.id)" :aria-label="`Select ${folder.title}`" @change="toggle(folder.id)" /></label>
          </span>
          <NuxtLink :to="`/hub/folders/${folder.id}`" class="folder-row-link flex min-w-0 flex-1 items-center gap-3 text-fg no-underline">
            <span class="min-w-0 flex-1"><span class="block truncate font-ui text-sm font-medium">{{ folder.title }}</span><span v-if="folder.description" class="block truncate font-ui text-xs text-muted">{{ folder.description }}</span></span>
          </NuxtLink>
          <span class="hidden font-ui text-xs text-muted sm:block">{{ folder.documents || 0 }} docs · {{ folder.assets || 0 }} files<template v-if="childCount"> · {{ childCount }} {{ childCount === 1 ? "subfolder" : "subfolders" }}</template></span>
          <span class="hidden min-w-20 text-right font-ui text-xs text-muted md:block">{{ folder.team_name || "Private" }}</span>
        </div>
      </div>
      <!-- One block, not a notice and then an instruction saying the same thing twice. -->
      <section v-else class="folder-empty mx-auto max-w-xl py-8 text-center" aria-labelledby="folders-empty-h">
        <h2 id="folders-empty-h" class="m-0 text-h3">No folders {{ scope === "all" ? "yet" : "here yet" }}</h2>
        <p class="m-0 mt-2 font-ui text-sm text-muted">Describe the project to your agent in a sentence. It makes the folder, writes its first document and adds the files you share.</p>
        <div class="mt-5 flex flex-wrap items-center gap-3 rounded-2 bg-surface-raised px-4 py-3 text-left shadow-edge">
          <p class="m-0 min-w-0 flex-1 font-ui text-sm text-fg">“{{ prompt }}”</p>
          <button class="btn sm" type="button" @click="copy(prompt, $event.currentTarget)">Copy example</button>
        </div>
        <p class="m-0 mt-4 font-ui text-sm text-muted">No agent connected yet? <a href="/connect">Connect one</a>: Claude, ChatGPT, Codex or anything that runs the CLI.</p>
      </section>

      <div v-if="selected.length" class="mt-4 rounded-3 bg-surface-raised px-4 py-4 shadow-edge">
        <div class="flex flex-wrap items-center gap-3">
          <span class="font-ui text-sm font-medium" aria-live="polite">{{ progress || `${selected.length} selected` }}</span>
          <span class="font-ui text-xs text-muted">Color</span>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Set selected folder colors">
            <button v-for="choice in colorChoices" :key="choice.label" class="folder-color-choice size-7 rounded-full" :data-color="choice.value || 'neutral'" type="button" :disabled="actionBusy" :aria-label="`Set ${choice.label.toLowerCase()} color`" :title="choice.label" @click="colorSelected(choice.value)" />
          </div>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <div ref="moveMenu" class="relative" @keydown.esc="moveOpen = false">
              <button class="btn sm" type="button" :disabled="actionBusy" aria-haspopup="menu" :aria-expanded="moveOpen" @click="moveOpen = !moveOpen">
                Move to…
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <div v-if="moveOpen" class="menu folder-move-menu" role="menu" aria-label="Move selected folders to">
                <button
                  v-for="option in moveOptions"
                  :key="option.value || 'root'"
                  class="menu-item justify-between"
                  type="button"
                  role="menuitem"
                  :disabled="option.here"
                  :style="{ paddingLeft: `calc(var(--s-2) + ${option.depth} * var(--s-4))` }"
                  @click="moveTo(option.value, option.title)"
                >
                  <span class="truncate">{{ option.title }}</span>
                  <span v-if="option.here" class="shrink-0 text-xs text-muted">Already here</span>
                </button>
                <p v-if="moveOptions.length === 1" class="menu-note">Folders from different spaces can only move to the top level together.</p>
              </div>
            </div>
            <button class="btn sm outline danger" type="button" :disabled="actionBusy || !selectedRoots.every((folder) => Boolean(folder.manage))" @click="deleteSelected">Delete</button>
          </div>
        </div>
      </div>

      <section v-if="folders.length" class="mt-8 border-t border-line pt-6" aria-label="Create a folder with your agent">
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
.folder-row { position: relative; }
/* One rail per level, 16px apart, under the chevron of each ancestor: depth reads as lines, not as a slant. */
.folder-rails {
  align-self: stretch;
  width: calc(var(--folder-depth) * var(--s-4));
  margin: calc(-1 * var(--s-3)) calc(-1 * var(--s-3)) calc(-1 * var(--s-3)) 0;
  background: repeating-linear-gradient(to right, transparent 0 11px, var(--line-strong) 11px 12px, transparent 12px var(--s-4));
}
.folder-move-menu { max-height: 18rem; overflow-y: auto; }
.folder-move-menu .menu-item:disabled { cursor: default; color: var(--muted); background: transparent; }
.folder-toggle { border: 0; background: transparent; cursor: pointer; }
.folder-toggle:active { scale: 0.96; }
.folder-toggle-chevron { rotate: -90deg; transition: rotate 150ms ease; }
.folder-toggle[aria-expanded="true"] .folder-toggle-chevron { rotate: 0deg; }
.folder-row.is-selected { background: var(--field); }
.folder-row.is-working { opacity: 0.5; pointer-events: none; transition: opacity 150ms ease; }
/* The checkbox stands in for the folder icon, so it costs no space of its own: it shows on hover,
   on focus, while anything is selected, and always on a touch screen. */
.folder-pick, .folder-icon { transition: opacity 120ms ease; }
.folder-pick { opacity: 0; }
.folder-row:hover .folder-pick,
.folder-pick:focus-within,
.folder-list.picking .folder-pick { opacity: 1; }
.folder-row:hover .folder-icon,
.folder-slot:focus-within .folder-icon,
.folder-list.picking .folder-icon { opacity: 0; }
@media (hover: none) {
  .folder-pick { opacity: 1; }
  .folder-icon { opacity: 0; }
}
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
