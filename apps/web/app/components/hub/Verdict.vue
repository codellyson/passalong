<!--
  The verdict moment: someone telling the author that the work they handed over does not hold up.

  Two answers and one note, which is the product rule — a reason is required, capped at 280
  characters server-side, and there is no reply to it. What this replaces is `prompt()`: no visible
  cap, no way back once dismissed, and a blank submit that cancelled without a word. It opens on
  the row it is about, so the thing being judged stays in view while you write.

  "It worked" is one click. Only a failure has anything to collect.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";

const props = defineProps<{
  g: Guide;
  /** Open on the reason: the row's own "It didn't" button has already said no. */
  why?: boolean;
}>();
const emit = defineEmits<{ done: [] }>();

const { onVerdict } = useHub();

/** The server's limit, mirrored so the field can show it rather than silently truncating. */
const MAX = 280;

const why = ref(Boolean(props.why));
const note = ref("");
const field = ref<HTMLTextAreaElement | null>(null);

const left = computed(() => MAX - note.value.length);
const ready = computed(() => note.value.trim().length > 0);

function worked() {
  onVerdict(props.g, true);
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

function send() {
  if (!ready.value) return;
  onVerdict(props.g, false, note.value);
  emit("done");
}
</script>

<template>
  <div
    class="mt-2 w-full rounded-2 border p-3"
    :class="why ? 'border-danger bg-danger-soft' : 'border-line-strong bg-surface'"
    @keydown.esc="why ? back() : emit('done')"
  >
    <template v-if="!why">
      <p class="m-0 font-ui text-sm font-semibold text-fg">Did it work?</p>
      <p class="mt-1 mb-2 font-ui text-xs text-muted">
        <b class="font-medium text-fg">@{{ g.from || "the author" }}</b> finds out either way. This
        is the only signal they get.
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="btn primary" @click="worked">it worked</button>
        <button class="btn outline danger" @click="askWhy">it doesn't</button>
        <button class="btn" @click="emit('done')">not now</button>
      </div>
    </template>

    <template v-else>
      <label class="block font-ui text-sm font-semibold text-fg" :for="`why-${g.id}`">
        What went wrong?
      </label>
      <p class="mt-1 mb-2 font-ui text-xs text-muted">
        One note, no reply — say the thing that would have saved you.
      </p>

      <textarea
        :id="`why-${g.id}`"
        ref="field"
        v-model="note"
        rows="2"
        :maxlength="MAX"
        placeholder="the flag it tells you to set does not exist on this version"
        class="block w-full resize-y rounded-1 border border-line-strong bg-raised p-2 font-ui text-sm text-fg"
        @keydown.meta.enter="send"
        @keydown.ctrl.enter="send"
      />

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button class="btn primary" :disabled="!ready" @click="send">send it back</button>
        <button class="btn" @click="back">back</button>
        <span class="ml-auto font-ui text-xs" :class="left > 40 ? 'text-muted' : 'text-danger'">
          {{ left }} left
        </span>
      </div>
    </template>
  </div>
</template>
