<!--
  Everything that needs you, in one place: the list of it on the left, the one you picked on the
  right.

  The list is the whole of the Needs-you tab. It used to hold only tasks, with Handed in and Sent to
  you as separate lists underneath — below a task review a screen tall, where nobody knew they were.
  The tab counted four and the list showed one. Now every item is in the list, grouped by why it
  needs you, and the pane asks the one question that item has:

    Waiting for your review   a task handed in: what you asked for against what it says it checked,
                              line by line, "not met?" on each (chosen over a stacked board and a
                              kanban, prototype/task-review)
    Finished: review it       a handoff or bug done where it went: its evidence, then Accept or
                              Ask for changes
    Sent to you               are you taking it — and once you are, how did it go
    Waiting on you, Agent went silent
                              an agent waiting on you, or silent: resume it, or stop the agent

  Surfaces follow the rest of the hub: the list is the cream list with flush rows every lane uses,
  and the item you are reading gets the near-white fill and the coral diamond — coral as a marker,
  never a fill. The pane is one cream card at 24px with a guide page's header.
-->
<script setup lang="ts">
import type { HandedIn, Task } from "~/types/hub";
import type { LaneRow } from "~/utils/lanes";
import { checkLines, matchChecks, type Sections } from "~/utils/task-docs";

const props = defineProps<{ tasks: Task[]; handedIn: HandedIn[]; rows: LaneRow[] }>();
const { onApprove, onReject, onRelease, onAck, onCloseHandedIn, onSendBackHandedIn } = useHub();
const { docsOf, token } = useTaskDocs();

type Item = { key: string; title: string; sub: string; at: string } & (
  | { kind: "task"; task: Task }
  | { kind: "handed"; h: HandedIn }
  | { kind: "sent"; row: LaneRow }
);

const stuck = (t: Task) => /^BLOCKED:/i.test(t.claim?.note || "");
/** The lease runs 30 minutes from the agent's last call (LEASE_MS in apps/api/src/claims.ts). */
const heard = (iso?: string) =>
  iso ? rel(new Date(Date.parse(iso) - 30 * 60 * 1000).toISOString()) : "";
const person = (by: { handle: string; name: string }) =>
  personName(by.name, by.handle) || "A teammate";
// What a row says under the title: the task's own summary, said to a person, when it has one, and
// otherwise what the row has always said.
const task$ = (t: Task, sub: string): Item => ({
  key: `task:${t.id}`,
  kind: "task",
  title: t.title || t.id,
  sub: t.summary || sub,
  // The agent's last call is the hand-in, the question or the silence; the lease runs 30 minutes from it.
  at: t.claim?.lease_until
    ? new Date(Date.parse(t.claim.lease_until) - 30 * 60 * 1000).toISOString()
    : t.created,
  task: t,
});

const groups = computed(() =>
  [
    {
      key: "review",
      short: "To review",
      title: "Waiting for your review",
      note: "Tasks an agent finished. Approve them, or ask for changes.",
      tone: "bg-accent",
      items: props.tasks.filter((t) => t.mine && t.state === "review").map((t) => task$(t, "")),
    },
    {
      key: "handed",
      short: "Finished",
      title: "Finished: review it",
      note: "Done where it was sent. Check the evidence, then accept it or ask for changes.",
      tone: "bg-ok",
      items: props.handedIn.map(
        (h): Item => ({
          key: `handed:${h.id}:${h.place}`,
          kind: "handed",
          title: h.title || h.id,
          sub: `${person(h.by)} handed it in · ${rel(h.at)}`,
          at: h.at,
          h,
        }),
      ),
    },
    {
      key: "sent",
      short: "Sent to you",
      title: "Sent to you",
      note: "Say whether you will do it, and later whether it worked.",
      tone: "bg-coral",
      items: props.rows.map(
        (row): Item => ({
          key: `sent:${row.g.id}`,
          kind: "sent",
          title: row.g.title || "Untitled guide",
          sub: `from ${fromName(row.g) || "someone"} · ${statusLine(row).text || rel(row.g.created)}`,
          at: row.g.created,
          row,
        }),
      ),
    },
    {
      key: "stuck",
      short: "Waiting on you",
      title: "Waiting on you",
      note: "The agent stopped and needs an answer from you.",
      tone: "bg-danger",
      items: props.tasks
        .filter((t) => t.mine && t.state === "claimed" && stuck(t))
        .map((t) => task$(t, t.claim?.note?.replace(/^BLOCKED:\s*/i, "") || "")),
    },
    {
      key: "quiet",
      short: "Went silent",
      title: "Agent went silent",
      note: "No update for 30 minutes. It still holds the work.",
      tone: "bg-warn",
      items: props.tasks
        .filter((t) => t.mine && t.state === "stalled")
        .map((t) => task$(t, plain(t.claim?.note || ""))),
    },
  ].filter((g) => g.items.length),
);
const all = computed(() => groups.value.flatMap((g) => g.items as Item[]));

