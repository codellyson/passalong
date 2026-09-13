<!--
  The first word back on a guide someone handed you, before any of the work.

  Shaped like the verdict below it on purpose: two answers, and only the negative one collects a
  reason. What it answers is different, though, and earlier — "are you doing this?" rather than
  "did it work?" — which is the hop the product had no signal for at all. A handoff nobody had
  answered looked exactly like one nobody had noticed.

  Passing needs a reason because "not me" without "why" leaves the sender where the silence did:
  they still have to guess whether to re-address it, wait, or go and ask.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";

const props = defineProps<{
  g: Guide;
  /** Open on the reason: the row's own "Pass" button has already said no. */
  why?: boolean;
}>();
const emit = defineEmits<{ done: [] }>();

const { onAck } = useHub();

/** The server's limit, mirrored so the field can show it rather than silently truncating. */
const MAX = 280;

const why = ref(Boolean(props.why));
const note = ref("");
const field = ref<HTMLTextAreaElement | null>(null);

const left = computed(() => MAX - note.value.length);
const ready = computed(() => note.value.trim().length > 0);

function take() {
  onAck(props.g, true);
  emit("done");
}

async function askWhy() {
  why.value = true;
  await nextTick();
  field.value?.focus();
}

onMounted(() => {
  if (why.value) field.value?.focus();
});

/** Opened on the reason, there is no question to go back to: back closes it. */
function back() {
  if (props.why) emit("done");
  else why.value = false;
}

function pass() {
  if (!ready.value) return;
  onAck(props.g, false, note.value);
  emit("done");
}
</script>

<template>
  <div
    class="mt-2 w-full rounded-2 border p-3"
    :class="why ? 'border-warn bg-warn-soft' : 'border-line-strong bg-surface'"
    @keydown.esc="why ? back() : emit('done')"
  >
    <template v-if="!why">
      <p class="m-0 font-ui text-sm font-semibold text-fg">Are you taking this?</p>
      <p class="mt-1 mb-2 font-ui text-xs text-muted">
        <b class="font-medium text-fg">@{{ g.from || "the author" }}</b> cannot tell an unanswered
        handoff from an unnoticed one. Either answer is better than neither.
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="btn primary" @click="take">I'm on it</button>
        <button class="btn outline warn" @click="askWhy">not me</button>
        <button class="btn" @click="emit('done')">not now</button>
      </div>
    </template>

    <template v-else>
      <label class="block font-ui text-sm font-semibold text-fg" :for="`pass-${g.id}`">
        Why is it not yours?
      </label>
      <p class="mt-1 mb-2 font-ui text-xs text-muted">
        It goes back on <b class="font-medium text-fg">@{{ g.from || "the author" }}</b>'s board
        with this attached, so they know who to hand it to instead.
      </p>

      <textarea
        :id="`pass-${g.id}`"
        ref="field"
        v-model="note"
        rows="2"
        :maxlength="MAX"
        placeholder="no context on the payments side — @ada wrote that integration"
        class="block w-full resize-y rounded-1 border border-line-strong bg-raised p-2 font-ui text-sm text-fg"
        @keydown.meta.enter="pass"
        @keydown.ctrl.enter="pass"
      />

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button class="btn primary" :disabled="!ready" @click="pass">hand it back</button>
        <button class="btn" @click="back">back</button>
        <span class="ml-auto font-ui text-xs" :class="left > 40 ? 'text-muted' : 'text-danger'">
          {{ left }} left
        </span>
      </div>
    </template>
  </div>
</template>
