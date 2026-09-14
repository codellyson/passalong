<!--
  The verdict: telling whoever sent a guide whether it worked.

  Two answers and one note, which is the product rule — a failure needs a reason, capped at 280
  characters server-side, and there is no reply to it. It opens on the row it is about, so the
  thing being judged stays in view while you write.

  "It worked" is one click. Only a failure has anything to collect.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";

const props = defineProps<{
  g: Guide;
  /** Open on the reason: the row's own "It didn't work" has already been chosen. */
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
const sender = computed(() => fromName(props.g) || "The sender");

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
      <p class="m-0 font-ui text-sm font-semibold text-fg">How did it go?</p>
      <p class="mt-1 mb-2 font-ui text-xs text-muted">
        <b class="font-medium text-fg">{{ sender }}</b> finds out either way. It's the only signal
        they get.
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="btn primary" @click="worked">It worked</button>
        <button class="btn outline danger" @click="askWhy">It didn't work</button>
        <button class="btn" @click="emit('done')">Not yet</button>
      </div>
      <!-- The moment someone knows whether they departed from the guide is this one, so this is
           where a follow-up is offered — not in a menu they have to know to open. -->
      <p class="mt-3 mb-0 font-ui text-xs text-muted">
        Had to change something to make it work?
        <NuxtLink :to="{ path: '/hub/write', query: { follows: g.id } }">Write a follow-up</NuxtLink>
        so the next person gets your version.
      </p>
    </template>

    <template v-else>
      <label class="block font-ui text-sm font-semibold text-fg" :for="`why-${g.id}`">
        What went wrong?
      </label>
      <p class="mt-1 mb-2 font-ui text-xs text-muted">
        One note, no reply. Say the thing that would have saved you time.
      </p>

      <textarea
        :id="`why-${g.id}`"
        ref="field"
        v-model="note"
        rows="2"
        :maxlength="MAX"
        placeholder="The setting it tells you to change doesn't exist in this version."
        class="block w-full resize-y rounded-1 border border-line-strong bg-raised p-2 font-ui text-sm text-fg"
        @keydown.meta.enter="send"
        @keydown.ctrl.enter="send"
      />

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button class="btn primary" :disabled="!ready" @click="send">Send it</button>
        <button class="btn" @click="back">Back</button>
        <span class="ml-auto font-ui text-xs" :class="left > 40 ? 'text-muted' : 'text-danger'">
          {{ left }} characters left
        </span>
      </div>
      <p class="mt-3 mb-0 font-ui text-xs text-muted">
        Found a way that does work?
        <NuxtLink :to="{ path: '/hub/write', query: { follows: g.id } }">Write it up as a follow-up</NuxtLink>
        — a note is one line; a follow-up is the fix, for everyone after you.
      </p>
    </template>
  </div>
</template>
