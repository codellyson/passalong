<!--
  One piece of work, signed in: the document, and everything around it.

  The share page is the work as anyone holding the link reads it, and it cannot say what only you
  may know — who holds it, what it was finished with, the work it is tied to — because anyone with
  the link would see that too. This page says it, and it is the hub's, so it knows who is asking.

  It never turns the work's markdown into its own HTML. The hub runs script, and the document is
  markdown somebody else wrote; the share page is safe to render it on only because it runs none.
  So the document is that page, framed (`?embed=1`, same origin, sandboxed, still no script), and
  everything beside it comes from `GET /v1/guides/:id/context`, which records no pull: looking at
  your own board is not opening the work.
-->
<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import type { ContextClaim, GuideContext, Task, Working } from "~/types/hub";
import { expiryLine } from "~/utils/expiry";
import { toneOf } from "~/utils/projects";

const route = useRoute();
const id = computed(() => String(route.params.id));
const queryClient = useQueryClient();
const {
  api,
  data: hub,
  signedIn,
  markSeen,
  onTakeBack,
  onRecall,
  onArchive,
  onReopen,
  onRemove,
  onTaskReady,
  onTaskDraft,
  onPersonTaskTake,
  onPass,
} = useHub();

// Opening it is looking at it: what changed on it stops showing as changed on Needs you.
watch(
  [id, signedIn],
  ([which, inside]) => {
    if (inside) void markSeen(which);
  },
  { immediate: true },
);

const { data, isPending, error } = useQuery({
  queryKey: computed(() => hubKeys.context(id.value)),
  queryFn: async () => (await api<GuideContext>(`/v1/guides/${id.value}/context`)) ?? null,
  enabled: signedIn,
});
const ctx = computed(() => data.value ?? null);
const g = computed(() => ctx.value?.guide ?? null);
const expiry = computed(() => (g.value ? expiryLine(g.value) : null));
const trouble = computed(() => (error.value ? error.value.message : ""));

usePage({
  title: "Work · Passalong",
  description: "One piece of work and everything around it.",
  noindex: true,
});
// The tab says which work once it is known; the page's own meta stays generic, since nothing is
// fetched on the server.
useHead({
  title: computed(() => (g.value?.title ? `${g.value.title} · Passalong` : "Work · Passalong")),
});

/** The share page, as a path: whichever host the hub is on serves it, so the frame is same-origin. */
const frame = computed(() => {
  if (!g.value?.url) return "";
  try {
    return `${new URL(g.value.url).pathname}?embed=1`;
  } catch {
    return "";
  }
});

const who = (by: { handle: string; name: string }) => personName(by.name, by.handle) || "someone";
const where = (k: ContextClaim) => [k.repo, k.host].filter(Boolean).join(" on ");
const STATE: Record<ContextClaim["state"], { label: string; tone: string }> = {
  claimed: { label: "working", tone: "bg-surface text-fg" },
  stalled: { label: "gone quiet", tone: "bg-warn-soft text-warn" },
};

const addressed = computed(() => {
  const x = g.value;
  if (!x) return "";
  if (x.to) return x.to_name || `@${x.to}`;
  if (x.to_group) return x.to_group_name || `#${x.to_group}`;
  return x.team ? x.team_name || x.team : "";
});

/**
 * What last wrote it, as a person reads it — so work that came out wrong can be traced to the
 * release that wrote it. Nothing when it is unknown: work from before this was recorded.
 */
const writer = computed(() => {
  const c = g.value?.client || "";
  if (c.startsWith("cli@<=")) return `passalong ${c.slice(6)} or older`;
  if (c.startsWith("cli@")) return `passalong ${c.slice(4)}`;
  return { mcp: "the hosted MCP server", hub: "the hub", api: "the API", email: "email" }[c] || "";
});

/**
 * Anyone who can open it here is its author or in its team, and a team's board is everyone's: they
 * may mark it ready, move it to draft, stop an agent and reopen it. Archiving stays with its author
 * or a team admin (`mayArchive`).
 */
