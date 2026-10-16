<!--
  Ask someone to check (docs/REVIEW.md §5). The one review there is, and only when somebody asks for
  it, from somebody they chose: "open this in the browser and tell me it looks right".

  It makes a follow-up — a task, addressed to the teammate picked, with this guide as its `parent`,
  so it carries the guide and what it was finished with. A person wrote it here, so it is Ready at
  once. They take it, look, and finish it with proof of their own, or pass it with what is wrong,
  which comes back to whoever asked.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { Guide, TeamDetail } from "~/types/hub";

const props = defineProps<{ guide: Guide }>();
const { api, signedIn, data } = useHub();

const open = ref(false);
const busy = ref(false);
const sent = ref<{ id: string; to: string } | null>(null);
const trouble = ref("");

const detail = useQuery({
  queryKey: computed(() => hubKeys.team(props.guide.team || "")),
  queryFn: async () =>
    (await api<TeamDetail>(
      `/v1/teams/${encodeURIComponent(props.guide.team || "")}`,
    )) as TeamDetail,
  enabled: computed(() => signedIn.value && open.value && Boolean(props.guide.team)),
});
const me = computed(() => data.value.me?.account || "");
const people = computed(() =>
  (detail.data.value?.members ?? [])
    .filter((m) => m.id !== me.value)
    .map((m) => ({
      to: m.handle || m.id,
      label: m.display || personName(m.name, m.handle, m.id),
    })),
);

/** A guide id: 8 from the alphabet with no lookalikes, as the CLI mints them (guide.js `newId`). */
function newId() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => abc[b % abc.length]).join("");
}
const line = (s: string) =>
  s
    .replace(/[\r\n]+/g, " ")
    .replace(/"/g, "'")
    .trim();

// Uncontrolled, as the hub's other forms: read on submit.
async function ask(form: HTMLFormElement) {
  const to = field(form, "to");
  const what = line(field(form, "what"));
  if (!to || !what || busy.value) return;
  busy.value = true;
  trouble.value = "";
  const g = props.guide;
  const title = line(g.title || "this guide");
  const id = newId();
  const markdown = [
    "---",
    `title: "Check: ${title}"`,
    `summary: "Asked to look at ${title}: ${what}"`,
    "kind: task",
    `team: ${g.team}`,
    `to: ${to}`,
    `parent: ${g.id}`,
    "---",
    "",
    "## Goal",
    what,
    "",
    "## Context",
    `Look at ${g.url} — what it was finished with is on its page in the hub.`,
    "",
    "## Acceptance",
    "- You looked, and it holds — with a screenshot of what you saw. If it doesn't, pass this back with what is wrong.",
    "",
  ].join("\n");
  try {
    await api(`/v1/guides/${id}`, {
      method: "PUT",
      headers: { "content-type": "text/markdown" },
      body: markdown,
    });
    sent.value = { id, to: people.value.find((p) => p.to === to)?.label || `@${to}` };
    open.value = false;
    form.reset();
  } catch (e) {
    trouble.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <p v-if="sent" class="m-0 font-ui text-sm text-muted" role="status">
      Asked {{ sent.to }} to check it —
      <NuxtLink :to="`/hub/g/${sent.id}`">the request</NuxtLink>.
    </p>
    <button v-if="!open" type="button" class="linkish self-start font-ui text-sm" @click="open = true">
      Ask someone to check
    </button>
    <form v-else class="flex flex-wrap items-center gap-2" @submit.prevent="ask($event.target as HTMLFormElement)">
      <label class="sr-only" for="check-to">Who should check it?</label>
      <select id="check-to" name="to" required class="w-48">
        <option value="" disabled selected>{{ detail.isPending.value ? "Loading the team…" : "Who checks it?" }}</option>
        <option v-for="p in people" :key="p.to" :value="p.to">{{ p.label }}</option>
      </select>
      <label class="sr-only" for="check-what">What should they look at?</label>
      <input
        id="check-what"
        name="what"
        required
        maxlength="200"
        class="min-w-0 flex-1"
        placeholder="What to look at — e.g. open the checkout on a phone"
      />
      <button class="btn primary" type="submit" :disabled="busy">{{ busy ? "Asking…" : "Ask" }}</button>
      <button class="btn" type="button" @click="open = false">Cancel</button>
    </form>
    <p v-if="trouble" class="m-0 font-ui text-sm text-danger" role="alert">{{ trouble }}</p>
  </div>
</template>
