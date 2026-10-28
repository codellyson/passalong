<!--
  The conversation with a customer, and the one way to answer them (docs/LOOP.md §1a): their words
  on the left, ours on the right, the reply box under it. A person presses Send — nothing reaches a
  customer before somebody has read it. Above the box, any fix made from the request that finished
  since the customer was last answered, because telling them is the one thing left.
-->
<script setup lang="ts">
import type { ThreadItem } from "~/types/hub";

const props = defineProps<{
  guideId: string;
  /** What to call the customer in the conversation: their name, else their address. */
  name: string;
  /** Guides made from this request that are finished: a fix sent on to development, say. */
  finished?: { id: string; title: string; at: string }[];
}>();
const emit = defineEmits<{ sent: [] }>();
const { api, json } = useHub();
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
        v-for="m in said"
        :key="m.id"
        class="flex max-w-[36rem] flex-col gap-1"
        :class="m.kind === 'answered' ? 'self-end items-end' : 'self-start'"
      >
        <span class="px-1 font-ui text-xs text-muted">
          {{ m.kind === "customer" ? name : m.by.you ? "You" : m.by.name || "Your team" }} · {{ rel(m.at) }}
        </span>
        <p
          class="m-0 rounded-3 px-4 py-3 font-ui text-sm whitespace-pre-wrap"
          :class="m.kind === 'answered' ? 'bg-ink text-on-ink' : 'bg-field shadow-edge'"
        >{{ m.body }}</p>
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
