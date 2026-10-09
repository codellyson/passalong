<!--
  One guide, signed in: the document, and everything around it.

  The share page is the guide as anyone holding the link reads it, and it cannot say what only you
  may know — who holds it, what they handed in, the guides it is tied to — because anyone with the
  link would see that too. This page says it, and it is the hub's, so it knows who is asking.

  It never turns the guide's markdown into its own HTML. The hub runs script, and a guide is
  markdown somebody else wrote; the share page is safe to render it on only because it runs none.
  So the document is that page, framed (`?embed=1`, same origin, sandboxed, still no script), and
  everything beside it comes from `GET /v1/guides/:id/context`, which records no pull: looking at
  your own board is not opening the guide.
-->
<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import type { ContextClaim, Guide, GuideContext, HandedIn, Task, Working } from "~/types/hub";
import { expiryLine } from "~/utils/expiry";

const route = useRoute();
const id = computed(() => String(route.params.id));
const queryClient = useQueryClient();
const {
  api,
  signedIn,
  onApprove,
  onReject,
  onCloseHandedIn,
  onSendBackHandedIn,
  onTakeBack,
  onCloseGuide,
  onRecall,
  onArchive,
  onTaskReady,
  onTaskDraft,
} = useHub();

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
  title: "Guide · Passalong",
  description: "One guide and everything around it.",
  noindex: true,
});
// The tab says which guide once it is known; the page's own meta stays generic, since nothing is
// fetched on the server.
useHead({
  title: computed(() => (g.value?.title ? `${g.value.title} · Passalong` : "Guide · Passalong")),
});

const badge = computed(() => kindBadge(g.value?.kind));
const isTask = computed(() => g.value?.kind === "task");

/** The share page, as a path: whichever host the hub is on serves it, so the frame is same-origin. */
const frame = computed(() => {
  if (!g.value?.url) return "";
  try {
    // While something is handed in, the hub shows it above the frame; the frame need not repeat it.
    return `${new URL(g.value.url).pathname}?embed=1${returned.value.length ? "&adapted=0" : ""}`;
  } catch {
    return "";
  }
});

const who = (by: { handle: string; name: string }) => personName(by.name, by.handle) || "someone";
const where = (k: ContextClaim) => [k.repo || k.place, k.host].filter(Boolean).join(" on ");
const STATE: Record<ContextClaim["state"], { label: string; tone: string }> = {
  claimed: { label: "working", tone: "bg-accent-soft text-accent" },
  stalled: { label: "gone quiet", tone: "bg-warn-soft text-warn" },
  review: { label: "handed in", tone: "bg-ok-soft text-ok" },
};

const addressed = computed(() => {
  const x = g.value;
  if (!x) return "";
  if (x.to) return x.to_name || `@${x.to}`;
  if (x.to_group) return x.to_group_name || `#${x.to_group}`;
  return x.team ? x.team_name || x.team : "";
});

/**
 * What last wrote it, as a person reads it — so a guide that came out wrong can be traced to the
 * release that wrote it. Nothing when it is unknown: a guide from before this was recorded.
 */
const writer = computed(() => {
  const c = g.value?.client || "";
  if (c.startsWith("cli@<=")) return `passalong ${c.slice(6)} or older`;
  if (c.startsWith("cli@")) return `passalong ${c.slice(4)}`;
  return { mcp: "the hosted MCP server", hub: "the hub", api: "the API" }[c] || "";
});

/** Its author, or the owner of its team: either may decide what happens to it. */
const mayAct = computed(() => Boolean(ctx.value?.owner || ctx.value?.admin));

/** One line saying where the guide stands, before any detail. */
const standing = computed(() => {
  const c = ctx.value;
  if (!c || !g.value) return "";
  if (g.value.status === "consumed") return "Archived.";
  if (g.value.status === "draft") return "A draft: nobody can take it until it is ready.";
  const review = c.claims.filter((k) => k.state === "review").length;
  const held = c.claims.filter((k) => k.state !== "review").length;
  const author = fromName(g.value) || "its author";
  if (!c.owner && c.admin && review)
    return `Finished: waiting on ${author}. As the team's owner you can accept it or ask for changes.`;
  if (c.owner && review)
    return `Finished${c.claims.length > 1 ? ` in ${plural(review, "place")}` : ""}: waiting on you to accept it or ask for changes.`;
  // Said to the person who handed it in, in their own terms: it is done on their side, and whose
  // move it is now has a name.
  if (c.claims.some((k) => k.mine && k.state === "review"))
    return `You handed it in. Waiting on ${author} to accept it.`;
  if (review)
    return `Finished${c.claims.length > 1 ? ` in ${plural(review, "place")}` : ""}: waiting on ${author}.`;
  if (held) return `Being worked on${held > 1 ? ` in ${held} places` : ""}.`;
  if (g.value.failing) return "Someone ran it and it didn't work.";
  if (g.value.verdict?.ok) return "Someone ran it and it works.";
  if (isTask.value)
    return c.blocked_by.some((b) => b.status !== "consumed")
      ? "Waiting on the tasks it is blocked by."
      : "Ready: the next agent in the right repo will take it.";
  return "Nobody has taken it yet.";
});

