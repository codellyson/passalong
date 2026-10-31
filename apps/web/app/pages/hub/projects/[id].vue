<!--
  A project: what to know about one product, the work on it, and what happened to it.

  Three tabs at their own addresses (`?tab=documents|work|history`). Documents leads with the README
  — what this product is — then the other pages and the files. Work is the project's register, rows
  shaped like Needs you's. History is one time-ordered list of work finished and document versions
  saved, by a person or an agent; it owns no table (apps/api/src/project.ts) and shows no counts.

  Coral means one thing: changed since you last looked, said as "Changed · <what>". Work keeps it
  until opened (unread news on it); a document keeps it until you open that document (the server's
  `document_seen`, project.ts). Both are the server's answer; nothing is kept in the browser.

  A project is a project; projects inside it are listed quietly under Documents, and open as projects.
-->
<script setup lang="ts">
import type {
  Project,
  ProjectDocument,
  ProjectFile,
  ProjectHistoryItem,
  ProjectWork,
} from "~/types/project";
import { readmeAsk } from "~/utils/asks";
import { renderProjectMarkdown } from "~/utils/project-markdown";
import { age, byLine, TONES, toneOf, viaOf } from "~/utils/projects";

usePage({
  title: "Project · Passalong",
  description: "What to know about a product, the work on it, and what happened to it.",
  noindex: true,
});

const route = useRoute();
const { api, json, token, signedIn, data, projectsQ } = useHub();
const id = computed(() => String(route.params.id || ""));
const TABS = [
  { key: "documents", label: "Documents" },
  { key: "work", label: "Work" },
  { key: "history", label: "History" },
] as const;
const tab = computed(() =>
  TABS.some((t) => t.key === route.query.tab) ? String(route.query.tab) : "documents",
);
const docId = computed(() => (typeof route.query.doc === "string" ? route.query.doc : ""));
const version = computed(() => Number(route.query.v) || undefined);
const now = ref(Date.now());

// ---- the project itself -------------------------------------------------------------------------
const project = ref<(Project & { share_url?: string }) | null>(null);
const documents = ref<ProjectDocument[]>([]);
const files = ref<ProjectFile[]>([]);
const children = ref<Project[]>([]);
const breadcrumbs = ref<{ id: string; title: string; color: string }[]>([]);
const loading = ref(true);
const loadError = ref("");
const problem = ref("");
const notice = ref("");

/** Who sees it, in words: the team's name, or only you. */
const space = computed(() => {
  if (!project.value?.team_id) return "Only you";
  const t = data.value.me?.teams.find((x) => x.slug === project.value?.team_slug);
  return `Everyone in ${t?.name || project.value.team_slug || "the team"}`;
});
const parent = computed(() => breadcrumbs.value.at(-2) ?? null);
/** A project inside a project keeps the project's colour unless it has its own. */
const tone = computed(() => {
  const own = [...breadcrumbs.value].reverse().find((b) => b.color);
  return toneOf({ id: breadcrumbs.value[0]?.id || id.value, color: own?.color || "" });
});