/**
 * The counts are the filter, as on the Being-worked-on tab: one list, with a chip per reason it needs
 * you and how many, instead of the same list cut into stacked blocks with a heading each. Nothing
 * chosen is everything. A reason whose last item went away cannot stay chosen.
 */
const only = ref<string | null>(null);
watch(groups, (g) => {
  if (only.value && !g.some((x) => x.key === only.value)) only.value = null;
});
const shown = computed(() =>
  groups.value
    .filter((g) => !only.value || g.key === only.value)
    .flatMap((g) => (g.items as Item[]).map((it) => ({ it, g }))),
);
const onlyGroup = computed(() => groups.value.find((g) => g.key === only.value) ?? null);

const selectedKey = ref("");
/** Nothing chosen is the glance table; a chosen item opens its pane beside the list. */
const sel = computed(() => shown.value.find((x) => x.it.key === selectedKey.value)?.it ?? null);
const at = computed(() => shown.value.findIndex((x) => x.it.key === selectedKey.value));
/** Previous and next in the list as filtered. The item changes, the pane stays where it is. */
const step = (by: number) => {
  const next = shown.value[at.value + by];
  if (next) pick(next.it.key);
};
const task = computed(() => (sel.value?.kind === "task" ? sel.value.task : null));
const handed = computed(() => (sel.value?.kind === "handed" ? sel.value.h : null));
const sent = computed(() => (sel.value?.kind === "sent" ? sel.value.row : null));

// ---- a task: its review ------------------------------------------------------------------------

// The review keeps its own copy of the documents, set when they have loaded, so a slow answer for an
// item you have since left is dropped rather than shown. Loads start once mounted, and again when the
// hub has its token (a refusal is not cached).
type Docs = { id: string; task: Sections | null; report: Sections | null };
const docs = shallowRef<Docs | null>(null);
onMounted(() => {
  watch(
    [task, token],
    async ([t]) => {
      if (!t) return;
      const d = await docsOf(t);
      if (task.value?.id === t.id) docs.value = { id: t.id, ...d };
    },
    { immediate: true },
  );
});
const asked = computed(() => checkLines(docs.value?.task?.Acceptance));
const claimed = computed(() => checkLines(docs.value?.report?.Verification));
/**
 * Each line the task asked for, with the evidence the agent filed against it. The agent knows which
 * output answers which line; since 0028 it can say so, and this is where that pays.
 */
const paired = computed(() => matchChecks(asked.value, task.value?.claim?.checks ?? []));
/** Only when the agent sorted it: an older hand-in still has one block, and gets the old screen. */
const perLine = computed(() => (task.value?.claim?.checks?.length ?? 0) > 0);
// Documents that belong to the item you just left count as not loaded, rather than showing its lines.
const loading = computed(
  () => task.value?.state === "review" && (docs.value?.id !== task.value.id || !docs.value?.task),
);

/** Which rows have their run open. A failed row is open until the reader closes it. */
const runs = ref<Record<number, boolean>>({});
const runOpen = (i: number, row: { ok: boolean }) => runs.value[i] ?? !row.ok;
const toggleRun = (i: number, row: { ok: boolean }) => {
  runs.value = { ...runs.value, [i]: !runOpen(i, row) };
};

