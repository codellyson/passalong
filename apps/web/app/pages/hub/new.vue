<!--
  The box (docs/LOOP.md §0 and §1a): a place to make work without an agent of your own. Write or
  paste anything; the agent — the reader — names it, picks its project, sends it to one of the
  team's groups and files it, with no confirm step. Writing is the page: one editor, and beside it
  the agent's reading as a fact strip, refreshed as you write — what it will be called, which
  project, who it goes to and why, what already looks like it. Unsure, it still files its best
  reading and says what to check. Filed, the page turns into a confirmation with Open, Move and
  Undo in place, and the last few filings below.
-->
<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import type { Guide } from "~/types/hub";
import { age, byLine, toneOf } from "~/utils/projects";
import { shorten } from "~/utils/shorten";

usePage({
  title: "What do you need? · Passalong",
  description: "Say what you need; Passalong's agent files it for the right team.",
  noindex: true,
});
const { api, json, data } = useHub();
const queryClient = useQueryClient();
/** The rail counts each project's open work: what this page files, moves or undoes changes it. */
const recount = () => queryClient.invalidateQueries({ queryKey: hubKeys.projects });

const teams = computed(() => data.value.me?.teams ?? []);
const team = ref("");
const teamName = computed(
  () => teams.value.find((t) => t.slug === team.value)?.name || team.value || "",
);

type Project = { id: string; title: string; color?: string };

/**
 * Opened from a project (`?project=<id>`): the work goes into that project, for its team, and the
 * reader is not asked to choose one. The server checks the writer can see it.
 */
const preset = ref<(Project & { team: string }) | null>(null);
const projectId = String(useRoute().query.project || "");
onMounted(async () => {
  if (!projectId) return;
  const got = await api<{
    folder: { id: string; title: string; color?: string; team_slug?: string };
  }>(`/v1/folders/${encodeURIComponent(projectId)}`).catch(() => null);
  if (!got) return;
  preset.value = { ...got.folder, team: got.folder.team_slug || "" };
  team.value = preset.value.team;
});
watchEffect(() => {
  if (!team.value && !projectId) team.value = data.value.team?.slug || teams.value[0]?.slug || "";
});

/** What is written, as markdown from the editor; pictures travel inline in it. */
const text = ref("");
const writer = ref<{
  addPicture: (f: File) => Promise<void>;
  clear: () => void;
  insert: (t: string) => void;
} | null>(null);
const busy = ref(false);
const uploading = ref(false);
const problem = ref("");
/** Said once after an undo: "" when nothing was undone, else what holds now. */
const undone = ref("");
/** The server has no reader: the box cannot file anything, and says so before anyone writes. */
const offline = ref(false);

const STARTERS = [
  { label: "Something's broken", text: "Something's broken: " },
  { label: "We need something built", text: "We need " },
  { label: "A customer asked…", text: "A customer asked " },
];

interface Filed {
  id: string;
  tag: string;
  title: string;
  summary: string;
  route: { slug: string; name: string } | null;
  reason: string;
  /** What the reader was not sure of, filed anyway; "" when it was sure. */
  unsure: string;
  groups: { slug: string; name: string }[];
  project: Project | null;
  projects: Project[];
}
const filed = ref<Filed | null>(null);
/** The filing just made, so its row settles into the register rather than popping in. */
const justFiled = ref("");
/** Who it is for now, as an address: `#group`, `@handle`, or "" for the whole team. */
const filedTo = ref("");
const moving = ref(false);

async function attach(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  if (!files.length) return;
  uploading.value = true;
  problem.value = "";
  try {
    for (const f of files.slice(0, 5)) await writer.value?.addPicture(f);
  } finally {
    uploading.value = false;
  }
}

/** The team's people and groups, for `@` and `#` in the editor and for naming who it went to. */
const people = ref<{ handle: string; name: string }[]>([]);
const groups = ref<{ slug: string; name: string }[]>([]);
watch(
  team,
  async (slug) => {
    people.value = [];
    groups.value = [];
    if (!slug) return;
    const [t, g] = await Promise.all([
      api<{ members: { handle: string; name: string }[] }>(`/v1/teams/${slug}`).catch(() => null),
      api<{ groups: { slug: string; name: string }[] }>(`/v1/teams/${slug}/groups`).catch(
        () => null,
      ),
    ]);
    people.value = (t?.members ?? []).filter((m) => m.handle);
    groups.value = g?.groups ?? [];
  },
  { immediate: true },
);

