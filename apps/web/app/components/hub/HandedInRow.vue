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

/** Close waits until what they ran has been opened. See HandIn.vue. */
const read = ref(false);

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
    class="m-0 flex flex-wrap items-start gap-x-4 gap-y-2 border-t-0 border-r-0 border-b-0 border-l-[3px] border-l-accent bg-raised px-5 py-4 shadow-[inset_0_1px_0_var(--line)] first:shadow-none"
  >
    <div class="min-w-0 flex-1 basis-64">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span class="rounded-pill bg-accent-soft px-2 py-0.5 font-ui text-xs font-semibold tracking-wide text-accent uppercase">
          handed in
        </span>
        <span>{{ who }} · {{ rel(h.at) }}</span>
      </div>
      <NuxtLink
        :to="`/hub/g/${h.id}`"
        class="mt-2 block text-base leading-snug font-semibold text-fg no-underline hover:text-accent"
      ><span
          v-if="badge"
          class="mr-2 rounded-1 border px-1.5 py-0.5 align-middle font-ui text-xs font-medium tracking-wide uppercase"
          :class="badge.class"
        >{{ badge.label }}</span>{{ h.title || h.id }}</NuxtLink>
      <p v-if="h.note" class="mt-2 mb-0 text-sm text-muted">“{{ h.note }}”</p>
      <HubHandIn
        :evidence="h.evidence"
        :checks="h.checks"
        :writeup="h.writeup"
        :risk="h.risk"
        @read="read = true"
      />
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

    <div v-if="!sending" class="flex shrink-0 flex-col items-end gap-1">
      <div class="flex items-center gap-2">
        <button class="btn primary sm" :disabled="!read" @click="onCloseHandedIn(h)">close</button>
        <button class="btn outline danger sm" @click="askWhy">send back</button>
      </div>
      <span v-if="!read" class="font-ui text-xs text-muted">open what they ran to close</span>
    </div>
  </li>
</template>