const mayAct = computed(() => Boolean(ctx.value));
const mayArchive = computed(() => Boolean(ctx.value?.owner || ctx.value?.admin));

/** One line saying where the work stands, before any detail. */
const standing = computed(() => {
  const c = ctx.value;
  if (!c || !g.value) return "";
  // Done says how it got there: finished with proof, or shelved by its author.
  if (g.value.status === "consumed")
    return g.value.outcome === "archived" || !g.value.outcome ? "Archived." : "Finished.";
  if (g.value.status === "draft") return "A draft: nobody can take it until it is ready.";
  if (c.claims.length) return "Being worked on.";
  if (c.blocked_by.some((b) => b.status !== "consumed"))
    return "Waiting on the work it is blocked by.";
  return c.target
    ? `Ready: the next agent working in ${c.target} will take it.`
    : "Ready: nobody has taken it yet.";
});

// ---- acting on it --------------------------------------------------------------------------

/** Mark or unmark it as safe for the runner (PUT /v1/guides/:id/alone). */
const markingAlone = ref(false);
async function markAlone(on: boolean) {
  markingAlone.value = true;
  try {
    await api(`/v1/guides/${id.value}/alone`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ on }),
    });
    await queryClient.invalidateQueries({ queryKey: hubKeys.context(id.value) });
  } finally {
    markingAlone.value = false;
  }
}

const busy = ref("");

async function run(mark: string, work: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = mark;
  try {
    await work();
    await queryClient.invalidateQueries({ queryKey: hubKeys.context(id.value) });
  } finally {
    busy.value = "";
  }
}

const takeBack = () => run("release", () => onTakeBack({ id: id.value } as Working));
const archive = () => run("archive", async () => g.value && (await onArchive(g.value, true)));
const unarchive = () => run("unarchive", async () => g.value && (await onArchive(g.value, false)));
const take = () => run("take", () => onPersonTaskTake(id.value));
const recall = () => run("recall", async () => g.value && (await onRecall(g.value)));
/** Sent to somebody, still unanswered, with nobody on it: the one moment making it private again makes sense. */
const recallable = computed(
  () =>
    Boolean(ctx.value?.owner) &&
    Boolean(g.value?.team) &&
    g.value?.status !== "consumed" &&
    !ctx.value?.claims.length,
);

