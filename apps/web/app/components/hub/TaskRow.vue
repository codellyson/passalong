<!--
  One task. The same anatomy as a handoff row — pills, then the title at one left edge, then one
  line of facts — so the two boards scan the same way.

  What changes by column is the one move the row offers, and only on your own tasks: moving a task
  is its author's call, and offering a teammate buttons the server refuses is a board that lies.

    review    approve, or send it back with a reason — and the write-up to read before either
    claimed   take it back
    stalled   take it back; the agent went quiet, and the row says since when
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

const TONE: Record<Task["state"], { badge: string; stripe: string; label: string }> = {
  review: { badge: "bg-accent-soft text-accent", stripe: "border-l-accent", label: "review" },
  stalled: { badge: "bg-warn-soft text-warn", stripe: "border-l-warn", label: "stalled" },
  claimed: { badge: "bg-ok-soft text-ok", stripe: "border-l-ok", label: "claimed" },
  ready: { badge: "bg-surface text-fg", stripe: "border-l-transparent", label: "ready" },
  blocked: { badge: "bg-surface text-muted", stripe: "border-l-transparent", label: "blocked" },
  draft: { badge: "bg-surface text-muted", stripe: "border-l-transparent", label: "draft" },
  done: { badge: "bg-surface text-muted", stripe: "border-l-transparent", label: "done" },
};
const tone = computed(() => TONE[props.t.state]);

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
  <li
    class="m-0 flex flex-wrap items-start gap-x-4 gap-y-2 border-t-0 border-r-0 border-b-0 border-l-[3px] bg-raised px-5 py-4 shadow-[inset_0_1px_0_var(--line)] first:shadow-none"
    :class="tone.stripe"
  >
    <div class="min-w-0 flex-1 basis-64">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span
          class="rounded-pill px-2 py-0.5 font-ui text-xs font-semibold uppercase tracking-wide"
          :class="tone.badge"
        >{{ tone.label }}</span>
        <span v-if="t.state === 'stalled' && heard">last heard {{ rel(heard) }}</span>
        <span v-else>{{ rel(t.created) }}</span>
      </div>
      <NuxtLink
        :to="`/hub/g/${t.id}`"
        class="mt-2 block text-base font-semibold leading-snug text-fg no-underline hover:text-accent"
      >{{ t.title || t.id }}</NuxtLink>

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

      <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <code class="shrink-0 font-code">{{ t.id }}</code>
        <span v-if="t.for_me && !t.mine" class="font-medium text-fg">for you</span>
        <span v-else-if="t.to" class="font-medium text-fg">for {{ t.to }}</span>
        <span v-if="t.target" class="font-code"><AppShorten :value="t.target" :max="28" /></span>
        <span v-else>no repo</span>
        <span v-if="where">{{ by }} · <span class="font-code">{{ where }}</span></span>
      </div>

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
          placeholder="the toggle does nothing on Safari"
          class="block w-full resize-y rounded-1 border border-line-strong bg-raised p-2 font-ui text-sm text-fg"
          @keydown.meta.enter="send"
          @keydown.ctrl.enter="send"
        />
        <div class="mt-2 flex flex-wrap gap-2">
          <button class="btn primary" :disabled="!why.trim()" @click="send">send it back</button>
          <button class="btn" @click="rejecting = false">back</button>
        </div>
      </div>
    </div>

    <div v-if="(t.mine || canAssign) && !rejecting" class="flex shrink-0 items-center gap-2">
      <div v-if="canAssign" ref="pickerRoot" class="relative" @keydown.esc="assigning = false">
        <button class="btn sm" type="button" :aria-expanded="assigning" @click="assigning = !assigning">
          give to…
        </button>
        <div v-if="assigning" class="menu w-72">
          <HubAssignPicker :id="t.id" :team="t.team || ''" :to="t.to" @done="assigning = false" />
        </div>
      </div>
      <!-- The gate and the queue moves are the author's alone; an assignee only passes it on. -->
      <template v-if="!t.mine" />
      <template v-else-if="t.state === 'review'">
        <button
          class="btn primary sm"
          :disabled="!read"
          @click="onApprove(t)"
        >approve</button>
        <button class="btn outline danger sm" @click="askWhy">send back</button>
        <span v-if="!read" class="font-ui text-xs text-muted">open what they ran to approve</span>
      </template>
      <button
        v-else-if="t.state === 'claimed' || t.state === 'stalled'"
        class="btn outline warn sm"
       
        @click="onRelease(t)"
      >take back</button>
      <button v-else-if="t.state === 'draft'" class="btn sm" @click="onTaskReady(t)">make ready</button>
    </div>
  </li>
</template>
