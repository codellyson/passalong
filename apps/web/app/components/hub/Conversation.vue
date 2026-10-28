<!--
  The conversation with a customer, and the one way to answer them (docs/LOOP.md §1a): their words
  on the left, ours on the right, the reply box under it. A person presses Send — nothing reaches a
  customer before somebody has read it. Above the box, any fix made from the request that finished
  since the customer was last answered, because telling them is the one thing left.
-->
<script setup lang="ts">
import type { ThreadItem } from "~/types/hub";
import { messageOf } from "~/utils/thread";

const props = defineProps<{
  guideId: string;
  /** What to call the customer in the conversation: their name, else their address. */
  name: string;
  /** Guides made from this request that are finished: a fix sent on to development, say. */
  finished?: { id: string; title: string; at: string }[];
  /** Where the request stands; a draft is started by itself when the next word is ours. */
  state?: string;
}>();
const emit = defineEmits<{ sent: [] }>();
const { api, json, token } = useHub();
const busy = ref(false);
const problem = ref("");
const done = ref(false);

/** What the customer wrote and what they were sent, oldest first, from the guide's thread. */
const said = ref<ThreadItem[]>([]);
const loaded = ref(false);
async function load() {
  const t = await api<{ thread: ThreadItem[] }>(`/v1/guides/${props.guideId}/thread`);
  said.value = (t?.thread ?? []).filter((i) => i.kind === "customer" || i.kind === "answered");
  loaded.value = true;
}
onMounted(() => load().catch((e) => (problem.value = (e as Error).message)));

/**
 * Each line with its pictures and files picked out, the way the thread reads every message — read as
 * the speaker's own words (the side says who spoke, so no "To the customer:" lead), with emphasis
 * marks dropped the way the customer's plain-text email drops them.
 */
