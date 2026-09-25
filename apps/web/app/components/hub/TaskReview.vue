<!--
  What needs you in the task queue, and the review of the one you pick.

  Chosen over the stacked board, a kanban and a one-at-a-time checklist (prototype/task-review):
  reviewing was the friction, and the stacked board put the task's Acceptance and the agent's
  write-up in two different tabs, with Approve the loudest button on every row. Here they sit side
  by side — what you asked for against what it says it checked — so a write-up that quietly skips a
  line shows up as a shorter column rather than as nothing at all.

  The inbox is grouped by why it needs you: work waiting for review, an agent stuck on you (a
  progress note starting BLOCKED:), and an agent that went quiet. The heading carries the tone, so no
  row repeats a label.

  Sending back is done on the line it is about. Marking any Acceptance line "not met" locks Approve,
  says why, and writes the reason the next agent reads first; a note adds to it or stands alone.

  Surfaces: both panes are 16px with the edge shadow. The inbox is 8px padding around 8px rows, so
  the corners nest. Buttons press to scale(0.96).
-->
<script setup lang="ts">
import type { Task } from "~/types/hub";
import { checkLines, codeParts, matchChecks, type Sections } from "~/utils/task-docs";

const props = defineProps<{ tasks: Task[] }>();
const { onApprove, onReject, onRelease } = useHub();
const { docsOf, token } = useTaskDocs();

const stuck = (t: Task) => /^BLOCKED:/i.test(t.claim?.note || "");
const groups = computed(() =>
  [
    {
      key: "review",
      title: "Waiting for review",
      tone: "bg-accent",
      items: props.tasks.filter((t) => t.mine && t.state === "review"),
    },
    {
      key: "stuck",
      title: "Stuck on you",
      tone: "bg-danger",
      items: props.tasks.filter((t) => t.mine && t.state === "claimed" && stuck(t)),
    },
    {
      key: "quiet",
      title: "Went quiet",
      tone: "bg-warn",
      items: props.tasks.filter((t) => t.mine && t.state === "stalled"),
    },
  ].filter((g) => g.items.length),
);
const needsYou = computed(() => groups.value.flatMap((g) => g.items));

const selectedId = ref("");
const selected = computed(
  () => needsYou.value.find((t) => t.id === selectedId.value) ?? needsYou.value[0] ?? null,
);
// The review keeps its own copy of the documents, set when they have loaded, so a slow answer for an
// item you have since left is dropped rather than shown. Loads start once mounted, and again when the
// hub has its token (a refusal is not cached).
type Docs = { id: string; task: Sections | null; report: Sections | null };
const docs = shallowRef<Docs | null>(null);
onMounted(() => {
  watch(
    [selected, token],
    async ([t]) => {
      if (!t) return;
      const d = await docsOf(t);
      if (selected.value?.id === t.id) docs.value = { id: t.id, ...d };
    },
    { immediate: true },
  );
});
const asked = computed(() => checkLines(docs.value?.task?.Acceptance));
const claimed = computed(() => checkLines(docs.value?.report?.Verification));
/**
 * Each line the task asked for, with the evidence the agent filed against it.
 *
 * The old screen put what was asked in one column, what the write-up claimed in another, and the
 * whole run in a block underneath — so a reviewer read "the sixth is refused with 429" and then
 * went looking for `429` in a wall of output, once per line. The agent knows which output answers
 * which line; since 0028 it can say so, and this is where that pays.
 */
const paired = computed(() => matchChecks(asked.value, selected.value?.claim?.checks ?? []));
/** Only when the agent sorted it: an older hand-in still has one block, and gets the old screen. */
const perLine = computed(() => (selected.value?.claim?.checks?.length ?? 0) > 0);
// Documents that belong to the item you just left count as not loaded, rather than showing its lines.
const loading = computed(
  () =>
    selected.value?.state === "review" &&
    (docs.value?.id !== selected.value.id || !docs.value?.task),
);

const flagged = ref<Set<number>>(new Set());
const note = ref("");
watch(
  () => selected.value?.id,
  () => {
    flagged.value = new Set();
    note.value = "";
  },
);
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
/** Stacked on a phone, the item is below the whole inbox, so picking one brings it into view. */
async function pick(id: string) {
  selectedId.value = id;
  if (!window.matchMedia("(max-width: 767px)").matches) return;
  await nextTick();
  pane.value?.scrollIntoView({ block: "start" });
}

/** The lease runs 30 minutes from the agent's last call (LEASE_MS in apps/api/src/claims.ts). */
const heard = (iso?: string) =>
  iso ? rel(new Date(Date.parse(iso) - 30 * 60 * 1000).toISOString()) : "";
