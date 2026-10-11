<!--
  A task handed in for review, checked line by line: what you asked for in its Acceptance, what the
  agent says happened against each line, and the run behind it. Mark a line "not met?" to send it
  back with that line named; Approve stays off while you are asking for changes.

  It lived inside the Needs-you list as a side pane. It is its own component so the guide's page,
  where Needs you now opens an item, reviews a task exactly as the pane did.
-->
<script setup lang="ts">
import type { Task } from "~/types/hub";
import { checkLines, matchChecks, type Sections } from "~/utils/task-docs";

const props = defineProps<{ task: Task }>();
/** Said once the task is approved or sent back, so the page can move on to what is next. */
const emit = defineEmits<{ done: [] }>();
const { onApprove, onReject } = useHub();
const { docsOf, token } = useTaskDocs();

// Its own copy of the documents, so a slow answer for a task you have since left is dropped.
type Docs = { id: string; task: Sections | null; report: Sections | null };
const docs = shallowRef<Docs | null>(null);
onMounted(() => {
  watch(
    [() => props.task, token],
    async ([t]) => {
      const d = await docsOf(t);
      if (props.task.id === t.id) docs.value = { id: t.id, ...d };
    },
    { immediate: true },
  );
});
const asked = computed(() => checkLines(docs.value?.task?.Acceptance));
const claimed = computed(() => checkLines(docs.value?.report?.Verification));
/** Each line asked for, with the evidence the agent filed against it (migration 0028). */
const paired = computed(() => matchChecks(asked.value, props.task.claim?.checks ?? []));
/** Only when the agent sorted it: an older hand-in has one block, and gets the older shape. */
const perLine = computed(() => (props.task.claim?.checks?.length ?? 0) > 0);
const loading = computed(() => docs.value?.id !== props.task.id || !docs.value?.task);

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
// Everything marked belongs to the task it was marked on.
watch(
  () => props.task.id,
  () => {
    flagged.value = new Set();
    runs.value = {};
    note.value = "";
  },
);

const busy = ref(false);
async function act(work: () => Promise<unknown> | undefined) {
  busy.value = true;
  try {
    if ((await work()) !== false) emit("done");
  } finally {
    busy.value = false;
  }
}
const approve = () => act(() => onApprove(props.task));
const sendBack = () => act(() => onReject(props.task, reason.value));

const press =
  "transition-[scale,background-color,border-color,color,box-shadow] duration-150 ease-out active:not-disabled:scale-[0.96]";
const label = "m-0 font-ui text-xs font-semibold tracking-widest text-muted uppercase";
</script>

<template>
  <div class="flex flex-col gap-6">
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
            @click="approve"
          >Approve</button>
          <button class="btn outline danger" :disabled="busy || !reason" @click="sendBack">
            Ask for changes{{ flagged.size ? ` · ${flagged.size} line${flagged.size === 1 ? "" : "s"}` : "" }}
          </button>
          <span v-if="flagged.size || note.trim()" class="font-ui text-xs text-muted">
            Approve is off while you are asking for changes.
          </span>
        </div>
      </footer>
  </div>
</template>