const plain = (t: string) =>
  t
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\\([\\`*_[\]])/g, "$1");
const lines = computed(() =>
  said.value.map((m) => {
    const msg = messageOf({ ...m, kind: "customer" });
    return { m, msg: { ...msg, text: plain(msg.text) } };
  }),
);

async function save(f: { name: string; url: string }) {
  problem.value = "";
  try {
    await downloadFile(f, token.value);
  } catch (e) {
    problem.value = e instanceof Error ? e.message : "That file didn't download. Try again.";
  }
}

const ready = computed(() => {
  const answered = said.value
    .filter((m) => m.kind === "answered")
    .reduce((last, m) => (m.at > last ? m.at : last), "");
  return (props.finished ?? []).filter((f) => f.at > answered);
});

/** The reply as markdown from the editor; a pasted picture travels in it as a link. */
const reply = ref("");
const writer = ref<{
  addPicture: (f: File) => Promise<void>;
  clear: () => void;
  setText: (t: string) => void;
} | null>(null);

/**
 * The agent's draft (docs/LOOP.md §1a): written into the box for a person to read, change and send.
 * Started by itself when the customer is waiting on us and the box is empty; otherwise on asking.
 * Nothing is sent and nothing stored — Send is still the person's.
 */
const drafting = ref(false);
const drafted = ref("");
const canDraft = ref(true);
async function draft(quiet = false) {
  if (drafting.value) return;
  drafting.value = true;
  if (!quiet) problem.value = "";
  try {
    const got = await api<{ draft: string }>(
      `/v1/guides/${props.guideId}/customer/draft`,
      json("POST", {}),
    );
    if (got?.draft) {
      writer.value?.setText(got.draft);
      drafted.value = got.draft;
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (/isn't set up/.test(msg)) canDraft.value = false;
    else if (!quiet) problem.value = msg;
  } finally {
    drafting.value = false;
  }
}
/** Still the agent's words, untouched: the label says so until the person changes them. */
const untouched = computed(
  () => Boolean(drafted.value) && reply.value.trim() === drafted.value.trim(),
);
const uploading = ref(false);
async function attach(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = "";
  if (!f) return;
  uploading.value = true;
  try {
    await writer.value?.addPicture(f);
  } finally {
    uploading.value = false;
  }
}

async function send() {
  const body = reply.value.trim();
  if (!body || busy.value) return;
  busy.value = true;
  problem.value = "";
  done.value = false;
  try {
    await api(`/v1/guides/${props.guideId}/customer`, json("POST", { body }));
    writer.value?.clear();
    reply.value = "";
    drafted.value = "";
    done.value = true;
    await load();
    emit("sent");
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

// The next word is ours: have a draft ready rather than an empty box. Once, when the request's state
// and the conversation are both known and the editor is there.
let autoDrafted = false;
watchEffect(() => {
  if (autoDrafted || !loaded.value || !writer.value || reply.value.trim()) return;
  if (!["new", "needs_reply"].includes(props.state ?? "") && !ready.value.length) return;
  autoDrafted = true;
  draft(true);
});
</script>

<template>
  <section class="flex flex-col gap-4" aria-label="Conversation">
    <HubSkeleton v-if="!loaded && !problem" variant="lines" :rows="3" label="Loading the conversation" />
    <p v-else-if="!said.length" class="m-0 font-ui text-sm text-muted">Nothing has been said yet.</p>
    <ol v-else class="m-0 flex list-none flex-col gap-4 p-0">
      <li
        v-for="{ m, msg } in lines"
        :key="m.id"
        class="flex max-w-[36rem] flex-col gap-1"
        :class="m.kind === 'answered' ? 'self-end items-end' : 'self-start'"
      >
        <span class="px-1 font-ui text-xs text-muted">
          {{ m.kind === "customer" ? name : m.by.you ? "You" : m.by.name || "Your team" }} · {{ rel(m.at) }}
        </span>
        <div
          v-if="msg.text"
          class="rounded-3 px-4 py-3 font-ui text-sm whitespace-pre-wrap"
          :class="m.kind === 'answered' ? 'bg-raised shadow-edge' : 'bg-field shadow-edge'"
        >
          <!-- Their screenshots are drawn, through the renderer that only fetches our own. -->
          <HubEvidence v-if="msg.pictures" :text="msg.text" prose label="A message with pictures" class="!mt-0" />
          <template v-else>{{ msg.text }}</template>
        </div>
        <ul v-if="msg.files.length" class="m-0 flex list-none flex-wrap gap-2 p-0">
          <li v-for="f in msg.files" :key="f.url">
            <button
              type="button"
              class="inline-flex max-w-56 items-center gap-2 rounded-1 border-0 bg-raised px-3 py-2 font-ui text-xs text-fg shadow-edge hover:text-accent"
              @click="save(f)"
            >
              <span class="truncate">{{ f.name }}</span>
              <span class="shrink-0 text-muted">download</span>
            </button>
          </li>
        </ul>
      </li>
    </ol>

    <p
      v-for="f in ready"
      :key="f.id"
      class="m-0 font-ui text-sm"
      role="status"
    >
      <NuxtLink :to="`/hub/g/${f.id}`">{{ f.title }}</NuxtLink> is done. Tell {{ name }}.
    </p>

    <form class="flex flex-col gap-2" @submit.prevent="send">
      <!-- The same editor as the box, without @ and #: a customer has no use for the team's names. -->
      <ClientOnly>
        <HubWriter
          ref="writer"
          :placeholder="`Reply to ${name}. Paste a screenshot or a link if it helps.`"
          :people="[]"
          :groups="[]"
          @change="reply = $event"
          @problem="problem = $event"
        >
          <template #footer>
            <span class="flex flex-wrap items-center gap-2">
              <label class="btn sm cursor-pointer">
                <input type="file" accept="image/*" class="sr-only" @change="attach" />
                {{ uploading ? "Adding…" : "Picture" }}
              </label>
              <button v-if="canDraft" type="button" class="btn sm" :disabled="drafting" @click="draft()">
                {{ drafting ? "Drafting…" : drafted ? "Draft again" : "Draft a reply" }}
              </button>
            </span>
            <span class="flex items-center gap-3">
              <span v-if="done" class="font-ui text-sm text-muted" role="status">Sent</span>
              <button class="btn primary" :disabled="busy || !reply.trim()">{{ busy ? "Sending…" : "Send" }}</button>
            </span>
          </template>
        </HubWriter>
        <template #fallback>
          <div class="writer-shell"><div class="writer" aria-hidden="true" /></div>
        </template>
      </ClientOnly>
      <p v-if="drafting && !drafted" class="m-0 font-ui text-sm text-muted" role="status">The agent is drafting a reply…</p>
      <p v-else-if="untouched" class="m-0 font-ui text-sm" role="status">
        Drafted by the agent from the conversation{{ ready.length ? " and the finished fix" : "" }}. Read it, change anything, then send.
      </p>
      <span class="font-ui text-xs text-muted">Sent by email with the tracking number. Their answer comes back here.</span>
      <p v-if="problem" class="m-0 font-ui text-sm text-danger" role="alert">{{ problem }}</p>
    </form>
  </section>
</template>