// ---- acting on it --------------------------------------------------------------------------

/** Accept is held until the evidence has been opened, as it is on the review rows. */
const read = ref(new Set<string>());
const busy = ref("");
const sendingBack = ref<string | null>(null);

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

const accept = (k: ContextClaim) =>
  run(`accept:${k.place}`, () =>
    isTask.value
      ? onApprove({ id: id.value } as Task)
      : onCloseHandedIn({ id: id.value, place: k.place } as HandedIn),
  );

function sendBack(k: ContextClaim, e: Event) {
  const why = field(e.currentTarget as HTMLFormElement, "why").trim();
  if (!why) return;
  return run(`back:${k.place}`, async () => {
    if (isTask.value) await onReject({ id: id.value } as Task, why);
    else await onSendBackHandedIn({ id: id.value, place: k.place } as HandedIn, why);
    sendingBack.value = null;
  });
}

const takeBack = () => run("release", () => onTakeBack({ id: id.value } as Working));
const close = () => run("close", async () => g.value && (await onCloseGuide(g.value as Guide)));
const recall = () => run("recall", async () => g.value && (await onRecall(g.value as Guide)));
/** Sent to somebody, still unanswered, with nobody on it: the one moment taking it back makes sense. */
const recallable = computed(
  () =>
    Boolean(ctx.value?.owner) &&
    Boolean(g.value?.team) &&
    g.value?.kind !== "task" &&
    g.value?.status !== "consumed" &&
    !ctx.value?.claims.length,
);
const reopen = () =>
  run("reopen", async () => g.value && (await onArchive(g.value as Guide, false)));
const taskReady = () => run("ready", () => onTaskReady({ id: id.value } as Task));
const taskDraft = () => run("draft", () => onTaskDraft({ id: id.value } as Task));

/** One line for each button whose name alone does not say what it does. */
const hints = computed(() => {
  const c = ctx.value;
  if (!c || !g.value) return [];
  const out: string[] = [];
  if (!g.value.mine && !handedInByMe.value)
    out.push("Respond: say whether you are taking it, and later whether it worked.");
  if ((c.owner || c.admin) && holding.value)
    out.push(
      "Stop this agent: it goes back to waiting and the agent is told to stop. Nothing is deleted.",
    );
  if ((c.owner || c.admin) && g.value.status !== "consumed" && !reviewing.value)
    out.push("Archive: moves it off your board. You can unarchive it.");
  if (mayAct.value && isTask.value && g.value.status === "published" && !c.claims.length)
    out.push("Move to Draft: keep it visible for review, but stop agents from taking it.");
  return out;
});

const holding = computed(() => (ctx.value?.claims ?? []).some((k) => k.state !== "review"));
const handedInByMe = computed(() =>
  (ctx.value?.claims ?? []).some((k) => k.mine && k.state === "review"),
);
/** What came back: the hand-ins, read in the main column rather than squeezed into the side. */
const returned = computed(() => (ctx.value?.claims ?? []).filter((k) => k.state === "review"));

// ---- the frame fits the guide -------------------------------------------------------------

/**
 * The frame is as tall as the guide in it. A fixed height gave the guide a scrollbar of its own
 * inside the page's, and in a full-page view it simply stopped, with the sidebar running on
 * beside empty space. The frame is same-origin, so the hub — which runs script — can measure it;
 * the guide page inside still runs none.
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
  // Opening a <details> in the guide changes its height; follow it.
  watcher = new ResizeObserver(measure);
  watcher.observe(doc.documentElement);
}
onBeforeUnmount(() => watcher?.disconnect());
const reviewing = computed(() => (ctx.value?.claims ?? []).some((k) => k.state === "review"));

/** What happened to it, in order. See utils/progress.ts. */
const progress = computed(() => (ctx.value ? progressOf(ctx.value) : []));

const card = "rounded-3 bg-raised px-5 py-4";
const label = "m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted";
</script>

