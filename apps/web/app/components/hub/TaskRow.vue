<!--
  One task. The same anatomy as a handoff row — pills, then the title at one left edge, then one
  line of facts — so the two boards scan the same way.

  What changes by column is the one move the row offers, and only on your own tasks: moving a task
  is its author's call, and offering a teammate buttons the server refuses is a board that lies.

    review    approve, or send it back with a reason — and the write-up to read before either
    claimed   stop the agent holding it
    stalled   stop the agent holding it; it went silent, and the row says since when
    draft     make it ready

  Reject opens a form on the row, like a failed verdict does: the reason is what the next agent
  reads before it starts again, so it is written with the task in view and it is required.
-->
<script setup lang="ts">
import type { Task } from "~/types/hub";

const props = defineProps<{ t: Task }>();
const { onApprove, onReject, onRelease, onTaskReady } = useHub();
/** Approve waits until what they ran has been opened. See HandIn.vue. */
const read = ref(false);

/**
 * Where the task stands, as the words on its facts line and their tone — the inbox row's way of
 * saying it. It used to be a filled pill above the title and a coloured stripe down the row, a look
 * no other list in the hub had.
 */
const STATE: Record<Task["state"], { text: string; tone: string }> = {
  review: { text: "handed in, waiting on you", tone: "text-accent" },
  stalled: { text: "agent went silent", tone: "text-warn" },
  claimed: { text: "being worked on", tone: "text-ok" },
  ready: { text: "ready for the next agent", tone: "text-muted" },
  blocked: { text: "blocked", tone: "text-muted" },
  draft: { text: "draft", tone: "text-muted" },
  done: { text: "done", tone: "text-muted" },
};
const state = computed(() => STATE[props.t.state]);
const badge = kindBadge("task");

/**
 * The facts line, as a list: who or whose agent has it, the repo and where it runs, when, where it
 * stands, and its id. Joined with a separator between items only, so a task nobody holds does not
 * open its line on a stray "·".
 */
const facts = computed(() => {
  const t = props.t;
  const out: { text: string; lead?: string; strong?: boolean; code?: boolean; tone?: string }[] =
    [];
  if (where.value) out.push({ text: by.value, strong: true });
  else if (t.for_me && !t.mine) out.push({ text: "for you", strong: true });
  else if (t.to) out.push({ lead: "for ", text: t.to, strong: true });
  if (t.target) out.push({ text: shorten(t.target, 28).text, code: true });
  if (where.value) out.push({ text: where.value, code: true });
  out.push({
    text: t.state === "stalled" && heard.value ? `last heard ${rel(heard.value)}` : rel(t.created),
  });
  out.push({ text: state.value.text, tone: state.value.tone });
  out.push({ text: t.id, code: true });
  return out;
});

/** Where the agent that has it is working: the host and the last part of the worktree path. */
const where = computed(() => {
  const c = props.t.claim;
  if (!c) return "";
  const tree = c.worktree.split("/").filter(Boolean).pop() || "";
  return [c.host, tree].filter(Boolean).join(":");
});

/** Whose agent has it: yours, or a teammate's. */
const by = computed(() => {
  const b = props.t.claim?.by;
  if (!b || b.you) return "Your agent";
  const name = personName(b.name, b.handle);
  return name ? `${name}'s agent` : "A teammate's agent";
});

/**
 * When the agent was last heard from. The lease runs 30 minutes from its last call (LEASE_MS in
 * apps/api/src/claims.ts), so that is the lease less 30 minutes — the lease itself is when it
 * stalled, which is not the moment anyone wants to know.
 */
const heard = computed(() => {
  const until = props.t.claim?.lease_until;
  return until ? new Date(Date.parse(until) - 30 * 60 * 1000).toISOString() : "";
});

/**
 * Yours, or assigned to you, in a team and not finished: you may give it to someone else there. An
 * assignee passing it on is how work that landed on the wrong desk moves without its author.
 */
const canAssign = computed(
  () =>
    (props.t.mine || Boolean(props.t.for_me)) && Boolean(props.t.team) && props.t.state !== "done",
);
const assigning = ref(false);
const pickerRoot = ref<HTMLElement | null>(null);
function onDocument(e: MouseEvent) {
  if (assigning.value && !pickerRoot.value?.contains(e.target as Node)) assigning.value = false;
}
onMounted(() => document.addEventListener("click", onDocument));
onBeforeUnmount(() => document.removeEventListener("click", onDocument));

const rejecting = ref(false);
const why = ref("");
const field = ref<HTMLTextAreaElement | null>(null);
async function askWhy() {
  rejecting.value = true;
  await nextTick();
  field.value?.focus();
}
function send() {
  if (!why.value.trim()) return;
  onReject(props.t, why.value);
  rejecting.value = false;
}
</script>

