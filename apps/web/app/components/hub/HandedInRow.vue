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
  return [props.h.place, machine].filter(Boolean).join(" on ");
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
  <!-- The inbox row's anatomy: kind and title on one line, then who, when and where it stands in
       muted text, and the actions on the right. It used to carry a coral stripe down its left edge
       and a filled HANDED IN pill, a look no other row in the hub had. The list's ends round it. -->
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
          :to="`/hub/g/${h.id}`"
          class="text-base leading-snug font-semibold text-fg no-underline hover:text-accent"
        >{{ h.title || h.id }}</NuxtLink>
      </p>
      <p class="mt-1 mb-0 flex flex-wrap gap-x-1.5 font-ui text-sm text-muted">
        <span><b class="font-medium text-fg">{{ who }}</b> handed it in</span>
        <span>· {{ rel(h.at) }}</span>
        <span v-if="where" class="font-code text-xs leading-5">· {{ where }}</span>
        <span class="text-accent">· waiting on you</span>
      </p>
      <p v-if="h.note" class="mt-2 mb-0 text-sm text-muted">“{{ h.note }}”</p>
      <HubHandIn
        :evidence="h.evidence"
        :checks="h.checks"
        :writeup="h.writeup"
        :risk="h.risk"
        @read="read = true"
      />

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
          placeholder="The migration never ran on staging."
          class="block w-full resize-y"
          @keydown.meta.enter="send"
          @keydown.ctrl.enter="send"
        />
        <div class="mt-2 flex flex-wrap gap-2">
          <button class="btn primary sm" :disabled="!why.trim()" @click="send">Send it back</button>
          <button class="btn sm" @click="sending = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="!sending" class="flex shrink-0 flex-col items-end gap-1">
      <div class="flex items-center gap-2">
        <button class="btn primary sm" :disabled="!read" @click="onCloseHandedIn(h)">Close it</button>
        <button class="btn outline danger sm" @click="askWhy">Send back</button>
      </div>
      <span v-if="!read" class="font-ui text-xs text-muted">Open what they ran to close it</span>
    </div>
  </li>
</template>
