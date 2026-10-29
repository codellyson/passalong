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

const route = useRoute();
const id = computed(() => String(route.params.id));
const queryClient = useQueryClient();
const {
  api,
  signedIn,
  markSeen,
  onTakeBack,
  onRecall,
  onArchive,
  onReopen,
  onRemove,
  onTaskReady,
  onTaskDraft,
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
  claimed: { label: "working", tone: "bg-accent-soft text-accent" },
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
/** Gone for good, with its screenshots and files: asked first, then back to the board. */
async function remove() {
  if (busy.value || !g.value || !confirm(`Delete "${g.value.title}"? This cannot be undone.`))
    return;
  busy.value = "delete";
  try {
    if (await onRemove(g.value)) await navigateTo("/hub/work");
  } finally {
    busy.value = "";
  }
}
const recall = () => run("recall", async () => g.value && (await onRecall(g.value)));
/** Sent to somebody, still unanswered, with nobody on it: the one moment taking it back makes sense. */
const recallable = computed(
  () =>
    Boolean(ctx.value?.owner) &&
    Boolean(g.value?.team) &&
    g.value?.status !== "consumed" &&
    !ctx.value?.claims.length,
);
const reopen = () => run("reopen", async () => g.value && (await onArchive(g.value, false)));

/** Finished, not archived: what Reopen is for, and what leads with the proof it was finished with. */
const finished = computed(() => g.value?.status === "consumed" && g.value.outcome !== "archived");
/** What it was finished with: the latest hand-in, kept after its claim. */
const shown = computed(() => (ctx.value?.verdicts ?? []).find((v) => v.ok) ?? null);
const reopening = ref(false);
function sendReopen(form: HTMLFormElement) {
  const why = field(form, "why").trim();
  if (!why) return;
  return run("reopen-why", async () => {
    const ok = await onReopen(id.value, why);
    if (ok) reopening.value = false;
    return ok;
  });
}
/**
 * Ready can say which repo it is for: an agent's take with no id only offers work for the repo it
 * is in. Empty is no repo, which suits work that needs none. Read through the form on submit,
 * because the input is prefilled and stays uncontrolled.
 */
const taskReady = (form: HTMLFormElement) =>
  run("ready", () => onTaskReady({ id: id.value } as Task, field(form, "repo")));
const taskDraft = () => run("draft", () => onTaskDraft({ id: id.value } as Task));

/** One line for each button whose name alone does not say what it does. */
const hints = computed(() => {
  const c = ctx.value;
  if (!c || !g.value) return [];
  const out: string[] = [];
  if (mayAct.value && holding.value)
    out.push(
      "Stop this agent: it goes back to waiting and the agent is told to stop. Nothing is deleted.",
    );
  if (mayArchive.value && g.value.status !== "consumed")
    out.push("Archive: moves it off your board. You can unarchive it.");
  if (mayAct.value && g.value.status === "published" && !c.claims.length)
    out.push("Move to Draft: keep it visible, but stop anyone from taking it.");
  return out;
});

const holding = computed(() => Boolean(ctx.value?.claims.length));

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
        <NuxtLink to="/hub/work" class="text-muted no-underline hover:text-fg">← Work</NuxtLink>
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
        <!-- The runner (`passalong work --watch`) takes only tasks a person marked here. -->
        <label
          v-if="g.status !== 'consumed'"
          class="flex items-start gap-2 font-ui text-sm"
        >
          <input
            type="checkbox"
            class="mt-1"
            :checked="ctx.alone"
            :disabled="markingAlone"
            @change="markAlone(($event.target as HTMLInputElement).checked)"
          />
          <span>
            <b class="font-medium">Safe to run alone</b>
            <span class="block text-muted">The runner may take this with nobody watching. Only mark work that needs no decision, secret or permission from a person.</span>
          </span>
        </label>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <form
            v-if="mayAct && g.status === 'draft'"
            class="flex flex-wrap items-center gap-2"
            @submit.prevent="taskReady($event.target as HTMLFormElement)"
          >
            <label class="sr-only" for="ready-repo">Which repo is this for? Leave it empty for none.</label>
            <input
              id="ready-repo"
              name="repo"
              class="w-56"
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
          <button
            v-if="mayAct && g.status === 'published' && !ctx.claims.length"
            class="btn"
            type="button"
            :disabled="Boolean(busy)"
            @click="taskDraft"
          >{{ busy === "draft" ? "Moving…" : "Move to Draft" }}</button>
          <button
            v-if="mayAct && holding"
            class="btn outline warn"
            type="button"
            :disabled="Boolean(busy)"
            @click="takeBack"
          >{{ busy === "release" ? "Stopping…" : "Stop this agent" }}</button>
          <button
            v-if="mayArchive && g.status !== 'consumed'"
            class="btn"
            type="button"
            :disabled="Boolean(busy)"
            @click="archive"
          >{{ busy === "archive" ? "Archiving…" : "Archive" }}</button>
          <button
            v-if="recallable"
            class="btn"
            type="button"
            :disabled="Boolean(busy)"
            title="Make it private again. It leaves everyone's inbox; anyone who already opened it keeps what they pulled."
            @click="recall"
          >{{ busy === "recall" ? "Taking back…" : "Take back" }}</button>
          <button
            v-if="mayAct && finished"
            class="btn"
            type="button"
            :aria-expanded="reopening"
            :disabled="Boolean(busy)"
            @click="reopening = !reopening"
          >Reopen</button>
          <button
            v-if="mayArchive && g.status === 'consumed'"
            class="btn"
            type="button"
            :disabled="Boolean(busy)"
            @click="reopen"
          >{{ busy === "reopen" ? "Unarchiving…" : "Unarchive to Draft" }}</button>
          <button
            v-if="mayArchive"
            class="btn outline danger"
            type="button"
            :disabled="Boolean(busy)"
            @click="remove"
          >{{ busy === "delete" ? "Deleting…" : "Delete" }}</button>
          <button class="btn" type="button" @click="copy(g.url, $event.currentTarget)">
            <AppIcon name="copy" /><span data-label>Copy share link</span>
          </button>
          <button
            class="btn"
            type="button"
            @click="copy(`passalong take ${g.id}`, $event.currentTarget)"
          >
            <AppIcon name="copy" /><span data-label>Copy take command</span>
          </button>
          <a class="btn" :href="g.url" target="_blank" rel="noopener">
            <AppIcon name="open" />Open share page
          </a>
        </div>
        <!-- Reopen asks why, and the reason goes at the top of the work for whoever takes it next. -->
        <form v-if="reopening" class="flex flex-wrap items-center gap-2" @submit.prevent="sendReopen($event.target as HTMLFormElement)">
          <label class="sr-only" for="reopen-why">Why reopen it?</label>
          <input id="reopen-why" name="why" class="min-w-0 flex-1" required maxlength="280" placeholder="What's wrong — whoever finished it is told" />
          <button class="btn primary" type="submit" :disabled="Boolean(busy)">{{ busy === "reopen-why" ? "Reopening…" : "Reopen" }}</button>
        </form>
        <HubAskCheck v-if="g.team && g.status !== 'draft'" :guide="g" />
        <!-- What the less obvious buttons do, said beside them rather than in a tooltip: a title
             attribute is delayed, unstyled and never shown on a phone. -->
        <ul v-if="hints.length" class="m-0 flex list-none flex-col gap-1 p-0 font-ui text-xs text-muted">
          <li v-for="h in hints" :key="h">{{ h }}</li>
        </ul>
      </header>

      <HubTaskWork :guide="g" :claims="ctx.claims" :owner="Boolean(ctx.owner)" />

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
               the left and each beat is a dot on it in its tone; "now" is the coral diamond. -->
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
                  class="relative z-10 mt-1.5 size-2.5 shrink-0 rotate-45 rounded-[2px] bg-coral ring-4 ring-raised"
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
              <p class="m-0 text-muted">In folders</p>
              <NuxtLink v-for="f in ctx.folders" :key="f.id" :to="`/hub/folders/${f.id}`" class="flex items-center gap-2 rounded-2 bg-field px-3 py-2 text-fg no-underline hover:shadow-edge">
                <svg class="size-4 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3.5 6.5a2 2 0 0 1 2-2H10l2 2h6.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg>
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