const holding = computed(() => Boolean(ctx.value?.claims.length));
/** You hold it yourself: its Finish is in your work on it below, so the header leads with nothing. */
const holdingMine = computed(() => {
  const person = `person-${(hub.value.me?.account || "").toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
  return Boolean(ctx.value?.claims.some((c) => c.agent === person && c.state === "claimed"));
});
/** Sent to the whole team, or to you or a group you are in, and not yours: yours to take. */
const canTake = computed(() => {
  const x = g.value;
  if (!x || ctx.value?.owner || x.status !== "published" || holding.value) return false;
  return !((x.to || x.to_group) && !x.for_me);
});
const canGive = computed(() => Boolean(g.value?.team) && g.value?.status !== "consumed");
/** Who it is for now, as the assign route names it. */
const givenTo = computed(() =>
  g.value?.to ? `@${g.value.to}` : g.value?.to_group ? `#${g.value.to_group}` : "",
);

/** Finished, not archived: what Reopen is for, and what leads with the proof it was finished with. */
const finished = computed(() => g.value?.status === "consumed" && g.value.outcome !== "archived");
/** What it was finished with: the latest hand-in, kept after its claim. */
const shown = computed(() => (ctx.value?.verdicts ?? []).find((v) => v.ok) ?? null);

/**
 * The one act the work's state asks for, shown as the lead; everything else is under More. Draft:
 * Ready. Ready and free: I'll do this if it is yours to take, else Give to…. Held by someone else
 * or an agent: Stop this agent. Finished: Reopen. Archived: Unarchive to Draft.
 */
type Act = "ready" | "take" | "give" | "stop" | "reopen" | "unarchive" | "";
const lead = computed<Act>(() => {
  const x = g.value;
  if (!x) return "";
  if (x.status === "consumed")
    return finished.value ? "reopen" : mayArchive.value ? "unarchive" : "";
  if (x.status === "draft") return mayAct.value ? "ready" : "";
  if (holding.value) return holdingMine.value ? "" : "stop";
  if (canTake.value) return "take";
  return canGive.value ? "give" : "";
});
/** At most one act beside it: Give to… with I'll do this, otherwise Archive for whoever may. */
const beside = computed<"give" | "archive" | "">(() => {
  if (lead.value === "take" && canGive.value) return "give";
  return mayArchive.value && g.value?.status !== "consumed" ? "archive" : "";
});

/** The form opened in place under the acts: one at a time. */
type Panel = "" | "reopen" | "pass" | "give" | "ask";
const panel = ref<Panel>("");
const panelEl = ref<HTMLElement | null>(null);
async function show(p: Panel) {
  panel.value = panel.value === p ? "" : p;
  await nextTick();
  if (panel.value)
    panelEl.value?.querySelector<HTMLElement>("input, select, button:not([disabled])")?.focus();
}
const asking = computed({
  get: () => panel.value === "ask",
  set: (on: boolean) => {
    if (on) panel.value = "ask";
    else if (panel.value === "ask") panel.value = "";
  },
});
function sendReopen(form: HTMLFormElement) {
  const why = field(form, "why").trim();
  if (!why) return;
  return run("reopen-why", async () => {
    const ok = await onReopen(id.value, why);
    if (ok) panel.value = "";
    return ok;
  });
}
/** Not for me: the reason is required, because "not me" without "why" leaves the sender guessing. */
function sendPass(form: HTMLFormElement) {
  const why = field(form, "why").trim();
  if (!why) return;
  return run("pass", async () => {
    const ok = await onPass(id.value, why);
    if (ok) panel.value = "";
    return ok;
  });
}
function gave() {
  panel.value = "";
  void queryClient.invalidateQueries({ queryKey: hubKeys.context(id.value) });
}
/**
 * Ready can say which repo it is for: an agent's take with no id only offers work for the repo it
 * is in. Empty is no repo, which suits work that needs none. Read through the form on submit,
 * because the input is prefilled and stays uncontrolled.
 */
const taskReady = (form: HTMLFormElement) =>
  run("ready", () => onTaskReady({ id: id.value } as Task, field(form, "repo")));
const taskDraft = () => run("draft", () => onTaskDraft({ id: id.value } as Task));

/** One line for each visible button whose name alone does not say what it does. */
const hints = computed(() => {
  const out: string[] = [];
  if (lead.value === "stop")
    out.push(
      "Stop this agent: it goes back to waiting and the agent is told to stop. Nothing is deleted.",
    );
  if (beside.value === "archive")
    out.push("Archive: moves it off your board. You can unarchive it.");
  return out;
});

// ---- More: every other act, in the hub's menu ------------------------------------------------

const moreOpen = ref(false);
const moreRoot = ref<HTMLElement | null>(null);
const moreButton = ref<HTMLButtonElement | null>(null);
const moreMenu = ref<HTMLElement | null>(null);
const items = () => [
  ...(moreMenu.value?.querySelectorAll<HTMLElement>("[role^=menuitem]:not([disabled])") ?? []),
];
async function toggleMore() {
  moreOpen.value = !moreOpen.value;
  confirmingDelete.value = false;
  await nextTick();
  if (moreOpen.value) items()[0]?.focus();
}
function closeMore(refocus = true) {
  moreOpen.value = false;
  confirmingDelete.value = false;
  if (refocus) moreButton.value?.focus();
}
/** Escape closes and gives focus back to More; Tab leaves; up and down move between items. */
function onMoreKey(e: KeyboardEvent) {
  if (!moreOpen.value) return;
  if (e.key === "Escape") {
    e.preventDefault();
    return closeMore();
  }
  if (e.key === "Tab") return closeMore(false);
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const all = items();
  const i = all.indexOf(document.activeElement as HTMLElement);
  all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
}
function outside(e: PointerEvent) {
  if (moreOpen.value && !moreRoot.value?.contains(e.target as Node)) closeMore(false);
}
onMounted(() => document.addEventListener("pointerdown", outside, true));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside, true));
/** An act from the menu: close it, then do it. */
function pick(act: () => unknown) {
  closeMore();
  act();
}
/** A form from the menu: close it, and the form takes focus where it opens. */
function open(p: Panel) {
  closeMore(false);
  panel.value = "";
  void show(p);
}
function copyFromMenu(text: string, e: Event) {
  copy(text, e.currentTarget);
  setTimeout(() => closeMore(), 600);
}
/** Gone for good, with its screenshots and files: asked first, in the menu, then back to the board. */
const confirmingDelete = ref(false);
async function remove() {
  if (busy.value || !g.value) return;
  closeMore(false);
  busy.value = "delete";
  try {
    if (await onRemove(g.value)) await navigateTo("/hub/work");
  } finally {
    busy.value = "";
  }
}
async function askDelete() {
  confirmingDelete.value = true;
  await nextTick();
  // The safe answer takes focus, so Enter does not delete.
  items().at(-1)?.focus();
}