<template>
  <HubShell>
    <p v-if="trouble" :class="card" class="font-ui text-sm text-danger">
      {{ trouble }} <NuxtLink to="/hub">Back to your work</NuxtLink>
    </p>

    <article v-else-if="ctx && g" class="flex flex-col gap-6">
      <header class="m-0 flex flex-col gap-2 border-b-0 p-0">
        <p class="m-0 flex flex-wrap items-center gap-2 font-ui text-sm text-muted">
          <span
            v-if="badge"
            class="rounded-1 border px-1.5 py-0.5 font-ui text-xs font-medium tracking-wide uppercase"
            :class="badge.class"
          >{{ badge.label }}</span>
          <span>from <b class="font-medium text-fg">{{ g.mine ? "you" : fromName(g) }}</b></span>
          <span v-if="addressed">· to <b class="font-medium text-fg">{{ addressed }}</b></span>
          <span>· {{ rel(g.created) }}</span>
          <span v-if="g.source_context">· {{ g.source_context }}</span>
          <span v-if="writer">· via {{ writer }}</span>
        </p>
        <h1 class="m-0">{{ g.title || "Untitled guide" }}</h1>
        <!-- What it says to a person, first: the document below is the agent's form of it. -->
        <p v-if="g.summary" class="m-0 font-ui text-lg leading-snug text-fg">{{ g.summary }}</p>
        <p
          v-if="expiry"
          class="m-0 font-ui text-sm"
          :class="expiry.soon ? 'text-warn' : 'text-muted'"
        >{{ expiry.text }}</p>
        <p class="m-0 font-ui text-base text-muted">{{ standing }}</p>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <NuxtLink v-if="!g.mine && !handedInByMe" class="btn primary" :to="`/hub/answer/${g.id}`">Respond</NuxtLink>
          <button
            v-if="mayAct && isTask && g.status === 'draft'"
            class="btn primary"
            type="button"
            :disabled="Boolean(busy)"
            @click="taskReady"
          >{{ busy === "ready" ? "Making ready…" : "Ready for agents" }}</button>
          <button
            v-if="mayAct && isTask && g.status === 'published' && !ctx.claims.length"
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
            v-if="mayAct && g.status !== 'consumed' && !reviewing"
            class="btn"
            type="button"
            :disabled="Boolean(busy)"
            @click="close"
          >{{ busy === "close" ? "Archiving…" : "Archive" }}</button>
          <button
            v-if="recallable"
            class="btn"
            type="button"
            :disabled="Boolean(busy)"
            title="Make it private again. It leaves everyone's inbox; anyone who already opened it keeps what they pulled."
            @click="recall"
          >{{ busy === "recall" ? "Taking back…" : "Take back" }}</button>
          <button
            v-if="mayAct && g.status === 'consumed'"
            class="btn"
            type="button"
            :disabled="Boolean(busy)"
            @click="reopen"
          >{{ busy === "reopen" ? "Unarchiving…" : "Unarchive" }}</button>
          <button class="btn" type="button" @click="copy(g.url, $event.currentTarget)">
            <AppIcon name="copy" /><span data-label>Copy share link</span>
          </button>
          <a class="btn" :href="g.url" target="_blank" rel="noopener">
            <AppIcon name="open" />Open share page
          </a>
        </div>
        <!-- What the less obvious buttons do, said beside them rather than in a tooltip: a title
             attribute is delayed, unstyled and never shown on a phone. -->
        <ul v-if="hints.length" class="m-0 flex list-none flex-col gap-1 p-0 font-ui text-xs text-muted">
          <li v-for="h in hints" :key="h">{{ h }}</li>
        </ul>
      </header>

      <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="flex min-w-0 flex-col gap-6">
        <!-- What came back, above the guide it answers: the write-up is the thing to read on a
             handed-in guide, and it read as a 40-line column in a sidebar. -->
        <section
          v-for="k in returned"
          :key="`back:${k.place}`"
          :class="card"
          class="flex flex-col gap-3"
          :aria-label="`What ${who(k.by)} handed in`"
        >
          <h2 :class="label">What came back</h2>
          <p class="m-0 flex flex-wrap items-center gap-2 font-ui text-sm">
            <b class="font-medium">{{ k.mine ? "You" : who(k.by) }}</b>
            <span class="text-muted">handed it in · {{ rel(k.updated) }}</span>
            <span v-if="where(k)" class="font-code text-xs text-muted">· {{ where(k) }}</span>
          </p>
          <p v-if="k.note" class="m-0 font-ui text-sm text-muted">“{{ k.note }}”</p>
          <p v-if="k.report || k.pr" class="m-0 flex flex-wrap gap-x-3 font-ui text-sm">
            <NuxtLink v-if="k.report" :to="`/hub/g/${k.report.id}`">{{ k.report.title || "The write-up" }}</NuxtLink>
            <a v-if="k.pr" :href="k.pr" target="_blank" rel="noopener">The change</a>
          </p>
          <HubHandIn
            :evidence="k.evidence"
            :checks="k.checks"
            :writeup="k.writeup"
            :risk="k.risk"
            @read="read = new Set([...read, k.place])"
          />
          <div v-if="mayAct" class="flex flex-col gap-2">
            <div class="flex flex-wrap gap-2">
              <button
                class="btn primary sm"
                type="button"
                :disabled="Boolean(busy) || !read.has(k.place)"
                @click="accept(k)"
              >{{ busy === `accept:${k.place}` ? "Accepting…" : isTask ? "Approve" : "Accept" }}</button>
              <button
                class="btn outline danger sm"
                type="button"
                :aria-expanded="sendingBack === k.place"
                @click="sendingBack = sendingBack === k.place ? null : k.place"
              >Ask for changes</button>
            </div>
            <p v-if="!read.has(k.place)" class="m-0 font-ui text-xs text-muted">
              Open what it ran before you accept it.
            </p>
            <form v-if="sendingBack === k.place" class="flex flex-col gap-2" @submit.prevent="sendBack(k, $event)">
              <textarea name="why" required placeholder="What is still wrong — the next agent reads this first" />
              <button class="btn danger outline sm self-start" :disabled="Boolean(busy)">
                {{ busy === `back:${k.place}` ? "Sending…" : "Send request" }}
              </button>
            </form>
          </div>
        </section>

        <!-- The document. Sandboxed with no script, on top of a page whose own policy already
             allows none: it can open a link in a new tab and nothing else. -->
        <section class="overflow-hidden rounded-3 bg-bg shadow-edge" aria-label="The guide">
          <iframe
            v-if="frame"
            :src="frame"
            :title="g.title || 'The guide'"
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
               the left and each beat is a dot on it in its tone; "now" is the coral diamond. Who
               opened it, who took it, what they said and showed — the Answers card said these in
               pieces, with no sense of when. -->
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
                  <p v-if="b.said && !b.handIn" class="m-0 rounded-2 bg-field px-3 py-2 text-muted">{{ b.said }}</p>
                  <div v-if="b.proof && !b.handIn" class="rounded-2 bg-field px-3 py-2"><HubEvidence :text="b.proof" :prose="b.prose" /></div>
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

          <!-- Who has it, and what came back. One entry per place: a handoff is taken once per repo. -->
          <section v-if="ctx.claims.length" :class="card" class="flex flex-col gap-4">
            <h2 :class="label">Who has it</h2>
            <div
              v-for="k in ctx.claims"
              :key="k.place"
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
              <p v-if="k.note && k.state !== 'review'" class="m-0 font-ui text-sm text-muted">“{{ k.note }}”</p>
              <p v-if="k.state === 'review'" class="m-0 font-ui text-xs text-muted">What they handed in is beside the guide.</p>
            </div>
          </section>



          <!-- The guides it is tied to. Each opens here, so the chain is walked without leaving. -->
          <section
            v-if="ctx.parent || ctx.children.length || ctx.blocked_by.length || ctx.blocks.length || g.report"
            :class="card"
            class="flex flex-col gap-4 font-ui text-sm"
          >
            <h2 :class="label">Tied to</h2>
            <div v-if="ctx.parent" class="flex flex-col gap-2">
              <p class="m-0 text-muted">Follows</p>
              <HubGuideLink :g="ctx.parent" />
            </div>
            <div v-if="g.report" class="flex flex-col gap-2">
              <p class="m-0 text-muted">Part of a bug report</p>
              <NuxtLink :to="`/hub/report/${g.report}`">{{ g.report_title || "The report" }}</NuxtLink>
            </div>
            <div v-if="ctx.blocked_by.length" class="flex flex-col gap-2">
              <p class="m-0 text-muted">Blocked by</p>
              <HubGuideLink v-for="b in ctx.blocked_by" :key="b.id" :g="b" />
            </div>
            <div v-if="ctx.blocks.length" class="flex flex-col gap-2">
              <p class="m-0 text-muted">Blocks</p>
              <HubGuideLink v-for="b in ctx.blocks" :key="b.id" :g="b" />
            </div>
            <div v-if="ctx.children.length" class="flex flex-col gap-2">
              <p class="m-0 text-muted">Follow-ups · {{ ctx.children.length }}</p>
              <HubGuideLink v-for="c in ctx.children" :key="c.id" :g="c" />
            </div>
          </section>
        </aside>
      </div>
    </article>

    <div v-else-if="isPending" class="flex flex-col gap-4">
      <span class="block h-7 w-2/3 rounded-pill bg-line-strong" aria-hidden="true" />
      <HubSkeleton :rows="3" label="Loading the guide" />
    </div>
  </HubShell>
</template>
