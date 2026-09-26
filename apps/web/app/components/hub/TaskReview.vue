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

  Surfaces follow the rest of the hub: the inbox is the same cream list with flush rows every lane
  uses, under the same small-capital heading, and the row you are reading gets the near-white fill
  and the coral diamond — coral as a marker, never a fill. The review is one cream card at 24px. It
  used to be its own look (a pink selected row, a coral bar, lowercase buttons, evidence in a box
  inside a box), which is what made it read as a different product from the page around it.
-->
<script setup lang="ts">
import type { Task } from "~/types/hub";
import { checkLines, matchChecks, type Sections } from "~/utils/task-docs";

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
/** The hub's section label, the same words-in-small-capitals every lane heading uses. */
const label = "m-0 font-ui text-xs font-semibold tracking-widest text-muted uppercase";
/** Who handed it in, as a person reads them: "Bo Adeyemi's agent", or "your agent". */
const whose = (t: Task) =>
  t.claim?.by?.you
    ? "your agent"
    : `${personName(t.claim?.by?.name, t.claim?.by?.handle) || "an agent"}'s agent`;
</script>

<template>
  <div v-if="needsYou.length" class="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
    <nav class="flex flex-col gap-6" aria-label="Needs you">
      <section v-for="g in groups" :key="g.key" class="flex flex-col gap-3">
        <h3 :class="label" class="flex items-center gap-2">
          <span class="size-1.5 shrink-0 rounded-pill" :class="g.tone" aria-hidden="true" />
          {{ g.title }} · {{ g.items.length }}
        </h3>
        <ul class="m-0 list-none rounded-3 bg-raised p-0 shadow-edge">
          <li
            v-for="t in g.items"
            :key="t.id"
            class="shadow-[inset_0_1px_0_var(--line)] first:shadow-none"
          >
            <!-- The row you are reading: the near-white fill of a surface you act on, and the coral
                 diamond the hub marks "here" with. The first and last rows take the list's corners. -->
            <button
              type="button"
              class="relative block w-full cursor-pointer border-0 py-4 pr-5 pl-8 text-left transition-colors duration-150 ease-out"
              :class="[
                selected?.id === t.id ? 'bg-field' : 'bg-transparent hover:bg-surface',
                t === g.items[0] ? 'rounded-t-3' : '',
                t === g.items.at(-1) ? 'rounded-b-3' : '',
              ]"
              :aria-current="selected?.id === t.id ? 'true' : undefined"
              @click="pick(t.id)"
            >
              <span
                v-if="selected?.id === t.id"
                class="absolute top-[1.4rem] left-3 size-1.5 rotate-45 rounded-[1px] bg-coral"
                aria-hidden="true"
              />
              <span class="line-clamp-2 block font-ui text-sm leading-snug font-medium text-fg">{{ t.title }}</span>
              <span class="mt-1 line-clamp-2 block font-ui text-xs leading-snug text-muted">
                {{
                  g.key === "review"
                    ? t.claim?.report_title
                    : g.key === "quiet"
                      ? `last heard ${heard(t.claim?.lease_until)}`
                      : t.claim?.note?.replace(/^BLOCKED:\s*/i, "")
                }}
              </span>
            </button>
          </li>
        </ul>
      </section>
    </nav>

    <article
      v-if="selected"
      ref="pane"
      class="flex scroll-mt-24 flex-col gap-6 rounded-3 bg-raised px-6 py-6 shadow-edge"
    >
      <!-- The same header a guide page has: what it is and where it came from, then the title. -->
      <header class="m-0 flex flex-col gap-2 border-b-0 p-0">
        <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-sm text-muted">
          <span class="rounded-1 border border-accent px-1.5 py-0.5 text-xs font-medium tracking-wide text-accent uppercase">task</span>
          <span v-if="selected.claim">from <b class="font-medium text-fg">{{ whose(selected) }}</b></span>
          <span v-if="selected.target || selected.claim?.host" class="font-code text-xs">
            · {{ [selected.target, selected.claim?.host].filter(Boolean).join(" on ") }}
          </span>
        </p>
        <h2 class="m-0 text-h2">
          <NuxtLink :to="`/hub/g/${selected.id}`" class="text-fg no-underline hover:text-accent">{{ selected.title }}</NuxtLink>
        </h2>
        <p class="m-0 flex flex-wrap gap-x-4 gap-y-1 font-ui text-sm">
          <a v-if="selected.claim?.report_url" :href="selected.claim.report_url" target="_blank" rel="noopener">The write-up</a>
          <template v-if="selected.claim?.pr">
            <a v-if="/^https?:\/\//.test(selected.claim.pr)" :href="selected.claim.pr" target="_blank" rel="noopener">The change</a>
            <span v-else class="text-muted">commit <code class="font-code">{{ selected.claim.pr.slice(0, 7) }}</code></span>
          </template>
          <NuxtLink :to="`/hub/g/${selected.id}`">Open the guide</NuxtLink>
        </p>
      </header>

      <template v-if="selected.state === 'review'">
        <p v-if="loading" class="m-0 font-ui text-sm text-muted">Loading the task and its write-up…</p>
        <template v-else>
          <!-- What they think it could break, before the lines: it says which of them to read
               hardest. -->
          <p v-if="selected.claim?.risk" class="m-0 flex items-baseline gap-2 font-ui text-sm">
            <span class="shrink-0 rounded-1 border border-warn px-1.5 py-0.5 text-xs font-medium tracking-wide text-warn uppercase">risk</span>
            <span class="whitespace-pre-wrap">{{ selected.claim.risk }}</span>
          </p>

          <!-- Line against line: what was asked, and what ran for it, the evidence under the line it
               answers. -->
          <section v-if="perLine" class="flex flex-col gap-3">
            <h3 :class="label">You asked for · {{ asked.length }}</h3>
            <ol class="m-0 list-none p-0">
              <li v-for="(row, i) in paired.rows" :key="row.asked" class="border-b border-line py-3 first:pt-0 last:border-b-0">
                <div class="flex items-start gap-2">
                  <AppIcon :name="row.ran ? 'check' : 'x'" class="mt-0.5 shrink-0" :class="row.ran ? 'text-ok' : 'text-muted'" />
                  <AppInline class="grow font-ui text-sm" :class="flagged.has(i) ? 'text-danger' : 'text-fg'" :text="row.asked" />
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
                </div>
                <HubEvidence v-if="row.ran" :text="row.ran" />
                <p v-else class="mt-2 mb-0 font-ui text-xs text-warn">Nothing was handed in for this line.</p>
              </li>
            </ol>
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
          <section v-if="!perLine && selected.claim?.evidence" class="flex flex-col gap-3">
            <h3 :class="label">What it ran</h3>
            <HubEvidence :text="selected.claim.evidence" />
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

        <footer class="flex flex-col gap-3 border-t border-line pt-6">
          <label class="sr-only" :for="`why-${selected.id}`">Why it goes back</label>
          <textarea
            :id="`why-${selected.id}`"
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
              @click="act(() => onApprove(selected!))"
            >Approve</button>
            <button class="btn outline danger" :disabled="busy || !reason" @click="act(() => onReject(selected!, reason))">
              Send back{{ flagged.size ? ` · ${flagged.size} line${flagged.size === 1 ? "" : "s"}` : "" }}
            </button>
            <span v-if="flagged.size || note.trim()" class="font-ui text-xs text-muted">
              Approve is off while there is a reason to send it back.
            </span>
          </div>
        </footer>
      </template>

      <template v-else>
        <p
          class="m-0 rounded-2 px-4 py-3 font-ui text-sm"
          :class="stuck(selected) ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'"
        >
          <template v-if="stuck(selected)">{{ selected.claim?.note?.replace(/^BLOCKED:\s*/i, "") }}</template>
          <template v-else>
            Last heard {{ heard(selected.claim?.lease_until) }}: “{{ selected.claim?.note || "nothing said" }}”
          </template>
        </p>
        <p class="m-0 font-ui text-sm text-muted">
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
        <div>
          <button class="btn outline warn" :disabled="busy" @click="act(() => onRelease(selected!))">Take it back</button>
        </div>
      </template>
    </article>
  </div>
</template>