const flagged = ref<Set<number>>(new Set());
const note = ref("");
function flag(i: number) {
  const next = new Set(flagged.value);
  next.has(i) ? next.delete(i) : next.add(i);
  flagged.value = next;
}
const reason = computed(() =>
  [
    ...asked.value.filter((_, i) => flagged.value.has(i)).map((l) => `Not met: ${l}`),
    note.value.trim(),
  ]
    .filter(Boolean)
    .join("\n"),
);

// ---- a handoff or bug handed in: close it, or send it back -------------------------------------

/** Close waits until what they ran has been opened. See HandIn.vue. */
const read = ref(false);
const sendingBack = ref(false);
const why = ref("");
const handedWho = computed(() => {
  const h = handed.value;
  if (!h) return "";
  return h.agent.startsWith("person-") ? person(h.by) : `${person(h.by)}’s agent`;
});
const handedWhere = computed(() => {
  const h = handed.value;
  if (!h) return "";
  const tree = h.worktree.split("/").filter(Boolean).pop() || "";
  return [h.place, [h.host, tree].filter(Boolean).join(":")].filter(Boolean).join(" on ");
});

// ---- sent to you: take it, pass, or say how it went ------------------------------------------------

const passing = ref(false);
const sentKey = computed(() => sent.value?.state?.key);

// Everything open on the pane belongs to the item it was opened for.
watch(
  () => sel.value?.key,
  () => {
    flagged.value = new Set();
    runs.value = {};
    note.value = "";
    read.value = false;
    sendingBack.value = false;
    why.value = "";
    passing.value = false;
  },
);

const busy = ref(false);
async function act(work: () => Promise<unknown> | undefined) {
  busy.value = true;
  try {
    await work();
  } finally {
    busy.value = false;
  }
}

const pane = ref<HTMLElement | null>(null);
/** Stacked on a phone, the item is below the whole list, so picking one brings it into view. */
async function pick(key: string) {
  selectedKey.value = key;
  if (!window.matchMedia("(max-width: 1023px)").matches) return;
  await nextTick();
  pane.value?.scrollIntoView({ block: "start" });
}

/**
 * A task that can be approved from its row without opening it: nothing it says could break, every
 * Acceptance line has a run filed against it, and no run failed. Anything less opens the review —
 * the table is where a skipped line shows, and a row cannot show it. Needs the documents, so a
 * review row is not offered it until they have loaded.
 */
const loadedDocs = useTaskDocs();
onMounted(() => {
  watch(
    () => props.tasks.filter((t) => t.mine && t.state === "review"),
    (ts) => {
      for (const t of ts) loadedDocs.loadTask(t);
    },
    { immediate: true },
  );
});
function quick(it: Item): it is Item & { kind: "task"; task: Task } {
  if (it.kind !== "task" || it.task.state !== "review" || it.task.claim?.risk) return false;
  const docs = loadedDocs.docsFor(it.task);
  const lines = checkLines(docs.task?.Acceptance);
  if (!lines.length) return false;
  return matchChecks(lines, it.task.claim?.checks ?? []).rows.every((r) => r.ran && r.ok);
}
/** What a review row says about its evidence, and its risk line: for the glance table. */
function glance(it: Item): { text: string; risk: string } | null {
  if (it.kind !== "task" || it.task.state !== "review" || !it.task.claim) return null;
  const checks = it.task.claim.checks ?? [];
  const lines = checkLines(loadedDocs.docsFor(it.task).task?.Acceptance);
  const text = lines.length
    ? `${matchChecks(lines, checks).rows.filter((r) => r.ran).length} of ${lines.length} ${lines.length === 1 ? "line has" : "lines have"} a run`
    : checks.length
      ? plural(checks.length, "check")
      : "no checks filed";
  return { text, risk: it.task.claim.risk || "" };
}
const approving = ref("");
async function approveFromRow(t: Task) {
  approving.value = t.id;
  try {
    await onApprove(t);
  } finally {
    approving.value = "";
  }
}

const press =
  "transition-[scale,background-color,border-color,color,box-shadow] duration-150 ease-out active:not-disabled:scale-[0.96]";
