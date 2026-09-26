<!--
  The verdict: telling whoever sent a guide whether it worked.

  Two answers and one note, which is the product rule — a failure needs a reason, capped at 280
  characters server-side, and there is no reply to it. It opens on the row it is about, so the
  thing being judged stays in view while you write.

  "It worked" is shown, not said: it asks for at least one screenshot of it working, because a
  note was only the sender's word and people said guides worked that did not. Screenshots upload as
  they are picked, pasted or dropped, and are drawn from their own `/v1/shots/<id>` path — the
  hub's `img-src 'self'` refuses a `blob:` preview. They are removed 5 days after the guide is
  closed (PROOF_DAYS in apps/api/src/shots.ts).
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";

const props = defineProps<{
  g: Guide;
  /** Open on the reason: the row's own "It didn't work" has already been chosen. */
  why?: boolean;
}>();
const emit = defineEmits<{ done: [] }>();

const { onVerdict, api } = useHub();

/** The server's limit, mirrored so the field can show it rather than silently truncating. */
const MAX = 280;

const why = ref(Boolean(props.why));
const note = ref("");
const field = ref<HTMLTextAreaElement | null>(null);

const left = computed(() => MAX - note.value.length);
const ready = computed(() => note.value.trim().length > 0);
const sender = computed(() => fromName(props.g) || "The sender");

// ---- showing it works ----------------------------------------------------------------------

const proving = ref(false);
const checked = ref("");
const shots = ref<{ id: string; url: string; name: string }[]>([]);
const uploading = ref(0);
const problem = ref("");
const picker = ref<HTMLInputElement | null>(null);
const sending = ref(false);

function worked() {
  proving.value = true;
}

async function add(files: Iterable<File>) {
  problem.value = "";
  for (const f of files) {
    if (!f.type.startsWith("image/")) {
      problem.value = `${f.name} isn't an image. Use a PNG, JPEG, WebP or GIF.`;
      continue;
    }
    uploading.value++;
    try {
      const r = await api<{ shot: { id: string; url: string } }>("/v1/shots", {
        method: "POST",
        body: f,
        headers: {
          "content-type": f.type,
          "x-shot-name": f.name.replace(/[^\x20-\x7e]/g, "").slice(0, 120),
        },
      });
      if (r) shots.value.push({ ...r.shot, name: f.name || "screenshot" });
    } catch (e) {
      problem.value = (e as Error).message;
    } finally {
      uploading.value--;
    }
  }
}

function picked(e: Event) {
  const input = e.currentTarget as HTMLInputElement;
  if (input.files) void add(Array.from(input.files));
  input.value = "";
}

function pasted(e: ClipboardEvent) {
  const files = Array.from(e.clipboardData?.files ?? []);
  if (!files.length) return;
  e.preventDefault();
  void add(files);
}

const canProve = computed(() => shots.value.length > 0 && !uploading.value && !sending.value);

async function sendWorks() {
  if (!canProve.value) return;
  sending.value = true;
  const said = checked.value.trim();
  const detail = [said, ...shots.value.map((s) => `![${s.name.replace(/[[\]]/g, "")}](${s.url})`)]
    .filter(Boolean)
    .join("\n");
  const ok = await onVerdict(props.g, true, said.split("\n")[0], detail);
  sending.value = false;
  if (ok) emit("done");
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
    @keydown.esc="why ? back() : proving ? (proving = false) : emit('done')"
  >
    <template v-if="proving">
      <p class="m-0 font-ui text-sm font-semibold text-fg">Show it working</p>
      <p class="mt-1 mb-2 font-ui text-xs text-muted">
        Add a screenshot of it working — the screens that matter, not a video. {{ sender }} sees them
        with your answer. They're removed 5 days after the guide is closed.
      </p>
      <div
        class="flex flex-col gap-3 rounded-2 border border-dashed border-line-strong bg-field p-3"
        tabindex="0"
        @paste="pasted"
        @dragover.prevent
        @drop.prevent="add(Array.from($event.dataTransfer?.files ?? []))"
      >
        <ul v-if="shots.length" class="m-0 flex list-none flex-wrap gap-2 p-0">
          <li v-for="(s, i) in shots" :key="s.id" class="relative">
            <img :src="`/v1/shots/${s.id}`" :alt="s.name" class="block h-20 w-auto rounded-1 shadow-edge" />
            <button
              type="button"
              class="btn icon sm absolute -top-2 -right-2 bg-raised"
              :aria-label="`Remove ${s.name}`"
              @click="shots.splice(i, 1)"
            >×</button>
          </li>
        </ul>
        <p class="m-0 flex flex-wrap items-center gap-2 font-ui text-xs text-muted">
          <button type="button" class="btn sm" @click="picker?.click()">Add screenshots</button>
          <span>or paste or drop them here</span>
          <span v-if="uploading" role="status">· uploading…</span>
        </p>
        <input ref="picker" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden @change="picked" />
      </div>
      <p v-if="problem" class="mt-2 mb-0 font-ui text-xs text-danger" role="alert">{{ problem }}</p>
      <label class="mt-3 block font-ui text-xs text-muted" :for="`checked-${g.id}`">
        What you checked (optional)
      </label>
      <textarea
        :id="`checked-${g.id}`"
        v-model="checked"
        rows="2"
        placeholder="Paid with a test card on staging; the order shows as paid."
        class="mt-1 block w-full resize-y"
      />
      <div class="mt-2 flex flex-wrap gap-2">
        <button class="btn primary" :disabled="!canProve" @click="sendWorks">
          {{ sending ? "Sending…" : "Send it" }}
        </button>
        <button class="btn" @click="proving = false">Back</button>
      </div>
    </template>

    <template v-else-if="!why">
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
      <!-- Someone who has just done the work knows what the guide was missing, so this is where
           adding that context is offered — not in a menu they have to know to open. -->
      <p class="mt-3 mb-0 font-ui text-xs text-muted">
        Was something missing from the guide? Ask your agent to add a follow-up with the extra
        context, so the next person has it:
        <button class="linkish" type="button" @click="copy(followUpAsk(g.id), $event.currentTarget)"><span data-label>copy what to say</span></button>
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
        Know what the guide needs? This note is one line; a follow-up is context everyone who opens
        the guide gets, and your agent writes it:
        <button class="linkish" type="button" @click="copy(followUpAsk(g.id), $event.currentTarget)"><span data-label>copy what to say</span></button>
      </p>
    </template>
  </div>
</template>