async function load() {
  if (!signedIn.value || !id.value) return;
  loadError.value = "";
  try {
    const got = await api<{
      project: Project;
      documents: ProjectDocument[];
      files: ProjectFile[];
      children: Project[];
      breadcrumbs: { id: string; title: string; color: string }[];
    }>(`/v1/projects/${id.value}`);
    project.value = got?.project ?? null;
    documents.value = got?.documents ?? [];
    files.value = got?.files ?? [];
    children.value = got?.children ?? [];
    breadcrumbs.value = got?.breadcrumbs ?? [];
    await loadReadme();
  } catch (err) {
    loadError.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

// ---- work and history ---------------------------------------------------------------------------
const open = ref<ProjectWork[]>([]);
const done = ref<ProjectWork[]>([]);
const history = ref<ProjectHistoryItem[]>([]);
const viewLoading = ref(true);
const viewError = ref("");
async function loadView() {
  if (!signedIn.value || !id.value) return;
  viewError.value = "";
  try {
    const got = await api<{
      open: ProjectWork[];
      done: ProjectWork[];
      history: ProjectHistoryItem[];
    }>(`/v1/projects/${id.value}/project`);
    open.value = got?.open ?? [];
    done.value = got?.done ?? [];
    history.value = got?.history ?? [];
  } catch (err) {
    viewError.value = (err as Error).message;
  } finally {
    viewLoading.value = false;
  }
}

// Declared before the watch below, which resets them: on a move here inside the hub it runs at
// once, signed in, and reading them before their declaration threw and left the page loading.
const readAll = ref(false);
const confirmingDelete = ref(false);
let shown = "";
watch(
  [signedIn, id],
  async ([on, now_id]) => {
    if (!on || !now_id) return;
    if (now_id !== shown) {
      shown = now_id;
      loading.value = true;
      viewLoading.value = true;
      project.value = null;
      readAll.value = false;
      confirmingDelete.value = false;
    }
    await Promise.all([load(), loadView()]);
  },
  { immediate: true },
);
/** Something here changed on the server (a save, a document opened): every view of it follows. */
async function changed() {
  await Promise.all([load(), loadView()]);
  projectsQ.refetch();
}
const refresh = () => Promise.all([load(), loadView()]);

// ---- documents ----------------------------------------------------------------------------------
const isReadme = (d: { name: string }) => /^readme(\.md)?$/i.test(d.name.trim());
const readmeRow = computed(() => documents.value.find(isReadme) ?? null);
const others = computed(() =>
  documents.value.filter((d) => !isReadme(d)).sort((a, b) => b.updated.localeCompare(a.updated)),
);
const readme = ref<ProjectDocument | null>(null);
async function loadReadme() {
  const row = readmeRow.value;
  if (!row) {
    readme.value = null;
    return;
  }
  if (readme.value?.id === row.id && readme.value.version === row.version) return;
  const got = await api<{ document: ProjectDocument }>(
    `/v1/projects/${id.value}/documents/${row.id}`,
  );
  readme.value = got?.document ?? null;
}
/**
 * The README's opening section: its first heading dropped when it only repeats the project's name,
 * and everything from the first second-level heading on behind "Read all", so the documents
 * register is still in the first screen.
 */
const readmeParts = computed(() => {
  let body = readme.value?.body || "";
  const first = body.match(/^\s*#\s+(.+)\n?/);
  if (first && first[1]?.trim().toLowerCase() === project.value?.title.trim().toLowerCase())
    body = body.slice(first[0].length);
  const cut = body.search(/^##\s/m);
  return cut > 0 && body.slice(0, cut).trim()
    ? { opening: body.slice(0, cut), rest: true, all: body }
    : { opening: body, rest: false, all: body };
});
const readmeHtml = computed(() =>
  renderProjectMarkdown(readAll.value ? readmeParts.value.all : readmeParts.value.opening),
);
const ask = computed(() =>
  project.value
    ? readmeAsk({ id: project.value.id, title: project.value.title, repo: project.value.repo })
    : "",
);
/** "Version 3 by Bola, an agent": the one way a document's last save is said. */
const lastEdit = (d: ProjectDocument) =>
  `Version ${d.version} by ${byLine(d.editor || "", viaOf(d.client))}`;

const addingDoc = ref(false);
const busy = ref(false);
async function createDocument(name: string, body = "") {
  busy.value = true;
  problem.value = "";
  try {
    const got = await api<{ document: ProjectDocument }>(
      `/v1/projects/${id.value}/documents`,
      json("POST", { name, body }),
    );
    addingDoc.value = false;
    await load();
    if (got?.document)
      await navigateTo({ query: { tab: "documents", doc: got.document.id, edit: "1" } });
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
const writeReadme = () =>
  createDocument(
    "README",
    `# ${project.value?.title || ""}\n\nWhat it is, who uses it, the words we use and how it is built.\n`,
  );

async function onDocGone(message: string) {
  notice.value = message;
  await changed();
  await navigateTo({ query: { tab: "documents" } });
}

// ---- files --------------------------------------------------------------------------------------
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const authHeaders = (): Record<string, string> =>
  token.value ? { authorization: `Bearer ${token.value}` } : {};
async function upload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  problem.value = "";
  try {
    const res = await fetch(`/v1/projects/${id.value}/files`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "content-type": file.type || "application/octet-stream",
        "x-file-name": file.name,
      },
      body: file,
    });
    if (!res.ok) {
      const failed = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(failed.message || "That file couldn't be added.");
    }
    notice.value = `${file.name} is in the project.`;
    await load();
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    uploading.value = false;
    input.value = "";
  }
}
async function download(a: ProjectFile) {
  try {
    const res = await fetch(`/v1/projects/${id.value}/files/${a.id}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("That file couldn't be downloaded.");
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = a.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    problem.value = (err as Error).message;
  }
}
/** The file whose Delete was pressed: its row asks before anything goes. */
const confirmingFile = ref("");
async function removeFile(a: ProjectFile) {
  try {
    await api(`/v1/projects/${id.value}/files/${a.id}`, { method: "DELETE" });
    confirmingFile.value = "";
    notice.value = `Deleted ${a.name}.`;
    await load();
  } catch (err) {
    problem.value = (err as Error).message;
  }
}
const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;

// ---- the header's actions -----------------------------------------------------------------------
const editing = ref(false);
async function saveProject(form: HTMLFormElement) {
  const title = field(form, "title").trim();
  if (!title) return;
  busy.value = true;
  problem.value = "";
  try {
    await api(
      `/v1/projects/${id.value}`,
      json("PATCH", {
        title,
        description: field(form, "description").trim(),
        repo: field(form, "repo").trim(),
        color: field(form, "color"),
      }),
    );
    editing.value = false;
    await load();
    projectsQ.refetch();
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
const sharing = ref(false);
async function share() {
  sharing.value = true;
  problem.value = "";
  try {
    const got = await api<{ url: string }>(`/v1/projects/${id.value}/share`, { method: "POST" });
    if (project.value && got?.url) project.value = { ...project.value, share_url: got.url };
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    sharing.value = false;
  }
}
/** Stop sharing asks in place, under the link, saying what it ends. */
const confirmingStop = ref(false);
async function stopSharing() {
  confirmingStop.value = false;
  sharing.value = true;
  try {
    await api(`/v1/projects/${id.value}/share`, { method: "DELETE" });
    if (project.value) project.value = { ...project.value, share_url: "" };
    notice.value = "This project is no longer shared. The old link stopped working.";
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    sharing.value = false;
  }
}
const deleting = ref(false);
/** Delete asks in place, at the foot of Edit, saying what goes with it and what stays. */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const deleteWhat = computed(() => {
  const parts = [
    documents.value.length && plural(documents.value.length, "document", "documents"),
    files.value.length && plural(files.value.length, "file", "files"),
    children.value.length &&
      plural(children.value.length, "project inside it", "projects inside it"),
  ].filter(Boolean) as string[];
  const what = parts.length ? ` and its ${parts.join(", ").replace(/, ([^,]*)$/, " and $1")}` : "";
  return `Delete ${project.value?.title}${what}? Work in it is kept. This cannot be undone.`;
});
async function remove() {
  const f = project.value;
  if (!f?.manage) return;
  deleting.value = true;
  try {
    await api(`/v1/projects/${id.value}`, { method: "DELETE" });
    await projectsQ.refetch();
    await navigateTo({
      path: parent.value ? `/hub/projects/${parent.value.id}` : "/hub/projects",
      query: parent.value ? {} : { deleted: f.title },
    });
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    deleting.value = false;
  }
}

// ---- work ---------------------------------------------------------------------------------------
/** The row's state, only where its action does not already say it. */
function stateOf(w: ProjectWork): string {
  if (w.stage === "done") return w.outcome === "archived" ? "Archived" : "Finished";
  if (w.stage === "draft") return "Draft";
  // With nobody, the With column already says it is nobody's.
  if (w.stage === "todo") return w.with ? "To do" : "";
  return w.health === "quiet" ? "Went quiet" : w.health === "asking" ? "" : "Working";
}
const verbOf = (w: ProjectWork) => (w.health === "asking" ? "Answer" : "Open");
const plainWords = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function secondLine(w: ProjectWork) {
  const s = plainWords(w.summary);
  const t = plainWords(w.title);
  return !s || s.includes(t) || t.includes(s) ? "" : w.summary;
}

// Work written elsewhere, put into this project. Only work in the project's own space can be.
const linking = ref(false);
const linkId = ref("");
const linkable = computed(() => {
  const here = new Set([...open.value, ...done.value].map((w) => w.id));
  const seen = new Set<string>();
  return [...data.value.work, ...data.value.tasks]
    .filter((g) => {
      if (seen.has(g.id) || here.has(g.id)) return false;
      seen.add(g.id);
      return project.value?.team_id ? g.team === project.value.team_slug : !g.team && g.mine;
    })
    .map((g) => ({ value: g.id, label: g.title || g.id }))
    .sort((a, b) => a.label.localeCompare(b.label));
});
async function link() {
  if (!linkId.value) return;
  problem.value = "";
  try {
    await api(`/v1/projects/${id.value}/work`, json("POST", { work: linkId.value }));
    linkId.value = "";
    linking.value = false;
    await loadView();
  } catch (err) {
    problem.value = (err as Error).message;
  }
}

// ---- history ------------------------------------------------------------------------------------
/** The quiet line under a history row: what kind of thing happened, and what was shown. */
function historyLine(h: ProjectHistoryItem): string {
  if (h.kind === "document")
    return h.version === 1 ? "Document · written" : `Document · version ${h.version}`;
  const shown = [
    h.shots && plural(h.shots, "screenshot", "screenshots"),
    h.checks && plural(h.checks, "check", "checks"),
  ].filter(Boolean);
  return `Finished work${shown.length ? ` · shown with ${shown.join(" and ")}` : ""}`;
}
const historyHref = (h: ProjectHistoryItem) =>
  h.kind === "finished"
    ? `/hub/w/${h.id}`
    : { path: `/hub/projects/${h.project}`, query: { tab: "documents", doc: h.id, v: h.version } };

const label = "font-ui text-[0.6875rem] font-medium tracking-wider text-muted uppercase";
const cols = "@2xl:grid-cols-[minmax(0,1fr)_8rem_7rem_3.5rem_4.75rem]";
const hcols = "@2xl:grid-cols-[minmax(0,1fr)_12rem_3.5rem]";
</script>

<template>
  <HubShell>
    <HubSkeleton v-if="loading && !project" variant="lines" :rows="8" label="Loading the project" />

    <div v-else-if="!project" role="alert" class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
      <div class="min-w-0 grow basis-64">
        <p class="m-0 font-ui text-sm font-semibold text-danger">This project didn't load</p>
        <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ loadError }}</p>
      </div>
      <button class="btn outline danger sm" type="button" @click="refresh">Try again</button>
    </div>

    <div v-else class="flex min-w-0 flex-col gap-6">
      <!-- The project: its line, its name, what it is, and what may be done to it. -->
      <div class="flex flex-col gap-3">
        <NuxtLink v-if="parent" :to="`/hub/projects/${parent.id}`" class="self-start font-ui text-sm text-muted no-underline hover:text-fg">Inside {{ parent.title }}</NuxtLink>
        <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div class="min-w-0">
            <h1 class="m-0 flex items-center gap-3 text-h2 font-medium tracking-tight">
              <span class="project-mark h-3.5 w-[3px] shrink-0 rounded-[1px]" :data-tone="tone" aria-hidden="true" />
              <span class="min-w-0 break-words">{{ project.title }}</span>
            </h1>
            <p v-if="project.description" class="m-0 mt-1 max-w-[44rem] pl-[15px] font-ui text-sm text-muted">{{ project.description }}</p>
            <p class="m-0 mt-1 flex flex-wrap gap-x-2 pl-[15px] font-ui text-xs text-muted">
              <span>{{ space }}</span>
              <template v-if="project.repo"><span aria-hidden="true">·</span><span>Repo <span class="font-code text-fg">{{ project.repo }}</span></span></template>
            </p>
          </div>
          <div v-if="!editing" class="flex flex-wrap gap-2">
            <button class="btn sm" type="button" @click="editing = true">Edit</button>
            <button v-if="!project.share_url" class="btn sm" type="button" :disabled="sharing" @click="share">{{ sharing ? "Sharing…" : "Share" }}</button>
          </div>
        </div>

        <form v-if="editing" class="flex flex-col gap-3 rounded-3 border border-line bg-raised px-4 py-4" @submit.prevent="saveProject($event.target as HTMLFormElement)" @keydown.esc="editing = false">
          <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <label class="flex flex-col gap-2 font-ui text-sm">
              <span class="text-muted">Name</span>
              <input name="title" maxlength="100" :value="project.title" required />
            </label>
            <label class="flex flex-col gap-2 font-ui text-sm">
              <span class="text-muted">What it is, in a line</span>
              <input name="description" maxlength="400" :value="project.description" />
            </label>
            <label class="flex flex-col gap-2 font-ui text-sm md:col-span-2">
              <span class="text-muted">Repo <span class="text-muted">· if it has one</span></span>
              <input name="repo" maxlength="200" class="code-field" spellcheck="false" :value="project.repo || ''" placeholder="github.com/acme/billing" />
            </label>
          </div>
          <fieldset class="m-0 flex flex-wrap items-center gap-2 border-0 p-0 font-ui text-sm">
            <legend class="mb-2 p-0 text-muted">Line colour</legend>
            <label class="chip-pick">
              <input type="radio" name="color" value="" :checked="!TONES.includes(project.color as never)" />
              <span>From its name</span>
            </label>
            <label v-for="t in TONES" :key="t" class="chip-pick">
              <input type="radio" name="color" :value="t" :checked="project.color === t" />
              <span class="project-mark h-3.5 w-[3px] rounded-[1px]" :data-tone="t" aria-hidden="true" />
              <span class="capitalize">{{ t }}</span>
            </label>
          </fieldset>
          <div class="flex gap-2">
            <button class="btn primary sm" type="submit" :disabled="busy">Save</button>
            <button class="btn sm" type="button" @click="editing = false; confirmingDelete = false">Cancel</button>
          </div>
          <!-- The one danger here, at the foot, asking in place and saying what goes. -->
          <div v-if="project.manage" class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
            <button v-if="!confirmingDelete" class="btn sm outline danger" type="button" @click="confirmingDelete = true">Delete project…</button>
            <template v-else>
              <p class="m-0 min-w-0 grow font-ui text-sm" role="alert">{{ deleteWhat }}</p>
              <button class="btn sm outline danger" type="button" :disabled="deleting" @click="remove">{{ deleting ? "Deleting…" : "Delete" }}</button>
              <button class="btn sm" type="button" @click="confirmingDelete = false">Keep it</button>
            </template>
          </div>
        </form>

        <div v-if="project.share_url" class="flex flex-col gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <label class="sr-only" for="share-url">Share link</label>
            <input id="share-url" class="min-w-0 flex-1 font-code text-xs" :value="project.share_url" readonly @focus="($event.target as HTMLInputElement).select()" />
            <button class="btn" type="button" @click="copy(project.share_url || '', $event.currentTarget)"><AppIcon name="copy" /><span data-label>Copy link</span></button>
            <button class="btn outline danger" type="button" :disabled="sharing" :aria-expanded="confirmingStop" @click="confirmingStop = !confirmingStop">Stop sharing…</button>
          </div>
          <div v-if="confirmingStop" class="flex flex-wrap items-center gap-x-3 gap-y-2" role="alert">
            <p class="m-0 min-w-0 grow font-ui text-sm">Stop sharing {{ project.title }}? Everyone with the link loses access, and a new link will be different.</p>
            <button class="btn sm outline danger" type="button" :disabled="sharing" @click="stopSharing">Stop sharing</button>
            <button class="btn sm" type="button" @click="confirmingStop = false">Keep sharing</button>
          </div>
          <p class="m-0 font-ui text-xs text-muted">Anyone with this link can read this project's documents and download its files, without an account. Its work is not included.</p>
        </div>
      </div>

      <p v-if="notice" role="status" class="m-0 font-ui text-sm">{{ notice }}</p>
      <p v-if="problem" role="alert" class="m-0 rounded-2 border border-danger bg-danger-soft px-4 py-3 font-ui text-sm text-danger">{{ problem }}</p>

      <nav class="flex gap-6 border-b border-line" aria-label="Project">
        <NuxtLink
          v-for="t in TABS"
          :key="t.key"
          :to="{ query: { tab: t.key } }"
          class="tab -mb-px flex items-baseline gap-2 border-b-2 py-2 font-ui text-sm no-underline"
          :class="tab === t.key ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg'"
          :aria-current="tab === t.key ? 'page' : undefined"
        >
          {{ t.label }}
          <span v-if="t.key === 'work' && open.length" class="text-xs text-muted tabular-nums">{{ open.length }}</span>
        </NuxtLink>
      </nav>

      <!-- ============================== Documents ============================== -->
      <template v-if="tab === 'documents'">
        <HubProjectDocument
          v-if="docId"
          :key="docId"
          :project="id"
          :space="project.team_id"
          :doc="docId"
          :row="documents.find((d) => d.id === docId)"
          :version="version"
          :start-editing="route.query.edit === '1'"
          @changed="changed"
          @gone="onDocGone"
        />

        <template v-else>
          <!-- Nothing written down yet: the agent writes it, or you do. -->
          <section v-if="!documents.length" class="flex flex-col gap-4 pt-2 pb-8" aria-labelledby="nodocs-h">
            <p id="nodocs-h" class="m-0 text-h3 font-medium">Nothing written down yet.</p>
            <p class="m-0 max-w-[40rem] font-ui text-sm text-muted">
              Start with the README: what this product is, who uses it, the words the team uses and how
              it is built. Agents read it before they take work here and keep it up to date.
            </p>
            <div class="flex max-w-[44rem] flex-wrap items-center gap-3 rounded-2 border border-line bg-field px-4 py-3">
              <p class="m-0 min-w-0 flex-1 font-ui text-sm">“{{ ask }}”</p>
              <button class="btn sm" type="button" @click="copy(ask, $event.currentTarget)"><span data-label>Copy</span></button>
            </div>
            <button class="btn sm self-start" type="button" :disabled="busy" @click="writeReadme">Write it yourself</button>
          </section>

          <template v-else>
            <!-- The README first: what this product is. -->
            <section v-if="readme" class="flex flex-col gap-3 rounded-3 border border-line bg-raised px-5 pt-4 pb-5" aria-labelledby="readme-h">
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-fg pb-2">
                <h2 id="readme-h" class="m-0 flex items-baseline gap-2 font-ui text-sm font-semibold tracking-normal">
                  README
                  <span v-if="readmeRow?.changed" class="text-xs font-medium text-changed">Changed · {{ readmeRow.changed }}</span>
                </h2>
                <span class="flex items-baseline gap-3 font-ui text-xs text-muted">
                  <span v-if="readmeRow">{{ lastEdit(readmeRow) }} · <span class="tabular-nums">{{ age(readmeRow.updated, now) }}</span></span>
                  <NuxtLink :to="{ query: { tab: 'documents', doc: readme.id } }" class="btn sm">Open</NuxtLink>
                </span>
              </div>
              <!-- Sanitised by renderProjectMarkdown before it reaches v-html. -->
              <template v-if="readmeParts.all.trim()">
                <div class="overflow-x-auto"><div class="prose project-prose" v-html="readmeHtml" /></div>
                <button v-if="readmeParts.rest" class="btn sm self-start" type="button" :aria-expanded="readAll" @click="readAll = !readAll">{{ readAll ? "Show less" : "Read all" }}</button>
              </template>
              <p v-else class="m-0 font-ui text-sm text-muted">The README is empty. Open it to write what this product is.</p>
            </section>
            <section v-else class="flex flex-wrap items-center gap-3 rounded-3 border border-line bg-raised px-4 py-3" aria-label="No README yet">
              <p class="m-0 min-w-0 grow font-ui text-sm"><span class="font-medium">No README yet.</span> <span class="text-muted">It says what this product is, for every person and agent who works on it.</span></p>
              <button class="btn sm" type="button" @click="copy(ask, $event.currentTarget)"><span data-label>Copy the ask for your agent</span></button>
              <button class="btn sm" type="button" :disabled="busy" @click="writeReadme">Write it yourself</button>
            </section>

            <section class="@container flex flex-col" aria-labelledby="docs-h">
              <div class="flex items-baseline justify-between gap-3 pb-2">
                <h2 id="docs-h" class="m-0 font-ui text-sm font-semibold tracking-normal">Documents</h2>
                <button class="btn sm" type="button" :aria-expanded="addingDoc" @click="addingDoc = !addingDoc">New document</button>
              </div>
              <form v-if="addingDoc" class="mb-3 flex flex-wrap gap-2" @submit.prevent="createDocument(field($event.target as HTMLFormElement, 'name').trim())">
                <label class="sr-only" for="new-doc">Document name</label>
                <input id="new-doc" name="name" class="min-w-0 flex-1" maxlength="120" placeholder="Pricing, Setup, Log…" required />
                <button class="btn primary" type="submit" :disabled="busy">Add</button>
                <button class="btn" type="button" @click="addingDoc = false">Cancel</button>
              </form>
              <div v-if="others.length" aria-hidden="true" class="hidden grid-cols-[minmax(0,1fr)_16rem_3.5rem] gap-x-3 border-b border-fg pb-2 pl-4 @2xl:grid" :class="label">
                <span>Document</span><span>Last edit</span><span class="text-right">When</span>
              </div>
              <ol v-if="others.length" class="m-0 list-none border-t border-fg p-0 @2xl:border-t-0">
                <li v-for="d in others" :key="d.id" class="relative flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line py-3 pl-4 @2xl:grid @2xl:grid-cols-[minmax(0,1fr)_16rem_3.5rem]">
                  <span v-if="d.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
                  <p class="m-0 flex min-w-0 grow basis-full flex-wrap items-baseline gap-x-2 font-ui text-sm @2xl:basis-auto">
                    <NuxtLink :to="{ query: { tab: 'documents', doc: d.id } }" class="font-medium break-words text-fg no-underline hover:underline">{{ d.name }}</NuxtLink>
                    <span v-if="d.changed" class="text-xs font-medium text-changed">Changed · {{ d.changed }}</span>
                  </p>
                  <span class="min-w-0 font-ui text-xs break-words text-muted @2xl:text-sm @2xl:text-fg">{{ lastEdit(d) }}<span class="tabular-nums @2xl:hidden"> · {{ age(d.updated, now) }}</span></span>
                  <span class="hidden font-ui text-sm text-fg tabular-nums @2xl:block @2xl:text-right">{{ age(d.updated, now) }}</span>
                </li>
              </ol>
              <p v-else class="m-0 border-t border-fg py-3 font-ui text-sm text-muted">Only the README so far. A page per area — setup, pricing, a Log of what changed — goes here.</p>
            </section>
          </template>

          <!-- Projects inside this one, there to reach rather than to lead. -->
          <section v-if="children.length" class="flex flex-col" aria-labelledby="inside-h">
            <h2 id="inside-h" class="m-0 border-b border-fg pb-2 font-ui text-sm font-semibold tracking-normal">Inside this project</h2>
            <ul class="m-0 list-none p-0">
              <li v-for="c in children" :key="c.id" class="flex items-baseline gap-3 border-b border-line py-2 font-ui text-sm">
                <NuxtLink :to="`/hub/projects/${c.id}`" class="min-w-0 grow break-words text-fg no-underline hover:underline">{{ c.title }}</NuxtLink>
                <span class="shrink-0 text-xs text-muted tabular-nums">{{ c.documents || 0 }} {{ c.documents === 1 ? "document" : "documents" }}</span>
              </li>
            </ul>
          </section>

          <section class="flex flex-col" aria-labelledby="files-h">
            <div class="flex items-baseline justify-between gap-3 border-b border-fg pb-2">
              <h2 id="files-h" class="m-0 font-ui text-sm font-semibold tracking-normal">Files</h2>
              <button class="btn sm" type="button" :disabled="uploading" @click="fileInput?.click()">{{ uploading ? "Adding…" : "Add a file" }}</button>
            </div>
            <input ref="fileInput" class="sr-only" type="file" tabindex="-1" aria-hidden="true" accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.zip,.md,.txt,.csv,.json" @change="upload" />
            <ul v-if="files.length" class="m-0 list-none p-0">
              <template v-for="a in files" :key="a.id">
              <li class="flex items-center gap-3 border-b border-line py-2">
                <HubProjectFilePreview :project="id" :file="a.id" :type="a.type" :name="a.name" />
                <div class="min-w-0 grow">
                  <button class="max-w-full cursor-pointer border-0 bg-transparent p-0 text-left font-ui text-sm break-all text-fg underline" type="button" @click="download(a)">{{ a.name }}</button>
                  <span class="block font-ui text-xs text-muted tabular-nums">{{ size(a.bytes) }} · {{ age(a.created, now) }}</span>
                </div>
                <button v-if="confirmingFile !== a.id" class="btn sm" type="button" :aria-label="`Delete ${a.name}`" @click="confirmingFile = a.id">Delete</button>
              </li>
              <li v-if="confirmingFile === a.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-2" role="alert">
                <p class="m-0 min-w-0 grow font-ui text-sm">Delete {{ a.name }} from this project? It cannot be brought back.</p>
                <button class="btn sm outline danger" type="button" @click="removeFile(a)">Delete</button>
                <button class="btn sm" type="button" @click="confirmingFile = ''">Keep it</button>
              </li>
              </template>
            </ul>
            <p v-else class="m-0 py-3 font-ui text-sm text-muted">Screenshots, references and source files, up to 10 MB each.</p>
          </section>
        </template>
      </template>

      <!-- ================================ Work ================================= -->
      <section v-else-if="tab === 'work'" class="@container flex min-w-0 flex-col gap-8" aria-label="Work">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="m-0 font-ui text-sm text-muted">{{ open.length || done.length ? "Say what needs doing and the agent files it here, for the right people." : "" }}</p>
          <div class="flex flex-wrap gap-2">
            <button class="btn sm" type="button" :aria-expanded="linking" @click="linking = !linking">Add existing work</button>
            <NuxtLink :to="{ path: '/hub/new', query: { project: id } }" class="btn primary sm">New work</NuxtLink>
          </div>
        </div>
        <form v-if="linking" class="-mt-4 flex flex-wrap gap-2" @submit.prevent="link">
          <AppSelect v-model="linkId" class="min-w-0 flex-1" label="Work to add" placeholder="Choose work" :options="linkable" :disabled="!linkable.length" :short-at="40" />
          <button class="btn" type="submit" :disabled="!linkId">Add</button>
        </form>

        <HubSkeleton v-if="viewLoading" :rows="4" label="Loading the work" />
        <div v-else-if="viewError" role="alert" class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
          <div class="min-w-0 grow basis-64">
            <p class="m-0 font-ui text-sm font-semibold text-danger">The work didn't load</p>
            <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ viewError }}</p>
          </div>
          <button class="btn outline danger sm" type="button" @click="loadView">Try again</button>
        </div>
        <!-- Nothing in it at all: one statement, not an empty Open over an empty Done. -->
        <div v-else-if="!open.length && !done.length" class="flex flex-col gap-2 pt-2 pb-6">
          <p class="m-0 text-h3 font-medium">No work in this project yet.</p>
          <p class="m-0 max-w-[40rem] font-ui text-sm text-muted">New work files it here, for the right people. Work already written somewhere else can be added to it.</p>
        </div>
        <template v-else>
          <section v-for="group in [{ key: 'open', title: 'Open', rows: open }, { key: 'done', title: 'Done recently', rows: done }]" :key="group.key" :aria-labelledby="`${group.key}-h`">
            <h2 :id="`${group.key}-h`" class="m-0 pb-2 font-ui text-sm font-semibold tracking-normal">{{ group.title }}</h2>
            <template v-if="group.rows.length">
              <div aria-hidden="true" class="hidden gap-x-3 border-b border-fg pb-2 pl-4 @2xl:grid" :class="[cols, label]">
                <span>Work</span><span>With</span><span>State</span><span class="text-right">Age</span><span />
              </div>
              <ol class="m-0 list-none border-t border-fg p-0 @2xl:border-t-0">
                <li v-for="w in group.rows" :key="w.id" class="relative flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line py-3 pl-4 @2xl:grid @2xl:items-baseline" :class="cols">
                  <span v-if="w.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
                  <div class="min-w-0 grow basis-[calc(100%-6rem)] @2xl:basis-auto">
                    <p class="m-0 flex flex-wrap items-baseline gap-x-2 font-ui text-sm">
                      <NuxtLink :to="`/hub/w/${w.id}`" class="font-medium text-fg no-underline hover:underline">{{ w.title || "Untitled" }}</NuxtLink>
                      <span v-if="w.changed" class="text-xs font-medium text-changed">Changed · {{ w.changed }}</span>
                    </p>
                    <p v-if="secondLine(w)" class="m-0 mt-0.5 font-ui text-xs text-muted">{{ secondLine(w) }}</p>
                  </div>
                  <NuxtLink :to="`/hub/w/${w.id}`" class="btn sm order-1 shrink-0 @2xl:order-none @2xl:col-start-5 @2xl:row-start-1 @2xl:justify-self-end">{{ verbOf(w) }}</NuxtLink>
                  <span class="order-2 min-w-0 font-ui text-xs break-words text-muted @2xl:order-none @2xl:col-start-2 @2xl:row-start-1 @2xl:text-sm @2xl:text-fg">{{ w.with || "Nobody" }}</span>
                  <span class="order-2 font-ui text-xs @2xl:order-none @2xl:col-start-3 @2xl:row-start-1 @2xl:text-sm" :class="w.health === 'quiet' ? 'font-medium text-fg' : 'text-muted'">
                    <template v-if="stateOf(w)"><span class="@2xl:hidden" aria-hidden="true">· </span>{{ stateOf(w) }}</template>
                  </span>
                  <span class="order-2 font-ui text-xs text-muted tabular-nums @2xl:order-none @2xl:col-start-4 @2xl:row-start-1 @2xl:text-right @2xl:text-sm @2xl:text-fg">
                    <span class="@2xl:hidden" aria-hidden="true">· </span>{{ age(w.since, now) }}
                  </span>
                </li>
              </ol>
            </template>
            <div v-else-if="group.key === 'open'" class="flex flex-col gap-2 border-t border-fg py-6">
              <p class="m-0 text-h3 font-medium">No open work here.</p>
              <p class="m-0 max-w-[40rem] font-ui text-sm text-muted">New work files it in this project. Work already written somewhere else can be added to it.</p>
            </div>
            <p v-else class="m-0 border-t border-fg py-3 font-ui text-sm text-muted">Nothing finished in the last two weeks.</p>
          </section>
        </template>
      </section>

      <!-- =============================== History =============================== -->
      <section v-else class="flex min-w-0 flex-col" aria-labelledby="history-h">
        <h2 id="history-h" class="sr-only">History</h2>
        <HubSkeleton v-if="viewLoading" variant="lines" :rows="6" label="Loading the history" />
        <div v-else-if="viewError" role="alert" class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
          <div class="min-w-0 grow basis-64">
            <p class="m-0 font-ui text-sm font-semibold text-danger">The history didn't load</p>
            <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ viewError }}</p>
          </div>
          <button class="btn outline danger sm" type="button" @click="loadView">Try again</button>
        </div>
        <div v-else-if="!history.length" class="flex flex-col gap-2 pt-2 pb-6">
          <p class="m-0 text-h3 font-medium">Nothing has happened here yet.</p>
          <p class="m-0 max-w-[40rem] font-ui text-sm text-muted">Work finished in this project and every version of its documents land here, newest first, with who did it.</p>
        </div>
        <div v-else class="@container">
          <div aria-hidden="true" class="hidden gap-x-3 border-b border-fg pb-2 pl-4 @2xl:grid" :class="[hcols, label]">
            <span>What</span><span>By</span><span class="text-right">Age</span>
          </div>
          <ol class="m-0 list-none border-t border-fg p-0 @2xl:border-t-0">
            <li v-for="h in history" :key="`${h.kind}-${h.id}-${h.version}`" class="relative flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line py-3 pl-4 @2xl:grid" :class="hcols">
              <span v-if="h.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
              <div class="min-w-0 grow basis-full @2xl:basis-auto">
                <p class="m-0 flex flex-wrap items-baseline gap-x-2 font-ui text-sm">
                  <NuxtLink :to="historyHref(h)" class="font-medium break-words text-fg no-underline hover:underline">{{ h.title || "Untitled" }}</NuxtLink>
                  <span v-if="h.changed" class="text-xs font-medium text-changed">Changed · {{ h.changed }}</span>
                </p>
                <p class="m-0 mt-0.5 font-ui text-xs text-muted">{{ historyLine(h) }}</p>
                <p v-if="h.note" class="m-0 mt-0.5 font-ui text-xs text-muted">“{{ h.note }}”</p>
              </div>
              <span class="min-w-0 font-ui text-xs break-words text-muted @2xl:text-sm @2xl:text-fg">{{ byLine(h.by, h.via) }}<span class="tabular-nums @2xl:hidden"> · {{ age(h.at, now) }}</span></span>
              <span class="hidden font-ui text-sm text-fg tabular-nums @2xl:block @2xl:text-right">{{ age(h.at, now) }}</span>
            </li>
          </ol>
        </div>
      </section>
    </div>
  </HubShell>
</template>

<style scoped>
/* A document's headings sit below the page's own, in order. */
.project-prose {
  max-width: 46rem;
  font-family: var(--font-sans);
  font-size: 0.9375rem;
  line-height: 1.65;
}
.project-prose :deep(h1) {
  margin: 0 0 var(--s-3);
  font: 500 1.125rem / 1.4 var(--font-sans);
  letter-spacing: -0.015em;
}
.project-prose :deep(h2) {
  margin: var(--s-5) 0 var(--s-2);
  font: 550 1rem / 1.4 var(--font-sans);
  letter-spacing: -0.01em;
}
.project-prose :deep(h3) {
  margin: var(--s-4) 0 var(--s-2);
  font: 550 0.875rem / 1.4 var(--font-sans);
  letter-spacing: 0;
}
.project-prose :deep(h2:first-child),
.project-prose :deep(h3:first-child) {
  margin-top: 0;
}
</style>
