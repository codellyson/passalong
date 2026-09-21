<!--
  The first word back on a guide someone sent you, before any of the work.

  Shaped like the verdict: two answers, and only the negative one collects a reason. What it
  answers is earlier — "are you taking this?" rather than "did it work?" — which is the step the
  product had no signal for at all. A handoff nobody had answered looked exactly like one nobody
  had noticed.

  The buttons say the same words as the row that opened this form: Take it, Pass. A form that
  renamed its own buttons ("I'm on it", "not me", "hand it back") made one decision read as three.
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
const sender = computed(() => fromName(props.g) || "The sender");

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
        <b class="font-medium text-fg">{{ sender }}</b> can't tell whether you've seen it until
        you answer. Either answer helps.
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="btn primary" @click="take">Take it</button>
        <button class="btn outline warn" @click="askWhy">Pass</button>
        <button class="btn" @click="emit('done')">Not now</button>
      </div>
    </template>

    <template v-else>
      <label class="block font-ui text-sm font-semibold text-fg" :for="`pass-${g.id}`">
        Why isn't it yours?
      </label>
      <p class="mt-1 mb-2 font-ui text-xs text-muted">
        <b class="font-medium text-fg">{{ sender }}</b> sees this and can send it to someone else.
      </p>

      <textarea
        :id="`pass-${g.id}`"
        ref="field"
        v-model="note"
        rows="2"
        :maxlength="MAX"
        placeholder="I don't work on payments. Ada wrote that integration."
        class="block w-full resize-y rounded-1 border border-line-strong bg-raised p-2 font-ui text-sm text-fg"
        @keydown.meta.enter="pass"
        @keydown.ctrl.enter="pass"
      />

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button class="btn primary" :disabled="!ready" @click="pass">Send it back</button>
        <button class="btn" @click="back">Back</button>
        <span class="ml-auto font-ui text-xs" :class="left > 40 ? 'text-muted' : 'text-danger'">
          {{ left }} characters left
        </span>
      </div>
    </template>
  </div>
</template>
