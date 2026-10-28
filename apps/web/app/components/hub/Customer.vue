<!--
  A support request's customer, and the one way to answer them (docs/LOOP.md §4). The reply is sent
  by the person pressing Send: an agent drafts, nothing reaches a customer before somebody has read
  it. The address is shown here, to the team, and is never in the guide's document.
-->
<script setup lang="ts">
import type { ThreadItem } from "~/types/hub";

const props = defineProps<{
  guideId: string;
  customer: { name: string; email: string; ref: string };
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
async function load() {
  const t = await api<{ thread: ThreadItem[] }>(`/v1/guides/${props.guideId}/thread`);
  said.value = (t?.thread ?? []).filter((i) => i.kind === "customer" || i.kind === "answered");
}
onMounted(() => load().catch((e) => (problem.value = (e as Error).message)));

/**
 * What finished since the customer was last answered (docs/LOOP.md step 3): the fix is in, so the
 * one thing left is telling them. Nothing is drafted for the person — they write it.
 */
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
  <section class="flex flex-col gap-3 rounded-3 bg-raised px-5 py-4" aria-labelledby="customer-h">
    <h2 id="customer-h" class="m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted">
      Customer
    </h2>
    <p class="m-0 flex flex-wrap items-center gap-x-2 font-ui text-sm">
      <b class="font-medium">{{ customer.name || customer.email }}</b>
      <span v-if="customer.name" class="text-muted">{{ customer.email }}</span>
      <span class="font-code text-xs text-muted">· {{ customer.ref }}</span>
    </p>
    <p
      v-for="f in ready"
      :key="f.id"
      class="m-0 rounded-2 border border-line px-3 py-2 font-ui text-sm"
      role="status"
    >
      <NuxtLink :to="`/hub/g/${f.id}`">{{ f.title }}</NuxtLink> is done — tell
      {{ customer.name || "the customer" }}.
    </p>
    <ol v-if="said.length" class="m-0 flex list-none flex-col gap-3 p-0">
      <li v-for="m in said" :key="m.id" class="flex flex-col gap-1 font-ui text-sm">
        <span class="text-xs text-muted">
          {{ m.kind === "customer" ? customer.name || "Customer" : "Sent to them" }} · {{ rel(m.at) }}
        </span>
        <p class="m-0 whitespace-pre-wrap">{{ m.body }}</p>
      </li>
    </ol>
    <form class="flex flex-col gap-2" @submit.prevent="send">
      <label class="font-ui text-sm text-muted" for="customer-reply">
        Your reply, sent by email with the tracking number. Their answer comes back here.
      </label>
      <textarea id="customer-reply" name="reply" required maxlength="4000" rows="5" />
      <div class="flex flex-wrap items-center gap-3">
        <button class="btn primary sm" :disabled="busy">{{ busy ? "Sending…" : "Send to customer" }}</button>
        <span v-if="done" class="font-ui text-sm text-muted" role="status">Sent.</span>
      </div>
      <p v-if="problem" class="m-0 font-ui text-sm text-danger" role="alert">{{ problem }}</p>
    </form>
  </section>
</template>
