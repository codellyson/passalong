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
    Handed in                 a handoff or bug done where it went: its evidence, then Close it or
                              Send back
    Sent to you               are you taking it — and once you are, how did it go
    Stuck on you, Went quiet  an agent waiting on you, or silent: resume it, or stop the agent

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

type Item =
  | { key: string; kind: "task"; title: string; sub: string; task: Task }
  | { key: string; kind: "handed"; title: string; sub: string; h: HandedIn }
  | { key: string; kind: "sent"; title: string; sub: string; row: LaneRow };

const stuck = (t: Task) => /^BLOCKED:/i.test(t.claim?.note || "");
/** The lease runs 30 minutes from the agent's last call (LEASE_MS in apps/api/src/claims.ts). */
const heard = (iso?: string) =>
  iso ? rel(new Date(Date.parse(iso) - 30 * 60 * 1000).toISOString()) : "";
const person = (by: { handle: string; name: string }) =>
  personName(by.name, by.handle) || "A teammate";
const task$ = (t: Task, sub: string): Item => ({
  key: `task:${t.id}`,
  kind: "task",
  title: t.title || t.id,
  sub,
  task: t,
});

const groups = computed(() =>
  [
    {
      key: "review",
      title: "Waiting for your review",
      tone: "bg-accent",
      items: props.tasks
        .filter((t) => t.mine && t.state === "review")
        .map((t) => task$(t, t.claim?.report_title || "Handed in")),
    },
    {
      key: "handed",
      title: "Handed in",
      tone: "bg-ok",
      items: props.handedIn.map(
        (h): Item => ({
          key: `handed:${h.id}:${h.place}`,
          kind: "handed",
          title: h.title || h.id,
          sub: `${person(h.by)} handed it in · ${rel(h.at)}`,
          h,
        }),
      ),
    },
    {
      key: "sent",
      title: "Sent to you",
      tone: "bg-coral",
      items: props.rows.map(
        (row): Item => ({
          key: `sent:${row.g.id}`,
          kind: "sent",
          title: row.g.title || "Untitled guide",
          sub: `from ${fromName(row.g) || "someone"} · ${statusLine(row).text || rel(row.g.created)}`,
          row,
        }),
      ),
    },
    {
      key: "stuck",
      title: "Stuck on you",
      tone: "bg-danger",
      items: props.tasks
        .filter((t) => t.mine && t.state === "claimed" && stuck(t))
        .map((t) => task$(t, t.claim?.note?.replace(/^BLOCKED:\s*/i, "") || "")),
    },
    {
      key: "quiet",
      title: "Went quiet",
      tone: "bg-warn",
      items: props.tasks
        .filter((t) => t.mine && t.state === "stalled")
        .map((t) => task$(t, `last heard ${heard(t.claim?.lease_until)}`)),
    },
  ].filter((g) => g.items.length),
);
const all = computed(() => groups.value.flatMap((g) => g.items as Item[]));

const selectedKey = ref("");
const sel = computed(
  () => all.value.find((i) => i.key === selectedKey.value) ?? all.value[0] ?? null,
);
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
  <div v-if="all.length" class="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
    <nav class="flex flex-col gap-6 lg:sticky lg:top-24" aria-label="Needs you">
      <section v-for="grp in groups" :key="grp.key" class="flex flex-col gap-3">
        <h3 :class="label" class="flex items-center gap-2">
          <span class="size-1.5 shrink-0 rounded-pill" :class="grp.tone" aria-hidden="true" />
          {{ grp.title }} · {{ grp.items.length }}
        </h3>
        <ul class="m-0 list-none rounded-3 bg-raised p-0 shadow-edge">
          <li v-for="(it, n) in grp.items" :key="it.key" class="shadow-[inset_0_1px_0_var(--line)] first:shadow-none">
            <!-- The item you are reading: the near-white fill of a surface you act on, and the coral
                 diamond the hub marks "here" with. The first and last rows take the list's corners. -->
            <button
              type="button"
              class="relative block w-full cursor-pointer border-0 py-4 pr-5 pl-8 text-left transition-colors duration-150 ease-out"
              :class="[
                sel?.key === it.key ? 'bg-field' : 'bg-transparent hover:bg-surface',
                n === 0 ? 'rounded-t-3' : '',
                n === grp.items.length - 1 ? 'rounded-b-3' : '',
              ]"
              :aria-current="sel?.key === it.key ? 'true' : undefined"
              @click="pick(it.key)"
            >
              <span
                v-if="sel?.key === it.key"
                class="absolute top-[1.4rem] left-3 size-1.5 rotate-45 rounded-[1px] bg-coral"
                aria-hidden="true"
              />
              <span class="line-clamp-2 block font-ui text-sm leading-snug font-medium text-fg">{{ it.title }}</span>
              <span v-if="it.sub" class="mt-1 line-clamp-2 block font-ui text-xs leading-snug text-muted">{{ it.sub }}</span>
            </button>
          </li>
        </ul>
      </section>
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

          <footer class="flex flex-col gap-3 border-t border-line pt-6">
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
              It is still locked to that agent. Resume it from
              <AppShorten class="font-code" :value="task.claim?.worktree || ''" :max="28" />, or
              stop this agent so another one can take it.
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
              <button class="btn primary" :disabled="busy || !read" @click="act(() => onCloseHandedIn(handed!))">Close it</button>
              <button class="btn outline danger" :disabled="busy" @click="sendingBack = true">Send back</button>
              <span v-if="!read" class="font-ui text-xs text-muted">Open what they ran to close it.</span>
            </template>
            <template v-else>
              <button
                class="btn outline danger"
                :disabled="busy || !why.trim()"
                @click="act(() => onSendBackHandedIn(handed!, why.trim()))"
              >Send it back</button>
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
          <p class="m-0 font-ui text-sm"><NuxtLink :to="`/hub/g/${sent.g.id}`">Read the guide</NuxtLink></p>
        </header>
        <!-- One question at a time, as the row asked it: are you taking it, and once you are, how it
             went. -->
        <template v-if="sentKey === 'unanswered'">
          <div v-if="!passing" class="flex flex-col gap-3">
            <p class="m-0 font-ui text-sm text-muted">
              Are you taking this? {{ fromName(sent.g) || "They" }} can't tell whether you've seen it until you answer.
            </p>
            <div class="flex flex-wrap gap-2">
              <button class="btn primary" :disabled="busy" @click="act(() => onAck(sent!.g, true))">Take it</button>
              <button class="btn" @click="passing = true">Pass</button>
            </div>
          </div>
          <HubAck v-else :g="sent.g" why @done="passing = false" />
        </template>
        <HubVerdict v-else :g="sent.g" />
      </template>
    </article>
  </div>
</template>
