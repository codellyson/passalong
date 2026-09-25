<!--
  A handoff or bug you wrote that somebody handed in, and your close on it (docs/V2.md §11).

  The same gate a task has, for the same reason: work is not done because whoever did it says so.
  Close accepts it and archives the guide. Send back turns down that one repo's hand-in with a
  reason, which goes to whoever handed it in, and the guide is open there again.

  Send back opens a form on the row, like a task's does: the reason is required, and it is written
  with the work in view.
-->
<script setup lang="ts">
import type { HandedIn } from "~/types/hub";

const props = defineProps<{ h: HandedIn }>();
const { onCloseHandedIn, onSendBackHandedIn } = useHub();

const who = computed(() => {
  const name = personName(props.h.by.name, props.h.by.handle) || "A teammate";
  return props.h.agent.startsWith("person-") ? name : `${name}’s agent`;
});

/** Where it was done: the repo, and the machine and worktree when an agent did it. */
const where = computed(() => {
  const tree = props.h.worktree.split("/").filter(Boolean).pop() || "";
  const machine = [props.h.host, tree].filter(Boolean).join(":");
  return [props.h.place, machine].filter(Boolean).join(" · ");
});

/**
 * What was run, against the line it answers.
 *
 * The evidence used to arrive as one block, so a reviewer read "the sixth is refused with 429" in
 * the guide and then went hunting for `429` in a wall of output, once per line. The agent already
 * knows which output answers which line — it quoted the line — so it says so, and this draws the
 * pairs. A hand-in from before this, or from a person in the browser, has only the block, and that
 * is what the fallback below is for.
 */
const checks = computed(() => {
  try {
    const rows = JSON.parse(props.h.checks || "[]");
    return Array.isArray(rows) ? rows.filter((r) => r?.check) : [];
  } catch {
    return [];
  }
});

/** What was handed in, named. The author is deciding here, and a bug and a task are not judged
 * the same way. See app/utils/kind.ts. */
const badge = computed(() => kindBadge(props.h.kind));

const sending = ref(false);
const why = ref("");
const field = ref<HTMLTextAreaElement | null>(null);
async function askWhy() {
  sending.value = true;
  await nextTick();
  field.value?.focus();
}
function send() {
  if (!why.value.trim()) return;
  onSendBackHandedIn(props.h, why.value.trim());
  sending.value = false;
}
</script>

<template>
  <li
    class="m-0 flex flex-wrap items-start gap-x-4 gap-y-2 border-t-0 border-r-0 border-b-0 border-l-[3px] border-l-accent bg-raised px-4 py-4 shadow-[inset_0_1px_0_var(--line)] first:shadow-none"
  >
    <div class="min-w-0 flex-1 basis-64">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span class="rounded-pill bg-accent-soft px-2 py-0.5 font-ui text-xs font-semibold tracking-wide text-accent uppercase">
          handed in
        </span>
        <span>{{ who }} · {{ rel(h.at) }}</span>
      </div>
      <a
        :href="h.url"
        target="_blank"
        rel="noopener"
        class="mt-2 block text-base leading-snug font-semibold text-fg no-underline hover:text-accent"
      ><span
          v-if="badge"
          class="mr-2 rounded-1 border px-1.5 py-0.5 align-middle font-ui text-xs font-medium tracking-wide uppercase"
          :class="badge.class"
        >{{ badge.label }}</span>{{ h.title || h.id }}</a>
      <p v-if="h.note" class="mt-2 mb-0 text-sm text-muted">“{{ h.note }}”</p>
      <!-- What they had to change to make it work there. Not folded, unlike the evidence below:
           it is the one thing on this row that may mean the guide itself should change, and that
           decision is the author's. The next person to open the guide is shown it too. -->
      <p v-if="h.writeup" class="mt-2 mb-0 border-l-2 border-line-strong pl-3 text-sm whitespace-pre-wrap text-fg">
        {{ h.writeup }}
      </p>
      <!-- The note is what they say; this is what ran. Folded, because the row is a queue of
           several and the decision is usually made on the title and the note. -->
      <details v-if="checks.length || h.evidence" class="mt-2">
        <summary class="cursor-pointer font-ui text-xs text-muted">
          {{ checks.length ? `What they ran, line by line (${checks.length})` : "What they ran" }}
        </summary>
        <!-- One block per line the guide asked for, the evidence under the line it answers. -->
        <ol v-if="checks.length" class="m-0 mt-2 list-none space-y-3 p-0">
          <li v-for="(c, i) in checks" :key="i">
            <p class="m-0 flex items-baseline gap-2 font-ui text-sm font-medium text-fg">
              <span
                v-if="c.cmd"
                class="shrink-0 rounded-1 border px-1.5 py-0.5 font-ui text-xs font-medium"
                :class="c.ok ? 'border-ok text-ok' : 'border-danger text-danger'"
                :title="`${c.cmd} → exited ${c.exit === null ? 'nothing' : c.exit}`"
              >{{ c.ok ? "ran" : "failed" }}</span>
              {{ c.check }}
            </p>
            <HubEvidence :text="c.ran" />
          </li>
        </ol>
        <HubEvidence v-else :text="h.evidence" />
      </details>
      <p v-if="where" class="mt-3 mb-0 font-code text-xs text-muted">{{ where }}</p>

      <div
        v-if="sending"
        class="mt-3 w-full rounded-2 border border-danger bg-danger-soft p-3"
        @keydown.esc="sending = false"
      >
        <label class="block font-ui text-sm font-semibold text-fg" :for="`back-${h.id}-${h.place}`">
          What is not done?
        </label>
        <p class="mt-1 mb-2 font-ui text-xs text-muted">
          {{ who }} is told, and it is open to take again{{ h.place ? ` in ${h.place}` : "" }}.
        </p>
        <textarea
          :id="`back-${h.id}-${h.place}`"
          ref="field"
          v-model="why"
          rows="2"
          maxlength="1000"
          placeholder="the migration never ran on staging"
          class="block w-full resize-y rounded-1 border border-line-strong bg-raised p-2 font-ui text-sm text-fg"
          @keydown.meta.enter="send"
          @keydown.ctrl.enter="send"
        />
        <div class="mt-2 flex flex-wrap gap-2">
          <button class="btn primary" :disabled="!why.trim()" @click="send">send it back</button>
          <button class="btn" @click="sending = false">back</button>
        </div>
      </div>
    </div>

    <div v-if="!sending" class="flex shrink-0 items-center gap-2">
      <button class="btn primary sm" @click="onCloseHandedIn(h)">close</button>
      <button class="btn outline danger sm" @click="askWhy">send back</button>
    </div>
  </li>
</template>
