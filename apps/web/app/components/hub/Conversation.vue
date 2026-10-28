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

/** Each line with its pictures and files picked out, the way the thread reads every message. */
const lines = computed(() => said.value.map((m) => ({ m, msg: messageOf(m) })));

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

async function send(e: Event) {
  const form = e.currentTarget as HTMLFormElement;
  const body = field(form, "reply").trim();
  if (!body || busy.value) return;
  busy.value = true;
  problem.value = "";
  done.value = false;
  try {
    await api(`/v1/guides/${props.guideId}/customer`, json("POST", { body }));
    form.reset();
    done.value = true;
    await load();
    emit("sent");
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
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
          :class="m.kind === 'answered' ? 'bg-ink text-on-ink' : 'bg-field shadow-edge'"
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
      <label class="sr-only" for="customer-reply">Reply to {{ name }}</label>
      <textarea
        id="customer-reply"
        name="reply"
        required
        maxlength="4000"
        rows="4"
        :placeholder="`Reply to ${name}`"
      />
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span class="font-ui text-xs text-muted">Sent by email with the tracking number. Their answer comes back here.</span>
        <span class="flex items-center gap-3">
          <span v-if="done" class="font-ui text-sm text-muted" role="status">Sent</span>
          <button class="btn primary" :disabled="busy">{{ busy ? "Sending…" : "Send" }}</button>
        </span>
      </div>
      <p v-if="problem" class="m-0 font-ui text-sm text-danger" role="alert">{{ problem }}</p>
    </form>
  </section>
</template>