// ---- the frame fits the document ----------------------------------------------------------

/**
 * The frame is as tall as the document in it. A fixed height gave it a scrollbar of its own
 * inside the page's, and in a full-page view it simply stopped, with the sidebar running on
 * beside empty space. The frame is same-origin, so the hub — which runs script — can measure it;
 * the share page inside still runs none.
 */
const frameEl = ref<HTMLIFrameElement | null>(null);
const frameHeight = ref(0);
let watcher: ResizeObserver | null = null;
function fit() {
  const doc = frameEl.value?.contentDocument;
  if (!doc?.documentElement) return;
  const measure = () => {
    frameHeight.value = Math.ceil(doc.documentElement.scrollHeight);
  };
  measure();
  watcher?.disconnect();
  // Opening a <details> in the document changes its height; follow it.
  watcher = new ResizeObserver(measure);
  watcher.observe(doc.documentElement);
}
onBeforeUnmount(() => watcher?.disconnect());

/** What happened to it, in order. See utils/progress.ts. */
const progress = computed(() => (ctx.value ? progressOf(ctx.value) : []));

const card = "rounded-3 bg-raised px-5 py-4";
const label = "m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted";
</script>

<template>
  <HubShell>
    <p v-if="trouble" :class="card" class="font-ui text-sm text-danger">
      {{ trouble }} <NuxtLink to="/hub/work">Back to your work</NuxtLink>
    </p>

    <article v-else-if="ctx && g" class="flex flex-col gap-6">
      <!-- The way back to the board, at the top where a phone reader looks for it. -->
      <nav class="font-ui text-sm" aria-label="Back">
        <NuxtLink to="/hub/work" class="inline-flex items-center gap-1 text-muted no-underline hover:text-fg"><AppIcon name="back" :size="14" />Work</NuxtLink>
      </nav>
      <header class="m-0 flex flex-col gap-2 border-b-0 p-0">
        <p class="m-0 flex flex-wrap items-center gap-2 font-ui text-sm text-muted">
          <HubWorkTag :tags="g.tags" />
          <span>from <b class="font-medium text-fg">{{ g.mine ? "you" : fromName(g) }}</b></span>
          <span v-if="addressed">· to <b class="font-medium text-fg">{{ addressed }}</b></span>
          <span>· {{ rel(g.created) }}</span>
          <span v-if="g.source_context">· {{ g.source_context }}</span>
          <span v-if="writer">· via {{ writer }}</span>
        </p>
        <h1 class="m-0">{{ g.title || "Untitled" }}</h1>
        <!-- What it says to a person, first: the document below is the agent's form of it. -->
        <p v-if="g.summary" class="m-0 font-ui text-lg leading-snug text-fg">{{ g.summary }}</p>
        <p
          v-if="expiry"
          class="m-0 font-ui text-sm"
          :class="expiry.soon ? 'text-warn' : 'text-muted'"
        >{{ expiry.text }}</p>
        <p class="m-0 font-ui text-base text-muted">{{ standing }}</p>
        <!-- One act for where it stands, at most one beside it, and the rest under More. -->
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <form
            v-if="lead === 'ready'"
            class="flex w-full flex-wrap items-center gap-2 sm:w-auto"
            @submit.prevent="taskReady($event.target as HTMLFormElement)"
          >
            <label class="sr-only" for="ready-repo">Which repo is this for? Leave it empty for none.</label>
            <input
              id="ready-repo"
              name="repo"
              class="min-w-0 flex-1 sm:w-56 sm:flex-none"
              list="ready-repos"
              placeholder="Repo, if any: owner/repo"
              :value="ctx.target || ''"
              autocomplete="off"
              spellcheck="false"
            />
            <datalist id="ready-repos">
              <option v-for="r in ctx.repos || []" :key="r" :value="r" />
            </datalist>
            <button class="btn primary" type="submit" :disabled="Boolean(busy)">
              {{ busy === "ready" ? "Making ready…" : "Ready" }}
            </button>
          </form>
          <button v-else-if="lead === 'take'" class="btn primary" type="button" :disabled="Boolean(busy)" @click="take">
            {{ busy === "take" ? "Taking…" : "I'll do this" }}
          </button>
          <button v-else-if="lead === 'stop'" class="btn outline warn" type="button" :disabled="Boolean(busy)" @click="takeBack">
            {{ busy === "release" ? "Stopping…" : "Stop this agent" }}
          </button>
          <button
            v-else-if="lead === 'reopen'"
            class="btn primary"
            type="button"
            :aria-expanded="panel === 'reopen'"
            :disabled="Boolean(busy)"
            @click="show('reopen')"
          >
            Reopen<AppIcon name="reveal" class="transition-transform" :class="panel === 'reopen' ? 'rotate-180' : ''" />
          </button>
          <button v-else-if="lead === 'unarchive'" class="btn primary" type="button" :disabled="Boolean(busy)" @click="unarchive">
            {{ busy === "unarchive" ? "Unarchiving…" : "Unarchive to Draft" }}
          </button>
          <button
            v-if="lead === 'give' || beside === 'give'"
            class="btn"
            :class="lead === 'give' ? 'primary' : ''"
            type="button"
            :aria-expanded="panel === 'give'"
            @click="show('give')"
          >
            Give to…<AppIcon name="reveal" class="transition-transform" :class="panel === 'give' ? 'rotate-180' : ''" />
          </button>
          <button v-if="beside === 'archive'" class="btn" type="button" :disabled="Boolean(busy)" @click="archive">
            {{ busy === "archive" ? "Archiving…" : "Archive" }}
          </button>

          <div ref="moreRoot" class="relative ml-auto" @keydown="onMoreKey">
            <button
              ref="moreButton"
              class="btn"
              type="button"
              aria-haspopup="menu"
              :aria-expanded="moreOpen"
              aria-controls="work-more"
              @click="toggleMore"
            >
              <AppIcon name="more" />More
            </button>
            <div v-if="moreOpen" id="work-more" ref="moreMenu" class="menu" role="menu" aria-label="More for this work">
              <button v-if="canTake" role="menuitem" class="menu-item" type="button" @click="open('pass')">Not for me…</button>
              <button v-if="canGive && lead !== 'give' && beside !== 'give'" role="menuitem" class="menu-item" type="button" @click="open('give')">Give to…</button>
              <button v-if="g.status === 'published' && !holding" role="menuitem" class="menu-item" type="button" @click="pick(taskDraft)">
                <span class="flex flex-col"><span>Move to Draft</span><span class="text-xs text-muted">Nobody can take it until it is ready again.</span></span>
              </button>
              <button v-if="holding && lead !== 'stop'" role="menuitem" class="menu-item" type="button" @click="pick(takeBack)">Stop this agent</button>
              <button v-if="mayArchive && g.status !== 'consumed' && beside !== 'archive'" role="menuitem" class="menu-item" type="button" @click="pick(archive)">Archive</button>
              <button v-if="mayArchive && g.status === 'consumed' && lead !== 'unarchive'" role="menuitem" class="menu-item" type="button" @click="pick(unarchive)">Unarchive to Draft</button>
              <button v-if="recallable" role="menuitem" class="menu-item" type="button" @click="pick(recall)">
                <span class="flex flex-col"><span>Make it private again</span><span class="text-xs text-muted">It leaves everyone's inbox. Anyone who opened it keeps what they read.</span></span>
              </button>
              <button v-if="g.team && g.status !== 'draft'" role="menuitem" class="menu-item" type="button" @click="open('ask')">Ask someone to check…</button>
              <!-- Hidden when nothing above it was offered. -->
              <div class="menu-rule first:hidden" role="separator" />
              <button role="menuitem" class="menu-item" type="button" @click="copyFromMenu(g.url, $event)">
                <AppIcon name="copy" /><span data-label>Copy share link</span>
              </button>
              <a role="menuitem" class="menu-item" :href="g.url" target="_blank" rel="noopener" @click="closeMore()">
                <AppIcon name="open" />Open share page
              </a>
              <button role="menuitem" class="menu-item" type="button" @click="copyFromMenu(`passalong take ${g.id}`, $event)">
                <AppIcon name="copy" /><span data-label>Copy the command for an agent</span>
              </button>
              <!-- The runner (`passalong work --watch`) takes only work a person marked here. -->
              <button
                v-if="g.status !== 'consumed'"
                role="menuitemcheckbox"
                class="menu-item !items-start"
                type="button"
                :aria-checked="Boolean(ctx.alone)"
                :disabled="markingAlone"
                @click="markAlone(!ctx.alone)"
              >
                <span class="flex h-5 shrink-0 items-center" aria-hidden="true">
                  <span class="grid size-4 place-items-center rounded-1 border border-line-strong" :class="ctx.alone ? 'border-fg bg-fg text-bg' : ''">
                    <AppIcon v-if="ctx.alone" name="check" :size="12" />
                  </span>
                </span>
                <span class="flex flex-col">
                  <span>Let an always-on agent take this on its own</span>
                  <span class="text-xs text-muted">Only for work that needs no decision, secret or permission from a person.</span>
                </span>
              </button>
              <template v-if="mayArchive">
                <div class="menu-rule" role="separator" />
                <button v-if="!confirmingDelete" role="menuitem" class="menu-item destructive" type="button" @click="askDelete">Delete…</button>
                <div v-else class="flex flex-col gap-2 p-2" role="alert">
                  <p class="m-0 font-ui text-sm">Delete “{{ g.title }}” with its screenshots and files? This cannot be undone.</p>
                  <div class="flex gap-2">
                    <button role="menuitem" class="btn sm outline danger" type="button" @click="remove">Delete</button>
                    <button role="menuitem" class="btn sm" type="button" @click="confirmingDelete = false; void nextTick(() => items().at(-1)?.focus())">Keep it</button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
        <p v-if="busy === 'delete'" class="m-0 font-ui text-sm text-muted" role="status">Deleting…</p>
        <!-- What the less obvious buttons do, said beside them rather than in a tooltip: a title
             attribute is delayed, unstyled and never shown on a phone. -->
        <ul v-if="hints.length" class="m-0 flex list-none flex-col gap-1 p-0 font-ui text-xs text-muted">
          <li v-for="h in hints" :key="h">{{ h }}</li>
        </ul>
        <!-- The form an act opens, in place under the acts. -->
        <div ref="panelEl" class="contents">
          <!-- Reopen asks why, and the reason goes at the top of the work for whoever takes it next. -->
          <form v-if="panel === 'reopen'" class="flex flex-wrap items-center gap-2" @submit.prevent="sendReopen($event.target as HTMLFormElement)">
            <label class="sr-only" for="reopen-why">Why reopen it?</label>
            <input id="reopen-why" name="why" class="min-w-0 flex-1" required maxlength="280" placeholder="What's wrong — whoever finished it is told" />
            <button class="btn primary" type="submit" :disabled="Boolean(busy)">{{ busy === "reopen-why" ? "Reopening…" : "Reopen" }}</button>
          </form>
          <form v-if="panel === 'pass'" class="flex flex-col gap-2" @submit.prevent="sendPass($event.target as HTMLFormElement)">
            <label class="font-ui text-sm" for="pass-why">Why isn't it yours? Whoever sent it is told.</label>
            <div class="flex flex-wrap items-center gap-2">
              <input id="pass-why" name="why" class="min-w-0 flex-1" required maxlength="280" placeholder="Not my area — the payments team owns this." />
              <button class="btn outline warn" type="submit" :disabled="Boolean(busy)">{{ busy === "pass" ? "Handing back…" : "Hand it back" }}</button>
              <button class="btn" type="button" @click="panel = ''">Cancel</button>
            </div>
          </form>
          <div v-if="panel === 'give' && g.team" class="menu !static !mt-0 !w-full max-w-sm">
            <HubAssignPicker :id="id" :team="g.team" :to="givenTo" @done="gave" />
          </div>
          <HubAskCheck v-if="g.team && g.status !== 'draft'" v-model:open="asking" :guide="g" />
        </div>
      </header>

      <HubTaskWork :guide="g" :claims="ctx.claims" />

      <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="flex min-w-0 flex-col gap-6">
        <!-- A customer's request: the conversation lives on its Support page, not here. -->
        <p v-if="ctx.customer" class="m-0 font-ui text-sm">
          This came from {{ ctx.customer.name || ctx.customer.email }}.
          <NuxtLink :to="`/hub/support/${id}`">Open the conversation</NuxtLink>
        </p>

        <!-- What it was finished with, first: finishing is final, so this is the record of it. -->
        <section v-if="finished && shown" :class="card" class="flex flex-col gap-3" aria-label="What it was finished with">
          <h2 :class="label">Finished with</h2>
          <p class="m-0 font-ui text-sm"><b class="font-medium">{{ who(shown.by) }}</b><template v-if="shown.note">: {{ shown.note }}</template></p>
          <HubEvidence v-if="shown.detail" :text="shown.detail" />
          <p v-if="shown.writeup" class="m-0 font-ui text-sm whitespace-pre-wrap text-muted">{{ shown.writeup }}</p>
        </section>

        <!-- The document. Sandboxed with no script, on top of a page whose own policy already
             allows none: it can open a link in a new tab and nothing else. -->
        <section class="overflow-hidden rounded-3 bg-bg shadow-edge" aria-label="The work">
          <iframe
            v-if="frame"
            :src="frame"
            :title="g.title || 'The work'"
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            referrerpolicy="no-referrer"
            class="block min-h-[28rem] w-full border-0"
            :style="frameHeight ? { height: `${frameHeight}px` } : undefined"
            ref="frameEl"
            @load="fit"
          />
        </section>
        </div>

        <aside class="flex flex-col gap-4">
          <!-- Progress: what happened to it, in order, ending on where it is now. A rule runs down
               the left and each beat is a dot on it in its tone; "now" is the ink diamond. -->
          <section :class="card" class="flex flex-col gap-4" aria-labelledby="progress-h">
            <h2 id="progress-h" :class="label">Progress</h2>
            <ol class="relative m-0 flex list-none flex-col gap-5 p-0">
              <span class="absolute top-2 bottom-2 left-[0.3125rem] w-px bg-line-strong" aria-hidden="true" />
              <li v-for="(b, i) in progress" :key="i" class="relative flex gap-3">
                <span
                  class="relative z-10 mt-1.5 size-2.5 shrink-0 rounded-pill ring-4 ring-raised"
                  :class="BEAT_DOT[b.tone]"
                  aria-hidden="true"
                />
                <div class="flex min-w-0 flex-col gap-2 font-ui text-sm">
                  <p class="m-0">
                    <b class="font-medium">{{ b.who }}</b> {{ b.what }}
                    <span class="text-muted">· <time :datetime="b.at">{{ rel(b.at) }}</time></span>
                  </p>
                  <p v-if="b.said" class="m-0 rounded-2 bg-field px-3 py-2 text-muted">{{ b.said }}</p>
                  <div v-if="b.proof" class="rounded-2 bg-field px-3 py-2"><HubEvidence :text="b.proof" prose /></div>
                  <NuxtLink v-if="b.link" :to="`/hub/g/${b.link.id}`" class="self-start">{{ b.link.title }} →</NuxtLink>
                </div>
              </li>
              <li class="relative flex gap-3">
                <span
                  class="relative z-10 mt-1.5 size-2.5 shrink-0 rotate-45 rounded-[2px] bg-fg ring-4 ring-raised"
                  aria-hidden="true"
                />
                <p class="m-0 font-ui text-sm font-medium">Now — {{ standing }}</p>
              </li>
            </ol>
          </section>

          <!-- Who has it: one holder at a time. -->
          <section v-if="ctx.claims.length" :class="card" class="flex flex-col gap-4">
            <h2 :class="label">Who has it</h2>
            <div
              v-for="k in ctx.claims"
              :key="k.claimed_at"
              class="flex flex-col gap-2 border-t border-line pt-4 first-of-type:border-t-0 first-of-type:pt-0"
            >
              <p class="m-0 flex flex-wrap items-center gap-2 font-ui text-sm">
                <span class="rounded-pill px-2 py-0.5 text-xs font-semibold" :class="STATE[k.state].tone">
                  {{ STATE[k.state].label }}
                </span>
                <b class="font-medium">{{ who(k.by) }}</b>
                <span class="text-muted">· {{ rel(k.updated) }}</span>
              </p>
              <p v-if="where(k)" class="m-0 font-code text-xs text-muted">{{ where(k) }}</p>
              <p v-if="k.note" class="m-0 font-ui text-sm text-muted">“{{ k.note }}”</p>
            </div>
          </section>



          <!-- The work it is tied to. Each opens here, so the chain is walked without leaving. -->
          <section
            v-if="ctx.parent || ctx.children.length || ctx.blocked_by.length || ctx.blocks.length || ctx.folders.length"
            :class="card"
            class="flex flex-col gap-4 font-ui text-sm"
          >
            <h2 :class="label">Tied to</h2>
            <div v-if="ctx.parent" class="flex flex-col gap-2">
              <p class="m-0 text-muted">Came from</p>
              <HubWorkLink :g="ctx.parent" />
            </div>
            <div v-if="ctx.blocked_by.length" class="flex flex-col gap-2">
              <p class="m-0 text-muted">Blocked by</p>
              <HubWorkLink v-for="b in ctx.blocked_by" :key="b.id" :g="b" />
            </div>
            <div v-if="ctx.blocks.length" class="flex flex-col gap-2">
              <p class="m-0 text-muted">Blocks</p>
              <HubWorkLink v-for="b in ctx.blocks" :key="b.id" :g="b" />
            </div>
            <div v-if="ctx.children.length" class="flex flex-col gap-2">
              <p class="m-0 text-muted">Work from this · {{ ctx.children.length }}</p>
              <HubWorkLink v-for="c in ctx.children" :key="c.id" :g="c" />
            </div>
            <div v-if="ctx.folders.length" class="flex flex-col gap-2">
              <p class="m-0 text-muted">In {{ ctx.folders.length === 1 ? "project" : "projects" }}</p>
              <NuxtLink v-for="f in ctx.folders" :key="f.id" :to="`/hub/projects/${f.id}`" class="flex items-center gap-2 rounded-2 bg-field px-3 py-2 text-fg no-underline hover:shadow-edge">
                <span class="project-mark h-3.5 w-[3px] shrink-0 rounded-[1px]" :data-tone="toneOf(f)" aria-hidden="true" />
                <span class="min-w-0 flex-1">{{ f.title }}</span>
              </NuxtLink>
            </div>
          </section>
        </aside>
      </div>
    </article>

    <div v-else-if="isPending" class="flex flex-col gap-4">
      <span class="block h-7 w-2/3 rounded-pill bg-line-strong" aria-hidden="true" />
      <HubSkeleton :rows="3" label="Loading the work" />
    </div>
  </HubShell>
</template>
