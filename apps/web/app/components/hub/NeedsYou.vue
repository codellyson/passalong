<!--
  Everything that needs you, in one list, grouped by why it needs you: a task waiting for your
  review, a handoff or bug finished where it went, a guide sent to you, an agent waiting on you or
  gone silent. The counts on top are stat cards that filter it.

  Each item opens on its own guide page, which asks the one question that item has — a task's
  line-by-line review (HubTaskReview), a hand-in's Accept or Ask for changes, a sent guide's I'll do
  this — and steps to the one before and after through the list as filtered (useReviewQueue). It
  used to open in a pane beside the list; the page holds more, and one place to answer is enough.
-->
<script setup lang="ts">
import type { HandedIn, Task } from "~/types/hub";
import type { LaneRow } from "~/utils/lanes";
import { checkLines, matchChecks } from "~/utils/task-docs";

const props = defineProps<{ tasks: Task[]; handedIn: HandedIn[]; rows: LaneRow[] }>();
const { data, onApprove } = useHub();

type Item = { key: string; title: string; sub: string; at: string } & (
  | { kind: "task"; task: Task }
  | { kind: "handed"; h: HandedIn }
  | { kind: "sent"; row: LaneRow }
);

const stuck = (t: Task) => /^BLOCKED:/i.test(t.claim?.note || "");
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
      items: props.tasks
        .filter((t) => (t.mine || t.manage) && t.state === "review")
        .map((t) => task$(t, "")),
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
        .filter((t) => (t.mine || t.manage) && t.state === "claimed" && stuck(t))
        .map((t) => task$(t, t.claim?.note?.replace(/^BLOCKED:\s*/i, "") || "")),
    },
    {
      key: "quiet",
      short: "Went silent",
      title: "Agent went silent",
      note: "No update for 30 minutes. It still holds the work.",
      tone: "bg-warn",
      items: props.tasks
        .filter((t) => (t.mine || t.manage) && t.state === "stalled")
        .map((t) => task$(t, plain(t.claim?.note || ""))),
    },
  ].filter((g) => g.items.length),
);
const all = computed(() => groups.value.flatMap((g) => g.items as Item[]));
const previews = computed(() => new Map(data.value.guides.map((g) => [g.id, g.preview_image])));
const imageFor = (it: Item) =>
  it.kind === "sent"
    ? it.row.g.preview_image
    : previews.value.get(it.kind === "task" ? it.task.id : it.h.id);
const guideId = (it: Item) =>
  it.kind === "sent" ? it.row.g.id : it.kind === "task" ? it.task.id : it.h.id;

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

// Each item opens on its own guide page. The list hands over its order as filtered, so that
// page can step to the one before and after (useReviewQueue).
const { remember: rememberQueue } = useReviewQueue();
const remember = () =>
  rememberQueue(shown.value.map(({ it }) => ({ id: guideId(it), title: it.title })));

/**
 * A task that can be approved from its row without opening it: nothing it says could break, every
 * Acceptance line has a run filed against it, and no run failed. Anything less opens the review —
 * the table is where a skipped line shows, and a row cannot show it. Needs the documents, so a
 * review row is not offered it until they have loaded.
 */
const loadedDocs = useTaskDocs();
onMounted(() => {
  watch(
    () => props.tasks.filter((t) => (t.mine || t.manage) && t.state === "review"),
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

/** The hub's section label, the same words-in-small-capitals every lane heading uses. */
const label = "m-0 font-ui text-xs font-semibold tracking-widest text-muted uppercase";
/** Who handed a task in, as a person reads them: "Bo Adeyemi's agent", or "your agent". */
const whose = (t: Task) =>
  t.claim?.by?.you
    ? "your agent"
    : `${personName(t.claim?.by?.name, t.claim?.by?.handle) || "an agent"}'s agent`;
</script>

<template>
  <div v-if="all.length" class="flex flex-col gap-6">
    <div class="flex flex-col gap-4">
      <!-- The counts, as stat cards that are also the filter: one per reason, none chosen is all
           of them. Equal widths, so the numbers line up and read as a row of figures. -->
      <div class="grid grid-cols-2 gap-3 font-ui sm:grid-cols-4" role="group" aria-label="Filter by reason">
        <button
          v-for="g in groups"
          :key="g.key"
          type="button"
          class="flex cursor-pointer flex-col items-start gap-3 rounded-3 border-0 bg-raised px-4 py-4 text-left shadow-edge transition-colors duration-150"
          :class="only === g.key ? 'bg-field ring-1 ring-line-strong' : 'hover:bg-surface'"
          :aria-pressed="only === g.key"
          @click="only = only === g.key ? null : g.key"
        >
          <span class="flex min-w-0 items-center gap-2 text-xs leading-tight font-medium text-muted">
            <span class="size-1.5 shrink-0 rounded-pill" :class="g.tone" aria-hidden="true" />
            <span class="min-w-0">{{ g.short }}</span>
          </span>
          <span class="text-3xl leading-none font-semibold text-fg tabular-nums">{{ g.items.length }}</span>
        </button>
      </div>
      <p v-if="onlyGroup" class="m-0 font-ui text-xs text-muted">{{ onlyGroup.note }}</p>

    </div>

    <!-- The glance: every item on one line, wide enough to read what it says and why it is here
         without opening it. Opening is the row's one link; a task with nothing to look at can be
         approved from it. -->
    <div class="overflow-x-auto rounded-3 bg-raised shadow-edge">
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
              <div class="flex items-start gap-3">
                <HubGuideThumbnail :image="imageFor(it)" :guide="guideId(it)" :title="it.title" keep-space />
                <div class="min-w-0 flex-1">
              <NuxtLink :to="`/hub/g/${guideId(it)}`" class="linkish line-clamp-2 font-medium !text-fg hover:!text-accent" @click="remember">{{ it.title }}</NuxtLink>
              <!-- Whether to trust it, before opening: how much of the Acceptance has a run, and what
                   the agent says could break. -->
              <span v-if="glance(it)" class="mt-1 block text-xs font-normal text-muted">{{ glance(it)?.text }}</span>
              <span v-if="glance(it)?.risk" class="mt-1 line-clamp-1 block text-xs font-normal text-warn">Risk: {{ glance(it)?.risk }}</span>
              </div>
              </div>
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
              <NuxtLink :to="`/hub/g/${guideId(it)}`" class="btn sm no-underline" @click="remember"><AppIcon name="open" />Open</NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</template>