const press =
  "transition-[scale,background-color,border-color,color,box-shadow] duration-150 ease-out active:not-disabled:scale-[0.96]";
</script>

<template>
  <div v-if="needsYou.length" class="grid items-start gap-5 md:grid-cols-[17rem_minmax(0,1fr)]">
    <nav class="rounded-[var(--r-3)] bg-raised p-2 shadow-edge" aria-label="Needs you">
      <!-- Quiet headings, room between groups. The headings were bold, spaced capitals in the group's
           colour, and at 4px apart the groups ran together: every line in the list was shouting.
           The colour moves to a dot, which still sorts the groups at a glance, and the heading
           steps back so the titles are what you read. -->
      <!-- The rows breathe: each is two lines that belong together — a title and what came back
           for it — and at 4px apart with 8px of padding, one row's second line sat as close to the
           next row's first as to its own. The pair is 4px inside and 32px from the next pair —
           8px of gap and 12px of padding on each row — so the eye binds each title to its own line
           before it reads either. -->
      <section v-for="g in groups" :key="g.key" class="mt-4 flex flex-col gap-2 first:mt-0">
        <h2
          class="m-0 flex items-center gap-2 px-3 pt-2 pb-1.5 font-ui text-xs font-medium tracking-wide text-muted uppercase"
        >
          <span class="size-1.5 shrink-0 rounded-pill" :class="g.tone" aria-hidden="true" />
          {{ g.title }}
          <span class="tabular-nums">{{ g.items.length }}</span>
        </h2>
        <button
          v-for="t in g.items"
          :key="t.id"
          class="block w-full rounded-1 border-0 px-3 py-3 text-left transition-[background-color,box-shadow] duration-150 ease-out"
          :class="
            selected?.id === t.id
              ? 'bg-accent-soft shadow-[inset_3px_0_0_var(--accent)]'
              : 'bg-transparent hover:bg-surface'
          "
          :aria-current="selected?.id === t.id ? 'true' : undefined"
          @click="pick(t.id)"
        >
          <!-- Two lines at most, so one long title cannot turn its row into a wall beside the
               others and make the list read as ragged. -->
          <span class="line-clamp-2 block font-ui text-sm font-semibold leading-snug text-fg">{{ t.title }}</span>
          <span class="mt-1 line-clamp-2 font-ui text-xs leading-snug text-muted">
            {{
              g.key === "review"
                ? t.claim?.report_title
                : g.key === "quiet"
                  ? `last heard ${heard(t.claim?.lease_until)}`
                  : t.claim?.note?.replace(/^BLOCKED:\s*/i, "")
            }}
          </span>
        </button>
      </section>
    </nav>

    <article
      v-if="selected"
      ref="pane"
      class="scroll-mt-4 rounded-[var(--r-3)] bg-raised p-6 shadow-edge"
    >
      <header class="mb-5">
        <h2 class="m-0 text-xl leading-snug">
          <a :href="selected.url" target="_blank" rel="noopener" class="text-fg no-underline hover:text-accent">
            {{ selected.title }}
          </a>
        </h2>
        <p class="mt-2 mb-0 flex flex-wrap items-center gap-x-3 gap-y-1 font-ui text-xs text-muted">
          <span class="font-code">{{ selected.target || "no repo" }}</span>
          <span v-if="selected.claim?.host">{{ selected.claim.host }}</span>
          <template v-if="selected.claim?.pr">
            <a
              v-if="/^https?:\/\//.test(selected.claim.pr)"
              :href="selected.claim.pr"
              target="_blank"
              rel="noopener"
            >the change</a>
            <span v-else>commit <code class="font-code">{{ selected.claim.pr.slice(0, 7) }}</code></span>
          </template>
          <a
            v-if="selected.claim?.report_url"
            :href="selected.claim.report_url"
            target="_blank"
            rel="noopener"
          >full write-up</a>
        </p>
      </header>

      <template v-if="selected.state === 'review'">
        <p v-if="loading" class="m-0 font-ui text-sm text-muted">Loading the task and its write-up…</p>
        <template v-else>
          <!-- What they think it could break, before the lines: it says which of them to read
               hardest. -->
          <p v-if="selected.claim?.risk" class="mt-0 mb-4 flex items-baseline gap-2 font-ui text-sm">
            <span class="shrink-0 rounded-1 border border-warn px-1.5 py-0.5 text-xs font-medium tracking-wide text-warn uppercase">
              risk
            </span>
            <span class="whitespace-pre-wrap">{{ selected.claim.risk }}</span>
          </p>
          <!-- Line against line: what was asked, and what ran for it. One row per Acceptance
               line, the evidence under the line it answers, so the reviewer's eye never has to
               carry `429` from one column to a block of output at the bottom of the page. -->
          <ol v-if="perLine" class="m-0 list-none p-0">
            <li
              v-for="(row, i) in paired.rows"
              :key="row.asked"
              class="border-b border-line py-3 first:pt-0 last:border-b-0"
            >
              <div class="flex items-start gap-2">
                <AppIcon
                  :name="row.ran ? 'check' : 'x'"
                  class="mt-0.5 shrink-0"
                  :class="row.ran ? 'text-ok' : 'text-muted'"
                />
                <span class="grow font-ui text-sm" :class="flagged.has(i) ? 'text-danger' : 'text-fg'">
                  <template v-for="(p, k) in codeParts(row.asked)" :key="k"
                    ><code v-if="p.code" class="font-code text-xs">{{ p.text }}</code
                    ><template v-else>{{ p.text }}</template></template
                  >
                </span>
                <!-- Quiet until used: a full button on every line outweighed the lines. -->
                <button
                  class="inline-flex shrink-0 items-center gap-1 rounded-1 border-0 px-1.5 py-0.5 font-ui text-xs"
                  :class="[
                    press,
                    flagged.has(i)
                      ? 'bg-danger-soft text-danger'
                      : 'bg-transparent text-muted hover:bg-surface hover:text-fg',
                  ]"
                  :aria-pressed="flagged.has(i)"
                  :aria-label="flagged.has(i) ? 'Marked not met. Undo' : 'Mark this line not met'"
                  @click="flag(i)"
                >
                  <template v-if="flagged.has(i)">not met<AppIcon name="x" :size="12" /></template>
                  <template v-else>not met?</template>
                </button>
              </div>
              <!-- The gap is the point of the screen: a line with nothing under it says so. -->
              <HubEvidence v-if="row.ran" :text="row.ran" />
              <p v-else class="mt-2 mb-0 font-ui text-xs text-warn">
                Nothing was handed in for this line.
              </p>
            </li>
          </ol>

          <section v-if="perLine && paired.extra.length" class="mt-5">
            <h3 class="m-0 font-ui text-xs font-semibold tracking-widest text-muted uppercase">
              Also ran · {{ paired.extra.length }}
            </h3>
            <!-- Evidence that answers no line it was asked for. Kept, and kept apart: it is often
                 the thing worth reading, and it is never a reason a check was met. -->
            <div v-for="e in paired.extra" :key="e.check" class="mt-3">
              <p class="m-0 font-ui text-sm text-fg">{{ e.check }}</p>
              <HubEvidence :text="e.ran" />
            </div>
          </section>

          <div v-else-if="!perLine" class="grid gap-6 md:grid-cols-2">
            <section>
              <h3 class="m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted">
                You asked for · {{ asked.length }}
              </h3>
              <ol class="m-0 mt-2 list-none p-0">
                <li
                  v-for="(a, i) in asked"
                  :key="a"
                  class="flex items-start gap-2 border-b border-line py-2 last:border-b-0"
                >
                  <span class="grow font-ui text-sm" :class="flagged.has(i) ? 'text-danger' : 'text-fg'">
                    <template v-for="(p, k) in codeParts(a)" :key="k"
                      ><code v-if="p.code" class="font-code text-xs">{{ p.text }}</code
                      ><template v-else>{{ p.text }}</template></template
                    >
                  </span>
                  <!-- Quiet until used: a full button on every line outweighed the lines. -->
                  <button
                    class="inline-flex shrink-0 items-center gap-1 rounded-1 border-0 px-1.5 py-0.5 font-ui text-xs"
                    :class="[
                      press,
                      flagged.has(i)
                        ? 'bg-danger-soft text-danger'
                        : 'bg-transparent text-muted hover:bg-surface hover:text-fg',
                    ]"
                    :aria-pressed="flagged.has(i)"
                    :aria-label="flagged.has(i) ? 'Marked not met. Undo' : 'Mark this line not met'"
                    @click="flag(i)"
                  >
                    <template v-if="flagged.has(i)">not met<AppIcon name="x" :size="12" /></template>
                    <template v-else>not met?</template>
                  </button>
                </li>
                <li v-if="!asked.length" class="py-2 font-ui text-sm text-muted">
                  The task has no Acceptance lines to check against.
                </li>
              </ol>
            </section>

            <section>
              <h3 class="m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted">
                It says it checked · {{ claimed.length }}
              </h3>
              <p
                v-if="claimed.length && claimed.length < asked.length"
                class="mt-2 mb-0 rounded-1 bg-warn-soft px-2 py-1 font-ui text-xs text-warn"
              >
                {{ asked.length }} asked, {{ claimed.length }} claimed. Check which lines it skipped.
              </p>
              <ol class="m-0 mt-2 list-none p-0">
                <li
                  v-for="c in claimed"
                  :key="c"
                  class="flex gap-2 border-b border-line py-2 font-ui text-sm last:border-b-0"
                >
                  <AppIcon name="check" class="mt-0.5 shrink-0 text-ok" />
                  <span
                    ><template v-for="(p, k) in codeParts(c)" :key="k"
                      ><code v-if="p.code" class="font-code text-xs">{{ p.text }}</code
                      ><template v-else>{{ p.text }}</template></template
                    ></span
                  >
                </li>
                <li v-if="!claimed.length" class="py-2 font-ui text-sm text-danger">
                  The write-up has no Verification section.
                </li>
              </ol>
            </section>
          </div>

          <!-- The older shape, for a hand-in that sent one block of evidence rather than sorting
               it: both columns above are the agent's word, and this is the run itself. -->
          <section v-if="!perLine && selected.claim?.evidence" class="mt-6">
            <h3 class="m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted">
              What it ran
            </h3>
            <HubEvidence :text="selected.claim.evidence" />
          </section>

          <details
            v-if="docs?.report?.['Decisions and rationale'] || docs?.report?.Gotchas"
            class="mt-6"
          >
            <summary class="cursor-pointer font-ui text-sm text-muted">
              What it decided, and what went wrong
            </summary>
            <div class="mt-3 grid gap-4 md:grid-cols-2">
              <section v-if="docs?.report?.['Decisions and rationale']">
                <h4 class="m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted">Decisions</h4>
                <p class="mt-1 mb-0 font-ui text-sm">{{ docs.report["Decisions and rationale"] }}</p>
              </section>
              <section v-if="docs?.report?.Gotchas">
                <h4 class="m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted">Gotchas</h4>
                <p class="mt-1 mb-0 font-ui text-sm">{{ docs.report.Gotchas }}</p>
              </section>
            </div>
          </details>
        </template>

        <footer class="mt-6 border-t border-line pt-5">
          <label class="sr-only" :for="`why-${selected.id}`">Why it goes back</label>
          <textarea
            :id="`why-${selected.id}`"
            v-model="note"
            rows="2"
            maxlength="1000"
            class="block w-full resize-y rounded-1 border border-line-strong bg-raised p-2 font-ui text-sm"
            :placeholder="
              flagged.size
                ? 'Anything to add for the next agent?'
                : 'Mark a line not met to send it back, or write why here'
            "
          />
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button
              class="btn primary"
              :disabled="busy || loading || flagged.size > 0 || !!note.trim()"
              @click="act(() => onApprove(selected!))"
            >approve</button>
            <button
              class="btn outline danger"
              :disabled="busy || !reason"
              @click="act(() => onReject(selected!, reason))"
            >
              send back{{ flagged.size ? ` · ${flagged.size} line${flagged.size === 1 ? "" : "s"}` : "" }}
            </button>
            <span v-if="flagged.size || note.trim()" class="font-ui text-xs text-muted">
              Approve is off while there is a reason to send it back.
            </span>
          </div>
        </footer>
      </template>

      <template v-else>
        <p
          class="m-0 rounded-1 px-3 py-2 font-ui text-sm"
          :class="stuck(selected) ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'"
        >
          <template v-if="stuck(selected)">{{ selected.claim?.note?.replace(/^BLOCKED:\s*/i, "") }}</template>
          <template v-else>
            Last heard {{ heard(selected.claim?.lease_until) }}: “{{ selected.claim?.note || "nothing said" }}”
          </template>
        </p>
        <p class="mt-3 mb-0 font-ui text-sm text-muted">
          <template v-if="stuck(selected)">
            The agent stopped and is waiting for this. Sort it out, then run
            <code>passalong work</code> in
            <AppShorten class="font-code" :value="selected.claim?.worktree || ''" :max="28" /> to
            resume it, or take it back.
          </template>
          <template v-else>
            It is still locked to that agent. Resume it from
            <AppShorten class="font-code" :value="selected.claim?.worktree || ''" :max="28" />, or
            take it back so another agent can.
          </template>
        </p>
        <div class="mt-4">
          <button
            class="btn outline warn"
            :disabled="busy"
            @click="act(() => onRelease(selected!))"
          >take back</button>
        </div>
      </template>
    </article>
  </div>
</template>
