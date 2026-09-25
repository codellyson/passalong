<!--
  What came back with a hand-in, for whoever is deciding whether to accept it: what it could break,
  what had to be adapted, and what was run, line by line.

  Shared by the two review rows — a handoff or bug handed in, and a task in review — because the
  task row showed none of it: its author approved from the title and a link to the write-up, with
  the evidence one click further away than the button.

  `read` is emitted the first time the evidence is opened. The rows hold their accept button until
  then: that is the "I personally verified it" line of a PR template, done as the thing it asks for
  rather than a box anyone can tick. A hand-in with no evidence at all (a person in the browser)
  is read on arrival, since there is nothing to open.
-->
<script setup lang="ts">
const props = defineProps<{
  evidence?: string;
  /** JSON from the claim row, or already parsed. */
  checks?:
    | string
    | { check: string; ran: string; cmd?: string; exit?: number | null; ok?: boolean }[];
  writeup?: string;
  risk?: string;
}>();
const emit = defineEmits<{ read: [] }>();

/**
 * What was run, against the line it answers. The agent already knows which output answers which
 * line — it quoted the line — so it says so, and this draws the pairs. A hand-in from before that,
 * or from a person in the browser, has only the block, and that is what the fallback is for.
 */
const lines = computed(() => {
  const raw = props.checks;
  try {
    const rows = typeof raw === "string" ? JSON.parse(raw || "[]") : raw || [];
    return Array.isArray(rows) ? rows.filter((r) => r?.check) : [];
  } catch {
    return [];
  }
});
const any = computed(() => lines.value.length > 0 || Boolean(props.evidence?.trim()));

onMounted(() => {
  if (!any.value) emit("read");
});
let told = false;
function toggled(e: Event) {
  if (told || !(e.target as HTMLDetailsElement).open) return;
  told = true;
  emit("read");
}
</script>

<template>
  <div>
    <!-- What they think it could break. First, because it says where to look in what follows. -->
    <p v-if="risk" class="mt-2 mb-0 flex items-baseline gap-2 text-sm text-fg">
      <span class="shrink-0 rounded-1 border border-warn px-1.5 py-0.5 font-ui text-xs font-medium tracking-wide text-warn uppercase">
        risk
      </span>
      <span class="whitespace-pre-wrap">{{ risk }}</span>
    </p>
    <!-- What they had to change to make it work there. Not folded: it may mean the guide itself
         should change, and that decision is the author's. -->
    <p v-if="writeup" class="mt-2 mb-0 border-l-2 border-line-strong pl-3 text-sm whitespace-pre-wrap text-fg">
      {{ writeup }}
    </p>
    <details v-if="any" class="mt-2" @toggle="toggled">
      <summary class="cursor-pointer font-ui text-xs text-muted">
        {{ lines.length ? `What they ran, line by line (${lines.length})` : "What they ran" }}
      </summary>
      <ol v-if="lines.length" class="m-0 mt-2 list-none space-y-3 p-0">
        <li v-for="(c, i) in lines" :key="i">
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
      <HubEvidence v-else :text="evidence || ''" />
    </details>
  </div>
</template>