/**
 * Read as it is written: a moment after typing stops, the agent says what this would become —
 * nothing is filed — and what already on the board looks like it, so nothing is filed twice.
 */
interface Preview {
  title: string;
  tag: string;
  route: { slug: string; name: string } | null;
  project: Project | null;
  reason: string;
  question: string;
}
const preview = ref<Preview | null>(null);
const reading = ref(false);
/** Work already on the board that looks like it, each with the facts that tell same titles apart. */
interface Related {
  id: string;
  title: string;
  project: Project | null;
  /** Who holds it, or where it stands. */
  where: string;
  at: string;
}
const related = ref<Related[]>([]);
const STAGE: Record<string, string> = {
  draft: "Draft",
  todo: "To do",
  working: "In progress",
  done: "Done",
};
const relatedOf = (g: Guide): Related => {
  const h = g.held_by?.[0];
  return {
    id: g.id,
    title: g.title || "",
    project: g.project ?? null,
    where: h ? `With ${byLine(h.name, h.agent ? "agent" : "")}` : STAGE[g.stage || ""] || "",
    at: g.updated || g.created,
  };
};
let timer: ReturnType<typeof setTimeout> | undefined;
let asked = 0;
/** Pictures alone are enough to read; words need a sentence first, as the server says. */
const readable = computed(
  () =>
    /\/v1\/shots\//.test(text.value) ||
    text.value.replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim().length >= 20,
);
watch([text, team], () => {
  clearTimeout(timer);
  undone.value = "";
  if (filed.value || offline.value) return;
  if (!readable.value) {
    asked++;
    reading.value = false;
    preview.value = null;
    related.value = [];
    return;
  }
  reading.value = true;
  timer = setTimeout(async () => {
    const mine = ++asked;
    try {
      const got = await api<{ preview: Preview | null }>(
        "/v1/compose/preview",
        json("POST", { text: text.value, team: team.value, project: preset.value?.id }),
      );
      if (mine !== asked) return;
      preview.value = got?.preview ?? null;
      const q = preview.value?.title || "";
      const found = q
        ? await api<{ guides: Guide[] }>(
            `/v1/guides?q=${encodeURIComponent(q.split(" ").slice(0, 4).join(" "))}&scope=${encodeURIComponent(team.value || "all")}`,
          ).catch(() => null)
        : null;
      if (mine === asked)
        related.value = (found?.guides ?? [])
          .filter((g) => g.status !== "consumed")
          .slice(0, 3)
          .map(relatedOf);
    } catch (err) {
      if (mine !== asked) return;
      preview.value = null;
      if (/isn't set up/.test((err as Error).message)) offline.value = true;
    } finally {
      if (mine === asked) reading.value = false;
    }
  }, 900);
});
onBeforeUnmount(() => clearTimeout(timer));

/** Whether this server has a reader: an empty preview answers 501 before it reads anything. */
onMounted(() =>
  api("/v1/compose/preview", json("POST", { text: "" })).catch((err: Error) => {
    if (/isn't set up/.test(err.message)) offline.value = true;
  }),
);

/** What the person gave it that is kept as it came: the agent says so, so nobody wonders. */
const kept = computed(() =>
  [
    /```/.test(text.value) && "your error as it came",
    /!\[[^\]]*\]\([^)]*\/v1\/shots\//.test(text.value) && "your pictures",
  ].filter((s): s is string => Boolean(s)),
);

/** Where the agent is, in a few words at the panel's head. */
const state = computed(() =>
  offline.value
    ? "Not set up"
    : busy.value
      ? "Filing…"
      : reading.value
        ? "Reading…"
        : preview.value?.question
          ? "Not sure"
          : preview.value
            ? "Ready to file"
            : "Waiting for you",
);

/** What the agent filed for this account here, newest first. */
interface Recent {
  id: string;
  title: string;
  created: string;
  routed: string;
  project_id: string;
  project: string;
  project_color: string;
  team_name: string;
}
const recent = ref<Recent[]>([]);
const loadRecent = () =>
  api<{ filed: Recent[] }>("/v1/compose/recent")
    .then((r) => (recent.value = r?.filed ?? []))
    .catch(() => {});
onMounted(loadRecent);
const now = ref(Date.now());
/** The filing shortcut as this keyboard says it. */
const mod = ref("Ctrl");
onMounted(() => {
  if (/Mac|iPhone|iPad/.test(navigator.platform)) mod.value = "⌘";
});

/**
 * What a phone shared to Passalong (`share_target` in site.webmanifest): the service worker keeps
 * it in this browser and sends the page here with `?shared=1`; once the editor is up, the words go
 * in and each picture uploads as if pasted, and the kept copy is emptied.
 */
const route = useRoute();
const router = useRouter();
const stopShared = watch(writer, async (w) => {
  if (!w || route.query.shared !== "1" || !("caches" in window)) return;
  stopShared();
  const cache = await caches.open("passalong-shared");
  const words = await (await cache.match("/shared/text"))?.text();
  if (words) w.insert(`${words} `);
  uploading.value = true;
  try {
    for (const key of await cache.keys()) {
      if (!new URL(key.url).pathname.startsWith("/shared/file/")) continue;
      const res = await cache.match(key);
      if (!res) continue;
      const name = decodeURIComponent(res.headers.get("x-name") || "picture");
      await w.addPicture(
        new File([await res.blob()], name, {
          type: res.headers.get("content-type") || "image/png",
        }),
      );
    }
  } finally {
    uploading.value = false;
    await caches.delete("passalong-shared");
    const { shared: _, ...rest } = route.query;
    router.replace({ query: rest });
  }
});

async function file() {
  if (!text.value.trim() || busy.value || offline.value || filed.value) return;
  busy.value = true;
  problem.value = "";
  undone.value = "";
  try {
    const got = await api<Filed>(
      "/v1/compose",
      json("POST", { text: text.value, team: team.value, project: preset.value?.id }),
    );
    if (got) {
      filed.value = got;
      justFiled.value = got.id;
      recount();
      filedTo.value = got.route ? `#${got.route.slug}` : "";
      now.value = Date.now();
      loadRecent();
    }
  } catch (err) {
    problem.value = (err as Error).message;
    if (/isn't set up/.test(problem.value)) offline.value = true;
  } finally {
    busy.value = false;
  }
}

/** ⌘/Ctrl+Enter files, caught before the editor can turn it into a line break. */
function shortcut(e: KeyboardEvent) {
  if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
  e.preventDefault();
  e.stopPropagation();
  file();
}

/** Into another project, or none: out of the one it is in, then into the new one. */
async function moveProject(to: string) {
  const f = filed.value;
  if (!f || to === (f.project?.id ?? "")) return;
  problem.value = "";
  try {
    if (to)
      await api(`/v1/folders/${encodeURIComponent(to)}/guides`, json("POST", { guide: f.id }));
    if (f.project)
      await api(`/v1/folders/${encodeURIComponent(f.project.id)}/guides/${f.id}`, {
        method: "DELETE",
      });
    filed.value = { ...f, project: f.projects.find((p) => p.id === to) ?? null };
    recount();
    loadRecent();
  } catch (err) {
    problem.value = (err as Error).message;
  }
}

function gave(to?: string) {
  if (to !== undefined) filedTo.value = to;
  loadRecent();
}

/** Undo deletes what was filed and puts the writer back as it was, words and pictures kept. */
async function undo() {
  if (!filed.value) return;
  problem.value = "";
  try {
    const got = await api<{ told?: number }>(`/v1/guides/${filed.value.id}`, {
      method: "DELETE",
    });
    const told = got?.told ?? 0;
    filed.value = null;
    moving.value = false;
    recount();
    // Its unread feed lines go with it; mail and phone alerts already sent cannot be recalled.
    undone.value = `Undone: it's deleted. Your words are still here.${
      told
        ? ` ${told === 1 ? "1 person" : `${told} people`} may already have been told by email or on their phone.`
        : ""
    }`;
    loadRecent();
  } catch (err) {
    problem.value = (err as Error).message;
  }
}

function again() {
  filed.value = null;
  moving.value = false;
  undone.value = "";
  preview.value = null;
  related.value = [];
  writer.value?.clear();
  text.value = "";
}

/** Who it went to, in words: a group's name, a person's name, or the whole team. */
const whoFor = computed(() => {
  const to = filedTo.value;
  if (to.startsWith("#")) {
    const g = [...(filed.value?.groups ?? []), ...groups.value].find((x) => `#${x.slug}` === to);
    return g?.name || to;
  }
  if (to.startsWith("@")) return people.value.find((p) => `@${p.handle}` === to)?.name || to;
  return everyone(teamName.value);
});
/** One phrase for "the whole team", on every line of this page and as Give to says it. */
const everyone = (team: string) => (team ? `Everyone in ${team}` : "Only you");
const previewFor = computed(() =>
  preview.value?.route
    ? preview.value.route.name || `#${preview.value.route.slug}`
    : everyone(teamName.value),
);
/** The project the preview shows: the page's own when opened from one, else the reader's. */
const previewProject = computed(() => preset.value ?? preview.value?.project ?? null);

const label = "m-0 font-ui text-[0.6875rem] font-medium tracking-wider text-muted uppercase";
const fact = "flex flex-col gap-1 border-b border-line py-3 last:border-b-0";
const cols = "@2xl:grid-cols-[minmax(0,1fr)_9rem_9rem_3.5rem]";
</script>

<template>
  <HubShell>
    <div class="flex flex-col gap-10">
      <!-- Filed: the page says what happened, where it went, and the three ways to change that. -->
      <section v-if="filed" class="settle flex flex-col gap-5" aria-labelledby="filed-h" aria-live="polite">
        <div class="flex flex-col gap-2 border-b border-fg pb-4">
          <h1 id="filed-h" class="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-h2 font-medium tracking-tight">
            <span class="min-w-0 break-words"><span class="text-muted">Filed:</span> {{ filed.title }}</span>
            <HubWorkTag :tags="[filed.tag]" class="relative -top-0.5" />
          </h1>
          <p v-if="filed.summary" class="m-0 max-w-[42rem] font-ui text-sm text-muted">{{ filed.summary }}</p>
        </div>

        <dl class="m-0 grid gap-x-8 gap-y-3 font-ui text-sm sm:grid-cols-[repeat(3,minmax(0,max-content))]">
          <div class="flex flex-col gap-1">
            <dt :class="label">Project</dt>
            <dd class="m-0 flex items-baseline gap-2">
              <template v-if="filed.project">
                <span class="project-mark h-3.5 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf(filed.project)" aria-hidden="true" />
                <NuxtLink :to="`/hub/projects/${filed.project.id}?tab=work`" class="break-words text-fg">{{ filed.project.title }}</NuxtLink>
              </template>
              <span v-else class="text-muted">Not in a project</span>
            </dd>
          </div>
          <div class="flex flex-col gap-1">
            <dt :class="label">For</dt>
            <dd class="m-0 break-words">{{ whoFor }}</dd>
          </div>
          <div v-if="filed.reason" class="flex flex-col gap-1">
            <dt :class="label">Why</dt>
            <dd class="m-0 max-w-[28rem] break-words text-muted">{{ filed.reason }}</dd>
          </div>
        </dl>

        <p v-if="filed.unsure" class="m-0 flex max-w-[42rem] items-baseline gap-2 border-y border-line py-3 font-ui text-sm">
          <span class="size-2 shrink-0 self-center rounded-full bg-warn" aria-hidden="true" />
          <span><span class="font-medium">Worth checking:</span> {{ filed.unsure }}</span>
        </p>

        <div class="flex flex-wrap items-center gap-2">
          <NuxtLink :to="`/hub/g/${filed.id}`" class="btn primary no-underline">Open it</NuxtLink>
          <button type="button" class="btn" @click="again">Write another</button>
          <button type="button" class="btn" :aria-expanded="moving" @click="moving = !moving">
            Move…<AppIcon name="reveal" class="shrink-0 transition-transform" :class="moving ? 'rotate-180' : ''" />
          </button>
          <span class="mx-2 h-5 w-px bg-line" aria-hidden="true" />
          <button type="button" class="btn sm border-transparent text-muted hover:text-fg" @click="undo">Undo</button>
        </div>

        <!-- Move, in place: which project, and who it is for. -->
        <div v-if="moving" class="grid max-w-[44rem] gap-4 sm:grid-cols-2">
          <div class="menu !static !mt-0 !w-full" role="group" aria-label="Move to project">
            <p class="menu-note mt-0 mb-1">Project:</p>
            <button
              v-for="p in filed.projects"
              :key="p.id"
              type="button"
              class="menu-item"
              :aria-current="p.id === filed.project?.id ? 'true' : undefined"
              @click="moveProject(p.id)"
            >
              <span class="project-mark h-3.5 w-[3px] shrink-0 rounded-[1px]" :data-tone="toneOf(p)" aria-hidden="true" />
              <span class="min-w-0 grow break-words" :class="p.id === filed.project?.id ? 'font-medium' : ''">{{ p.title }}</span>
              <AppIcon v-if="p.id === filed.project?.id" name="check" class="shrink-0" />
            </button>
            <p v-if="!filed.projects.length" class="menu-note">{{ teamName || "This space" }} has no projects yet.</p>
            <div class="menu-rule" />
            <button type="button" class="menu-item" :aria-current="!filed.project ? 'true' : undefined" @click="moveProject('')">
              <span class="min-w-0 grow text-muted" :class="!filed.project ? 'font-medium' : ''">Not in a project</span>
              <AppIcon v-if="!filed.project" name="check" class="shrink-0" />
            </button>
          </div>
          <div v-if="team" class="menu !static !mt-0 !w-full">
            <HubAssignPicker :id="filed.id" :team="team" :to="filedTo" @done="gave" />
          </div>
        </div>
      </section>

      <!-- Writing: the editor is the page, and the agent's reading sits beside it. -->
      <section v-show="!filed" class="flex flex-col gap-5" aria-labelledby="box-h">
        <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div class="min-w-0">
            <h1 id="box-h" class="m-0 text-h2 font-medium tracking-tight">What do you need?</h1>
            <p class="m-0 mt-1 max-w-[40rem] font-ui text-sm text-muted">
              Write it the way it comes. The agent names it, puts it in a project, sends it to the
              people who should act and files it; you can move it or undo it after.
            </p>
          </div>
          <label v-if="teams.length > 1 && !preset" class="flex items-center gap-2 font-ui text-sm">
            <span class="text-muted">For</span>
            <select v-model="team" class="h-8 text-sm">
              <option v-for="t in teams" :key="t.slug" :value="t.slug">{{ t.name }}</option>
            </select>
          </label>
        </div>

        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <form class="flex min-w-0 flex-col gap-3" @submit.prevent="file" @keydown.capture="shortcut">
            <!-- The editor exists only in the browser; the server draws an empty field of its size. -->
            <ClientOnly>
              <HubWriter
                ref="writer"
                class="box"
                placeholder="What happened, what you need, or what a customer said. Paste a screenshot, an error or a link."
                :people="people"
                :groups="groups"
                :disabled="Boolean(filed) || busy"
                @change="text = $event"
                @problem="problem = $event"
              >
                <template #footer>
                  <!-- On a phone the panel is below the fold: its reading in one line, before File it. -->
                  <p
                    v-if="!offline && (preview || reading || preset)"
                    class="m-0 flex w-full min-w-0 items-baseline gap-x-1 border-t border-line pt-3 font-ui text-xs text-muted lg:hidden"
                    aria-hidden="true"
                  >
                    <span class="shrink-0">{{ state }}</span>
                    <template v-if="preview">
                      <span aria-hidden="true">·</span>
                      <span class="min-w-0 font-medium text-fg">{{ shorten(preview.title, 28).text }}</span>
                    </template>
                    <span aria-hidden="true">·</span>
                    <span v-if="previewProject" class="flex shrink-0 items-baseline gap-1">
                      <span class="project-mark h-3 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf(previewProject)" />{{ previewProject.title }}
                    </span>
                    <span v-else class="shrink-0">Not in a project</span>
                  </p>
                  <!-- One row with File it at every width: on a phone the three are marks alone, their
                       words kept for screen readers, so File it is never pushed onto a line of its own. -->
                  <span class="flex items-center gap-1">
                    <label class="btn sm cursor-pointer border-transparent max-sm:w-8 max-sm:px-0" :class="filed || busy ? 'pointer-events-none opacity-50' : ''">
                      <input type="file" accept="image/*" multiple class="sr-only" :disabled="Boolean(filed) || busy" @change="attach" />
                      <AppIcon name="image" />
                      <span class="max-sm:sr-only">{{ uploading ? "Adding picture…" : "Picture" }}</span>
                    </label>
                    <button type="button" class="btn sm border-transparent max-sm:w-8 max-sm:px-0" :disabled="Boolean(filed) || busy" @mousedown.prevent @click="writer?.insert('@')">
                      <span aria-hidden="true">@</span><span class="max-sm:sr-only">Person</span>
                    </button>
                    <button type="button" class="btn sm border-transparent max-sm:w-8 max-sm:px-0" :disabled="Boolean(filed) || busy" @mousedown.prevent @click="writer?.insert('#')">
                      <span aria-hidden="true">#</span><span class="max-sm:sr-only">Group</span>
                    </button>
                  </span>
                  <span class="ml-auto flex items-center gap-3">
                    <kbd class="hidden font-ui text-xs text-muted sm:inline" aria-hidden="true">{{ mod }} Enter</kbd>
                    <button class="btn primary" :disabled="busy || offline || !text.trim()">
                      {{ busy ? "Filing…" : "File it" }}
                    </button>
                  </span>
                </template>
              </HubWriter>
              <template #fallback>
                <div class="writer-shell box"><div class="writer" aria-hidden="true" /></div>
              </template>
            </ClientOnly>

            <p v-if="!text.trim()" class="m-0 flex flex-wrap items-baseline gap-x-1 font-ui text-sm text-muted">
              <span>Start from</span>
              <template v-for="(s, i) in STARTERS" :key="s.label">
                <button
                  type="button"
                  class="cursor-pointer border-0 bg-transparent p-0 font-ui text-sm text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
                  @mousedown.prevent
                  @click="writer?.insert(s.text)"
                >{{ s.label }}</button><span v-if="i < STARTERS.length - 1" aria-hidden="true">·</span>
              </template>
            </p>
            <p v-if="undone" class="m-0 font-ui text-sm text-muted" role="status">{{ undone }}</p>
            <div v-if="problem" role="alert" class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
              <p class="m-0 min-w-0 grow basis-64 font-ui text-sm text-danger">{{ problem }}</p>
              <button v-if="!offline && text.trim()" class="btn outline danger sm" type="button" @click="file">Try again</button>
            </div>
          </form>

          <!-- The agent's reading: the register's fact strip, not a chat. -->
          <aside
            class="flex min-w-0 flex-col rounded-3 border border-line bg-raised px-4 pt-3 pb-1 lg:sticky lg:top-6"
            aria-labelledby="agent-h"
          >
            <div class="flex items-baseline justify-between gap-3 border-b border-fg pb-2">
              <h2 id="agent-h" class="m-0 font-ui text-sm font-semibold tracking-normal whitespace-nowrap">The agent will file</h2>
              <span class="font-ui text-xs text-muted" aria-live="polite">{{ state }}</span>
            </div>

            <div v-if="offline" class="py-3 font-ui text-sm">
              <p class="m-0 font-medium">Writing it down here isn't set up</p>
              <p class="m-0 mt-1 text-muted">
                This server has no agent to read what you write, so nothing can be filed from here
                yet. Whoever runs Passalong for your team can turn it on.
              </p>
            </div>

            <template v-else>
              <div :class="fact">
                <p :class="label">Work</p>
                <p v-if="preview" class="m-0 flex flex-wrap items-baseline gap-2 font-ui text-sm font-medium break-words" :class="reading ? 'opacity-60' : ''">
                  {{ preview.title }}<HubWorkTag :tags="[preview.tag]" />
                </p>
                <p v-else class="m-0 font-ui text-sm text-muted">{{ reading ? "Reading…" : "Named from what you write" }}</p>
              </div>
              <div :class="fact">
                <p :class="label">Project</p>
                <p v-if="previewProject" class="m-0 flex items-baseline gap-2 font-ui text-sm" :class="reading && !preset ? 'opacity-60' : ''">
                  <span class="project-mark h-3.5 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf(previewProject)" aria-hidden="true" />
                  <span class="min-w-0 break-words">{{ previewProject.title }}</span>
                </p>
                <p v-else-if="preview" class="m-0 font-ui text-sm text-muted" :class="reading ? 'opacity-60' : ''">Not in a project</p>
                <p v-else class="m-0 font-ui text-sm text-muted">Picked from {{ teamName || "your" }} projects</p>
              </div>
              <div :class="fact">
                <p :class="label">For</p>
                <template v-if="preview">
                  <p class="m-0 font-ui text-sm break-words" :class="reading ? 'opacity-60' : ''">{{ previewFor }}</p>
                  <p v-if="preview.reason" class="m-0 font-ui text-xs break-words text-muted">{{ preview.reason }}</p>
                </template>
                <p v-else class="m-0 font-ui text-sm text-muted">Whoever should act on it</p>
              </div>
              <div v-if="preview?.question" :class="fact">
                <p :class="label">Worth checking</p>
                <p class="m-0 flex items-baseline gap-2 font-ui text-sm">
                  <span class="size-2 shrink-0 self-center rounded-full bg-warn" aria-hidden="true" />
                  <span class="break-words">{{ preview.question }}</span>
                </p>
                <p class="m-0 font-ui text-xs text-muted">It files its best reading anyway; say more above to settle it.</p>
              </div>
              <div v-if="kept.length" :class="fact">
                <p :class="label">Kept as it came</p>
                <p class="m-0 font-ui text-sm first-letter:uppercase">{{ kept.join(" and ") }}</p>
              </div>
              <div v-if="related.length" :class="fact">
                <p :class="label">Looks like</p>
                <ul class="m-0 flex list-none flex-col gap-2 p-0">
                  <li v-for="r in related" :key="r.id" class="flex flex-col gap-0.5 font-ui">
                    <NuxtLink :to="`/hub/g/${r.id}`" class="text-sm break-words text-fg">{{ r.title }}</NuxtLink>
                    <span class="flex flex-wrap items-baseline gap-x-1 text-xs text-muted">
                      <template v-if="r.project">
                        <span class="project-mark h-3 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf(r.project)" aria-hidden="true" />
                        <span class="ml-1 text-fg">{{ r.project.title }}</span>
                      </template>
                      <span v-else>Not in a project</span>
                      <template v-if="r.where"><span aria-hidden="true">·</span><span>{{ r.where }}</span></template>
                      <span aria-hidden="true">·</span><span class="tabular-nums">{{ age(r.at, now) }}</span>
                    </span>
                  </li>
                </ul>
                <p class="m-0 font-ui text-xs text-muted">Already on the board. Open one instead if it is the same thing.</p>
              </div>
            </template>
          </aside>
        </div>
      </section>

      <!-- The last few filings, as a short register. -->
      <section v-if="recent.length" class="@container flex flex-col" aria-labelledby="recent-h">
        <h2 id="recent-h" class="m-0 pb-3 font-ui text-base font-medium">Filed from here by you</h2>
        <div aria-hidden="true" class="hidden gap-x-3 border-b border-fg pb-2 @2xl:grid" :class="[cols, label]">
          <span>Work</span><span>Project</span><span>For</span><span class="text-right">Filed</span>
        </div>
        <ol class="m-0 list-none border-t border-fg p-0 @2xl:border-t-0">
          <li
            v-for="r in recent"
            :key="r.id"
            class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line py-3 @2xl:grid"
            :class="[cols, r.id === justFiled ? 'settle' : '']"
          >
            <NuxtLink :to="`/hub/g/${r.id}`" class="min-w-0 grow basis-full font-ui text-sm font-medium break-words text-fg no-underline hover:underline @2xl:basis-auto">{{ r.title }}</NuxtLink>
            <span class="flex min-w-0 items-baseline gap-2 font-ui text-xs @2xl:text-sm">
              <template v-if="r.project_id">
                <span class="project-mark h-3.5 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf({ id: r.project_id, color: r.project_color })" aria-hidden="true" />
                <span class="min-w-0 break-words">{{ r.project }}</span>
              </template>
              <span v-else class="text-muted">Not in a project</span>
            </span>
            <span class="min-w-0 font-ui text-xs break-words text-muted @2xl:text-sm @2xl:text-fg">
              <span class="@2xl:hidden" aria-hidden="true">· </span>{{ r.routed || everyone(r.team_name) }}
            </span>
            <span class="font-ui text-xs text-muted tabular-nums @2xl:text-right @2xl:text-sm">
              <span class="@2xl:hidden" aria-hidden="true">· </span>{{ age(r.created, now) }}
            </span>
          </li>
        </ol>
      </section>
    </div>
  </HubShell>
</template>