/** The hub's section label, the same words-in-small-capitals every lane heading uses. */
const label = "m-0 font-ui text-xs font-semibold tracking-widest text-muted uppercase";
/** Who handed a task in, as a person reads them: "Bo Adeyemi's agent", or "your agent". */
const whose = (t: Task) =>
  t.claim?.by?.you
    ? "your agent"
    : `${personName(t.claim?.by?.name, t.claim?.by?.handle) || "an agent"}'s agent`;
const TONE = {
  danger: "text-danger",
  accent: "text-accent",
  ok: "text-ok",
  "": "text-muted",
} as const;
</script>

<template>
  <div v-if="all.length" class="flex flex-col gap-6">
    <div class="flex flex-col gap-4">
      <!-- The counts, and the filter: a chip per reason, none chosen is all of them. -->
      <div v-if="!sel" class="flex flex-wrap gap-2 font-ui" role="group" aria-label="Filter by reason">
        <button
          v-for="g in groups"
          :key="g.key"
          type="button"
          class="flex cursor-pointer items-center gap-3 rounded-2 border-0 bg-raised px-4 py-3 text-left shadow-edge transition-colors duration-150"
          :class="only === g.key ? 'bg-field' : 'hover:bg-surface'"
          :aria-pressed="only === g.key"
          @click="only = only === g.key ? null : g.key"
        >
          <span class="text-xl leading-none font-semibold text-fg tabular-nums">{{ g.items.length }}</span>
          <span class="flex min-w-0 items-center gap-2 text-xs leading-tight font-medium text-muted">
            <span class="size-1.5 shrink-0 rounded-pill" :class="g.tone" aria-hidden="true" />
            <span class="min-w-0">{{ g.short }}</span>
          </span>
        </button>
      </div>
      <p v-if="onlyGroup" class="m-0 font-ui text-xs text-muted">{{ onlyGroup.note }}</p>

    </div>

    <!-- The glance: every item on one line, wide enough to read what it says and why it is here
         without opening it. Opening is the row's one link; a task with nothing to look at can be
         approved from it. -->
    <div v-if="!sel" class="overflow-x-auto rounded-3 bg-raised shadow-edge">
      <table class="rows stack flat m-0 w-full font-ui text-sm">
        <thead>
          <tr class="text-xs text-muted">
            <th>Title</th>
            <th>What it says</th>
            <th>Why it is here</th>
            <th>Age</th>
            <th><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ it, g } in shown" :key="it.key">
            <td class="min-w-60 max-w-[24rem] font-medium text-fg">
              <button type="button" class="linkish line-clamp-2 text-left font-medium !text-fg hover:!text-accent" @click="pick(it.key)">{{ it.title }}</button>
              <!-- Whether to trust it, before opening: how much of the Acceptance has a run, and what
                   the agent says could break. -->
              <span v-if="glance(it)" class="mt-1 block text-xs font-normal text-muted">{{ glance(it)?.text }}</span>
              <span v-if="glance(it)?.risk" class="mt-1 line-clamp-1 block text-xs font-normal text-warn">Risk: {{ glance(it)?.risk }}</span>
            </td>
            <td class="max-w-[28rem] text-muted"><span class="line-clamp-2">{{ it.sub || "—" }}</span></td>
            <td class="whitespace-nowrap text-muted">
              <span class="mr-2 inline-block size-3 rounded-pill align-middle" :class="g.tone" aria-hidden="true" />{{ g.short }}
            </td>
            <td class="whitespace-nowrap text-muted tabular-nums">{{ rel(it.at) }}</td>
            <td class="text-right whitespace-nowrap">
              <button
                v-if="quick(it)"
                type="button"
                class="btn sm primary mr-3"
                :disabled="approving === it.task.id"
                @click="approveFromRow(it.task)"
              >Approve</button>
              <button type="button" class="btn sm" @click="pick(it.key)"><AppIcon name="open" />Open</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="flex flex-col gap-4">
      <!-- One item at full width. The list it came from is the glance table, one click back; the
           arrows step through the same filtered list without going there. -->
      <nav class="flex flex-wrap items-center justify-between gap-3 font-ui text-sm" aria-label="Needs you">
        <button type="button" class="linkish cursor-pointer" @click="selectedKey = ''">← All of them</button>
        <span class="flex items-center gap-2">
          <span class="text-muted tabular-nums">{{ at + 1 }} of {{ shown.length }}</span>
          <button type="button" class="btn sm" :disabled="at <= 0" aria-label="Previous" @click="step(-1)">Previous</button>
          <button type="button" class="btn sm" :disabled="at >= shown.length - 1" aria-label="Next" @click="step(1)">Next</button>
        </span>
      </nav>

    <article v-if="sel" ref="pane" class="flex scroll-mt-24 flex-col gap-6 rounded-3 bg-raised px-6 py-6 shadow-edge">
      <!-- ---- a task ---- -->
      <template v-if="task">
        <header class="m-0 flex flex-col gap-2 border-b-0 p-0">
          <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-sm text-muted">
            <span class="rounded-1 border border-accent px-1.5 py-0.5 text-xs font-medium tracking-wide text-accent uppercase">task</span>
            <span v-if="task.claim">from <b class="font-medium text-fg">{{ whose(task) }}</b></span>
            <span v-if="task.target || task.claim?.host" class="font-code text-xs">
              · {{ [task.target, task.claim?.host].filter(Boolean).join(" on ") }}
            </span>
          </p>
          <h2 class="m-0 text-h2">
            <NuxtLink :to="`/hub/g/${task.id}`" class="text-fg no-underline hover:text-accent">{{ task.title }}</NuxtLink>
          </h2>
          <!-- What it says to a person, before anything else about it. -->
          <p v-if="task.summary" class="m-0 font-ui text-base leading-snug text-fg">{{ task.summary }}</p>
          <p class="m-0 flex flex-wrap gap-x-4 gap-y-1 font-ui text-sm">
            <a v-if="task.claim?.report_url" :href="task.claim.report_url" target="_blank" rel="noopener">The write-up</a>
            <template v-if="task.claim?.pr">
              <a v-if="/^https?:\/\//.test(task.claim.pr)" :href="task.claim.pr" target="_blank" rel="noopener">The change</a>
              <span v-else class="text-muted">commit <code class="font-code">{{ task.claim.pr.slice(0, 7) }}</code></span>
            </template>
            <NuxtLink :to="`/hub/g/${task.id}`">Open the guide</NuxtLink>
          </p>
        </header>
        <template v-if="task.state === 'review'">
          <p v-if="loading" class="m-0 font-ui text-sm text-muted">Loading the task and its write-up…</p>
          <template v-else>
            <!-- What they think it could break, before the lines: it says which of them to read
                 hardest. -->
            <p v-if="task.claim?.risk" class="m-0 flex items-baseline gap-2 font-ui text-sm">
              <span class="shrink-0 rounded-1 border border-warn px-1.5 py-0.5 text-xs font-medium tracking-wide text-warn uppercase">risk</span>
              <span class="whitespace-pre-wrap">{{ task.claim.risk }}</span>
            </p>

            <!-- A table: what was asked, what happened in the agent's own plain sentence, and the run
                 behind it folded. A failed row opens itself; a row with no sentence falls back to the
                 line it answers. -->
            <section v-if="perLine" class="flex flex-col gap-3">
              <h3 :class="label">You asked for · {{ asked.length }}</h3>
              <div class="overflow-x-auto rounded-2 shadow-edge">
                <table class="rows m-0 w-full font-ui text-sm">
                  <thead>
                    <tr class="text-xs text-muted">
                      <th><span class="sr-only">Result</span></th>
                      <th>You asked for</th>
                      <th>What happened</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="(row, i) in paired.rows" :key="row.asked">
                      <tr class="group/row">
                        <td>
                          <AppIcon
                            :name="row.ran && row.ok ? 'check' : 'x'"
                            :class="row.ran && row.ok ? 'text-ok' : row.ran ? 'text-danger' : 'text-muted'"
                          />
                        </td>
                        <td :class="flagged.has(i) ? 'text-danger' : 'text-fg'">
                          <AppInline :text="row.asked" />
                          <button
                            class="mt-1 ml-0 inline-flex cursor-pointer items-center gap-1 rounded-pill border-0 py-0.5 text-xs"
                            :class="[press, flagged.has(i) ? 'bg-danger-soft text-danger' : 'bg-transparent text-muted opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:bg-surface hover:text-fg [@media(hover:none)]:opacity-100']"
                            :aria-pressed="flagged.has(i)"
                            :aria-label="flagged.has(i) ? 'Marked not met. Undo' : 'Mark this line not met'"
                            @click="flag(i)"
                          >
                            <template v-if="flagged.has(i)">not met<AppIcon name="x" :size="12" /></template>
                            <template v-else>not met?</template>
                          </button>
                        </td>
                        <td :class="row.ran ? 'text-fg' : 'text-warn'">
                          <template v-if="!row.ran">Nothing was handed in for this line.</template>
                          <AppInline v-else-if="row.says" :text="row.says" />
                          <span v-else class="text-muted">No summary from the agent</span>
                        </td>
                        <td>
                          <button
                            v-if="row.ran"
                            type="button"
                            class="linkish cursor-pointer text-xs whitespace-nowrap"
                            :aria-expanded="runOpen(i, row)"
                            @click="toggleRun(i, row)"
                          >
                            {{ runOpen(i, row) ? "Hide run" : "Show run" }}
                          </button>
                        </td>
                      </tr>
                      <tr v-if="row.ran && runOpen(i, row)" class="run">
                        <td />
                        <td colspan="3"><HubEvidence :text="row.ran" /></td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
              <p class="m-0 font-ui text-xs text-muted">
                {{ asked.length }} asked for, {{ paired.rows.filter((r) => r.ran).length }} with a run
              </p>
            </section>

            <section v-if="perLine && paired.extra.length" class="flex flex-col gap-3">
              <h3 :class="label">Also ran · {{ paired.extra.length }}</h3>
              <div v-for="e in paired.extra" :key="e.check">
                <p class="m-0 font-ui text-sm text-fg">{{ e.check }}</p>
                <HubEvidence :text="e.ran" />
              </div>
            </section>

            <div v-else-if="!perLine" class="grid gap-8 md:grid-cols-2">
              <section class="flex flex-col gap-3">
                <h3 :class="label">You asked for · {{ asked.length }}</h3>
                <ol class="m-0 list-none p-0">
                  <li v-for="(a, i) in asked" :key="a" class="flex items-start gap-2 border-b border-line py-3 first:pt-0 last:border-b-0">
                    <AppInline class="grow font-ui text-sm" :class="flagged.has(i) ? 'text-danger' : 'text-fg'" :text="a" />
                    <button
                      class="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-pill border-0 px-2 py-0.5 font-ui text-xs"
                      :class="[press, flagged.has(i) ? 'bg-danger-soft text-danger' : 'bg-transparent text-muted hover:bg-surface hover:text-fg']"
                      :aria-pressed="flagged.has(i)"
                      :aria-label="flagged.has(i) ? 'Marked not met. Undo' : 'Mark this line not met'"
                      @click="flag(i)"
                    >
                      <template v-if="flagged.has(i)">not met<AppIcon name="x" :size="12" /></template>
                      <template v-else>not met?</template>
                    </button>
                  </li>
                  <li v-if="!asked.length" class="py-2 font-ui text-sm text-muted">The task has no Acceptance lines to check against.</li>
                </ol>
              </section>
              <section class="flex flex-col gap-3">
                <h3 :class="label">It says it checked · {{ claimed.length }}</h3>
                <p
                  v-if="claimed.length && claimed.length < asked.length"
                  class="m-0 rounded-2 bg-warn-soft px-3 py-2 font-ui text-xs text-warn"
                >
                  {{ asked.length }} asked, {{ claimed.length }} claimed. Check which lines it skipped.
                </p>
                <ol class="m-0 list-none p-0">
                  <li v-for="c in claimed" :key="c" class="flex gap-2 border-b border-line py-3 font-ui text-sm first:pt-0 last:border-b-0">
                    <AppIcon name="check" class="mt-0.5 shrink-0 text-ok" />
                    <AppInline :text="c" />
                  </li>
                  <li v-if="!claimed.length" class="py-2 font-ui text-sm text-danger">The write-up has no Verification section.</li>
                </ol>
              </section>
            </div>

            <!-- The older shape, for a hand-in that sent one block of evidence: the columns above are
                 the agent's word, and this is the run itself. -->
            <section v-if="!perLine && task.claim?.evidence" class="flex flex-col gap-3">
              <h3 :class="label">What it ran</h3>
              <HubEvidence :text="task.claim.evidence" />
            </section>

            <details v-if="docs?.report?.['Decisions and rationale'] || docs?.report?.Gotchas">
              <summary class="cursor-pointer font-ui text-sm text-muted">What it decided, and what went wrong</summary>
              <div class="mt-3 grid gap-4 md:grid-cols-2">
                <section v-if="docs?.report?.['Decisions and rationale']">
                  <h4 :class="label">Decisions</h4>
                  <p class="mt-1 mb-0 font-ui text-sm">{{ docs.report["Decisions and rationale"] }}</p>
                </section>
                <section v-if="docs?.report?.Gotchas">
                  <h4 :class="label">Gotchas</h4>
                  <p class="mt-1 mb-0 font-ui text-sm">{{ docs.report.Gotchas }}</p>
                </section>
              </div>
            </details>
          </template>

          <footer class="flex flex-col gap-3 border-t border-line pt-4">
            <label class="sr-only" :for="`why-${task.id}`">Why it goes back</label>
            <textarea
              :id="`why-${task.id}`"
              v-model="note"
              rows="2"
              maxlength="1000"
              class="block w-full resize-y"
              :placeholder="flagged.size ? 'Anything to add for the next agent?' : 'Mark a line not met to send it back, or write why here'"
            />
            <div class="flex flex-wrap items-center gap-2">
              <button
                class="btn primary"
                :disabled="busy || loading || flagged.size > 0 || !!note.trim()"
                @click="act(() => onApprove(task!))"
              >Approve</button>
              <button class="btn outline danger" :disabled="busy || !reason" @click="act(() => onReject(task!, reason))">
                Ask for changes{{ flagged.size ? ` · ${flagged.size} line${flagged.size === 1 ? "" : "s"}` : "" }}
              </button>
              <span v-if="flagged.size || note.trim()" class="font-ui text-xs text-muted">
                Approve is off while you are asking for changes.
              </span>
            </div>
          </footer>
        </template>

        <template v-else>
          <p
            class="m-0 rounded-2 px-4 py-3 font-ui text-sm"
            :class="stuck(task) ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'"
          >
            <template v-if="stuck(task)">{{ task.claim?.note?.replace(/^BLOCKED:\s*/i, "") }}</template>
            <template v-else>
              Last heard {{ heard(task.claim?.lease_until) }}: “{{ task.claim?.note || "nothing said" }}”
            </template>
          </p>
          <p class="m-0 font-ui text-sm text-muted">
            <template v-if="stuck(task)">
              The agent stopped and is waiting for this. Sort it out, then run
              <code>passalong work</code> in
              <AppShorten class="font-code" :value="task.claim?.worktree || ''" :max="28" /> to
              resume it, or stop this agent.
            </template>
            <template v-else>
              It is still locked to that agent. Resume it{{ task.claim?.worktree ? " from " : "" }}<AppShorten v-if="task.claim?.worktree" class="font-code" :value="task.claim.worktree" :max="28" />, or stop this agent so another one can take it.
            </template>
          </p>
          <div>
            <button class="btn outline warn" :disabled="busy" @click="act(() => onRelease(task!))">Stop this agent</button>
          </div>
        </template>
      </template>

      <!-- ---- a handoff or bug, handed in ---- -->
      <template v-else-if="handed">
        <header class="m-0 flex flex-col gap-2 border-b-0 p-0">
          <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-sm text-muted">
            <span
              v-if="kindBadge(handed.kind)"
              class="rounded-1 border px-1.5 py-0.5 text-xs font-medium tracking-wide uppercase"
              :class="kindBadge(handed.kind)?.class"
            >{{ kindBadge(handed.kind)?.label }}</span>
            <span><b class="font-medium text-fg">{{ handedWho }}</b> handed it in · {{ rel(handed.at) }}</span>
            <span v-if="handedWhere" class="font-code text-xs">· {{ handedWhere }}</span>
          </p>
          <h2 class="m-0 text-h2">
            <NuxtLink :to="`/hub/g/${handed.id}`" class="text-fg no-underline hover:text-accent">{{ handed.title || handed.id }}</NuxtLink>
          </h2>
          <p class="m-0 font-ui text-sm"><NuxtLink :to="`/hub/g/${handed.id}`">Open the guide</NuxtLink></p>
        </header>
        <p v-if="handed.note" class="m-0 font-ui text-sm">“{{ handed.note }}”</p>
        <HubHandIn
          :evidence="handed.evidence"
          :checks="handed.checks"
          :writeup="handed.writeup"
          :risk="handed.risk"
          @read="read = true"
        />
        <footer class="flex flex-col gap-3 border-t border-line pt-6">
          <template v-if="sendingBack">
            <label class="font-ui text-sm font-medium" :for="`back-${handed.id}`">What is not done?</label>
            <textarea
              :id="`back-${handed.id}`"
              v-model="why"
              rows="2"
              maxlength="1000"
              class="block w-full resize-y"
              :placeholder="`${handedWho} is told, and it is open to take again.`"
            />
          </template>
          <div class="flex flex-wrap items-center gap-2">
            <template v-if="!sendingBack">
              <button class="btn primary" :disabled="busy || !read" @click="act(() => onCloseHandedIn(handed!))">Accept</button>
              <button class="btn outline danger" :disabled="busy" @click="sendingBack = true">Ask for changes</button>
              <span v-if="!read" class="font-ui text-xs text-muted">Open what they ran before you accept it.</span>
            </template>
            <template v-else>
              <button
                class="btn outline danger"
                :disabled="busy || !why.trim()"
                @click="act(() => onSendBackHandedIn(handed!, why.trim()))"
              >Send request</button>
              <button class="btn" @click="sendingBack = false">Cancel</button>
            </template>
          </div>
        </footer>
      </template>

      <!-- ---- sent to you ---- -->
      <template v-else-if="sent">
        <header class="m-0 flex flex-col gap-2 border-b-0 p-0">
          <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-sm text-muted">
            <span
              v-if="kindBadge(sent.g.kind)"
              class="rounded-1 border px-1.5 py-0.5 text-xs font-medium tracking-wide uppercase"
              :class="kindBadge(sent.g.kind)?.class"
            >{{ kindBadge(sent.g.kind)?.label }}</span>
            <span>from <b class="font-medium text-fg">{{ fromName(sent.g) || "someone" }}</b></span>
            <span>· {{ rel(sent.g.created) }}</span>
            <span v-if="statusLine(sent).text" :class="TONE[statusLine(sent).tone]">· {{ statusLine(sent).text }}</span>
          </p>
          <h2 class="m-0 text-h2">
            <NuxtLink :to="`/hub/g/${sent.g.id}`" class="text-fg no-underline hover:text-accent">{{ sent.g.title || "Untitled guide" }}</NuxtLink>
          </h2>
          <p v-if="sent.g.summary" class="m-0 font-ui text-base leading-snug text-fg">{{ sent.g.summary }}</p>
          <p class="m-0 font-ui text-sm"><NuxtLink :to="`/hub/g/${sent.g.id}`">Read the guide</NuxtLink></p>
        </header>
        <!-- One question at a time, as the row asked it: are you taking it, and once you are, how it
             went. -->
        <template v-if="sentKey === 'unanswered'">
          <div v-if="!passing" class="flex flex-col gap-3">
            <p class="m-0 font-ui text-sm text-muted">
              Are you taking this? {{ fromName(sent.g) || "They" }} can't tell whether you've seen it until you answer. Not for me sends it back to them with your reason.
            </p>
            <div class="flex flex-wrap gap-2">
              <button class="btn primary" :disabled="busy" @click="act(() => onAck(sent!.g, true))">I'll do this</button>
              <button class="btn" @click="passing = true">Not for me</button>
            </div>
          </div>
          <HubAck v-else :g="sent.g" why @done="passing = false" />
        </template>
        <HubVerdict v-else :g="sent.g" />
      </template>
    </article>
  </div>
  </div>
</template>