<template>
  <!-- The inbox row's anatomy: kind and title on one line, then the facts in muted text with where
       it stands last, and the author's one move on the right. The list's ends round it. -->
  <li
    class="m-0 flex flex-wrap items-start gap-x-4 gap-y-2 bg-raised px-5 py-4 shadow-[inset_0_1px_0_var(--line)] first:rounded-t-[var(--r-3)] first:shadow-none last:rounded-b-[var(--r-3)]"
  >
    <div class="min-w-0 flex-1 basis-72">
      <p class="m-0 flex flex-wrap items-baseline gap-x-2">
        <span
          v-if="badge"
          class="shrink-0 rounded-1 border px-1.5 py-0.5 font-ui text-xs font-medium tracking-wide uppercase"
          :class="badge.class"
        >{{ badge.label }}</span>
        <NuxtLink
          :to="`/hub/g/${t.id}`"
          class="text-base leading-snug font-semibold text-fg no-underline hover:text-accent"
        >{{ t.title || t.id }}</NuxtLink>
      </p>
      <p class="mt-1 mb-0 flex flex-wrap gap-x-1.5 font-ui text-sm text-muted">
        <span v-for="(f, i) in facts" :key="i" :class="[f.tone, f.code ? 'font-code text-xs leading-5' : '']"
          ><template v-if="i">· </template>{{ f.lead }}<b v-if="f.strong" class="font-medium text-fg">{{ f.text }}</b
          ><template v-else>{{ f.text }}</template></span
        >
      </p>

      <p v-if="t.claim?.note" class="mt-2 mb-0 text-sm text-muted">“{{ t.claim.note }}”</p>
      <p v-if="t.state === 'review' && t.claim?.report" class="mt-2 mb-0 text-sm">
        Came back with
        <a :href="t.claim.report_url || undefined" target="_blank" rel="noopener">{{
          t.claim.report_title || t.claim.report
        }}</a>
        <!-- `pr` is whatever the agent had: a PR link when there is one, and more often the hash
             of the commit it made, which has nowhere to link to from here. -->
        <template v-if="t.claim.pr && /^https?:\/\//.test(t.claim.pr)">
          · <a :href="t.claim.pr" target="_blank" rel="noopener">the change</a>
        </template>
        <template v-else-if="t.claim.pr">
          · commit <code class="font-code">{{ t.claim.pr.slice(0, 7) }}</code>
        </template>
      </p>
      <HubHandIn
        v-if="t.state === 'review' && t.claim"
        :evidence="t.claim.evidence"
        :checks="t.claim.checks"
        :risk="t.claim.risk"
        @read="read = true"
      />

      <div
        v-if="rejecting"
        class="mt-3 w-full rounded-2 border border-danger bg-danger-soft p-3"
        @keydown.esc="rejecting = false"
      >
        <label class="block font-ui text-sm font-semibold text-fg" :for="`reject-${t.id}`">
          What is not done?
        </label>
        <p class="mt-1 mb-2 font-ui text-xs text-muted">
          It goes back to Ready with this on it. The next agent reads it before starting again.
        </p>
        <textarea
          :id="`reject-${t.id}`"
          ref="field"
          v-model="why"
          rows="2"
          maxlength="1000"
          placeholder="The toggle does nothing on Safari."
          class="block w-full resize-y"
          @keydown.meta.enter="send"
          @keydown.ctrl.enter="send"
        />
        <div class="mt-2 flex flex-wrap gap-2">
          <button class="btn primary sm" :disabled="!why.trim()" @click="send">Send request</button>
          <button class="btn sm" @click="rejecting = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="(t.mine || canAssign) && !rejecting" class="flex shrink-0 flex-col items-end gap-1">
      <div class="flex items-center gap-2">
        <div v-if="canAssign" ref="pickerRoot" class="relative" @keydown.esc="assigning = false">
          <button class="btn sm" type="button" :aria-expanded="assigning" @click="assigning = !assigning">
            Give to…
          </button>
          <div v-if="assigning" class="menu w-72">
            <HubAssignPicker :id="t.id" :team="t.team || ''" :to="t.to" @done="assigning = false" />
          </div>
        </div>
        <!-- The gate and the queue moves are the author's alone; an assignee only passes it on. -->
        <template v-if="!t.mine" />
        <template v-else-if="t.state === 'review'">
          <button class="btn primary sm" :disabled="!read" @click="onApprove(t)">Approve</button>
          <button class="btn outline danger sm" @click="askWhy">Ask for changes</button>
        </template>
        <button
          v-else-if="t.state === 'claimed' || t.state === 'stalled'"
          class="btn outline warn sm"
          @click="onRelease(t)"
        >Stop this agent</button>
        <button v-else-if="t.state === 'draft'" class="btn sm" @click="onTaskReady(t)">Ready for agents</button>
      </div>
      <span v-if="t.mine && t.state === 'review' && !read" class="font-ui text-xs text-muted">
        Open what they ran to approve it
      </span>
    </div>
  </li>
</template>
