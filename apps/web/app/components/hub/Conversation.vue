<!--
  The conversation with a customer, and the one way to answer them (docs/LOOP.md §1a). Their words
  and ours in order, each headed by who said it and when; the reply box pinned under it. A person
  presses Send — nothing reaches a customer before somebody has read it. When the next word is ours
  the agent's draft is already in the box, labelled as the agent's until someone changes it.

  The thread comes from the page (`GET /v1/guides/:id/thread`), which also reads the reader's note
  from it for the side panel; after a send the page refetches it.
-->
<script setup lang="ts">
import type { ThreadItem } from "~/types/hub";
import { messageOf } from "~/utils/thread";

const props = defineProps<{
  guideId: string;
  /** Every line of the request's thread, oldest first; null while it loads. */
  thread: ThreadItem[] | null;
  /** What to call the customer in the conversation: their name, else their address. */
  name: string;
  /** Work made from this request that finished since the customer was last answered, when the team asked to be told. */
  ready?: { id: string; title: string }[];
  /** Where the request stands; a draft is started by itself when the next word is ours. */
  state?: string;
}>();
const emit = defineEmits<{ sent: [] }>();
const { api, json, token } = useHub();
const busy = ref(false);
const problem = ref("");
const done = ref(false);

/** What the customer wrote and what they were sent, oldest first. */
const said = computed(() =>
  (props.thread ?? []).filter((i) => i.kind === "customer" || i.kind === "answered"),
);

/**
 * Each line with its pictures and files picked out, the way the thread reads every message — read as
 * the speaker's own words (the header says who spoke, so no "To the customer:" lead), with emphasis
 * marks dropped the way the customer's plain-text email drops them.
 */
const plain = (t: string) =>
  t
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`\n]+)`/g, "$1")
    // A link reads as its words and its address, as the customer's plain-text email shows it.
    .replace(/(?<!!)\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
    .replace(/\\([\\`*_[\]])/g, "$1");
const lines = computed(() =>
  said.value.map((m) => {
    const msg = messageOf({ ...m, kind: "customer" });
    const ours = m.kind === "answered";
    return {
      m,
      ours,
      who: ours
        ? m.by.you
          ? "You"
          : m.by.name || (m.by.handle ? `@${m.by.handle}` : "Your team")
        : props.name,
      msg: { ...msg, text: plain(msg.text) },
    };
  }),
);

/** "28 Oct, 14:02": a time someone can quote back to the customer. */
const when = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

async function save(f: { name: string; url: string }) {
  problem.value = "";
  try {
    await downloadFile(f, token.value);
  } catch (e) {
    problem.value = e instanceof Error ? e.message : "That file didn't download. Try again.";
  }
}

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
  if (autoDrafted || !props.thread || !writer.value || reply.value.trim()) return;
  if (!["new", "needs_reply"].includes(props.state ?? "") && !props.ready?.length) return;
  autoDrafted = true;
  draft(true);
});
</script>

<template>
  <section class="flex min-w-0 flex-col" aria-label="Conversation">
    <HubSkeleton v-if="!thread" variant="lines" :rows="4" label="Loading the conversation" />
    <p v-else-if="!said.length" class="m-0 border-t border-line py-6 font-ui text-sm text-muted">
      Nothing has been said yet.
    </p>
    <ol v-else class="m-0 flex list-none flex-col gap-5 p-0">
      <li
        v-for="{ m, ours, who, msg } in lines"
        :key="m.id"
        class="flex w-full max-w-[40rem] flex-col gap-1"
        :class="ours ? 'self-end' : 'self-start'"
      >
        <p class="m-0 flex flex-wrap items-baseline gap-x-2 px-1 font-ui text-xs">
          <span class="font-medium text-fg">{{ who }}</span>
          <span class="text-muted">{{ ours ? `to ${name}` : "customer" }}</span>
          <time :datetime="m.at" class="ml-auto text-muted tabular-nums">{{ when(m.at) }}</time>
        </p>
        <div
          v-if="msg.text"
          class="rounded-3 border px-4 py-3 font-ui text-sm leading-relaxed break-words whitespace-pre-wrap text-fg"
          :class="ours ? 'border-line bg-raised' : 'border-line-strong bg-field'"
        >
          <!-- Their screenshots are drawn, through the renderer that only fetches our own. -->
          <HubEvidence v-if="msg.pictures" :text="msg.text" prose label="A message with pictures" class="!mt-0" />
          <template v-else>{{ msg.text }}</template>
        </div>
        <ul v-if="msg.files.length" class="m-0 flex list-none flex-wrap gap-2 p-0" :class="ours ? 'justify-end' : ''">
          <li v-for="f in msg.files" :key="f.url">
            <button type="button" class="btn sm max-w-64" @click="save(f)">
              <span class="truncate">{{ f.name }}</span>
              <span class="shrink-0 text-muted">Download</span>
            </button>
          </li>
        </ul>
      </li>
    </ol>

    <!-- The reply box, pinned to the foot of the window while the thread scrolls under it. -->
    <form class="sticky bottom-0 z-10 mt-8 flex flex-col gap-2 border-t border-line bg-bg pt-3 pb-4" @submit.prevent="send">
      <p v-for="f in ready" :key="f.id" class="m-0 font-ui text-sm" role="status">
        <NuxtLink :to="`/hub/g/${f.id}`">{{ f.title }}</NuxtLink> is done. Tell {{ name }}.
      </p>
      <!-- The same editor as the box, without @ and #: a customer has no use for the team's names. -->
      <ClientOnly>
        <HubWriter
          ref="writer"
          class="reply"
          :placeholder="`Reply to ${name}. Paste a screenshot if it helps.`"
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
          <div class="writer-shell reply"><div class="writer" aria-hidden="true" /></div>
        </template>
      </ClientOnly>
      <p class="m-0 font-ui text-xs text-muted" role="status">
        <template v-if="drafting && !drafted">The agent is drafting a reply…</template>
        <template v-else-if="untouched">
          <span class="font-medium text-fg">Drafted by the agent</span> from the conversation{{ ready?.length ? " and the finished fix" : "" }}. Read it and change anything before you send.
        </template>
        <template v-else>Sent by email with the tracking number. Their answer comes back here.</template>
      </p>
      <p v-if="problem" class="m-0 font-ui text-sm text-danger" role="alert">{{ problem }}</p>
    </form>
  </section>
</template>
