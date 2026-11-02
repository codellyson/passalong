<script setup lang="ts">
import type { ContextClaim, Work } from "~/types/hub";

const props = defineProps<{ work: Work; claims: ContextClaim[] }>();
const { data, api, onPersonTaskProgress, onPersonTaskHandIn, error } = useHub();

/**
 * Finishing needs proof a person can look at, so the form takes a screenshot:
 * uploaded like a reply's picture, and its line put into what shows it works.
 */
const uploading = ref(false);
async function addShot(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  uploading.value = true;
  try {
    const name = file.name.replace(/[^\x20-\x7e]/g, "") || "screenshot";
    const got = await api<{ shot: { url: string } }>("/v1/shots", {
      method: "POST",
      headers: { "content-type": file.type, "x-shot-name": name },
      body: file,
    });
    if (got?.shot) evidence.value = `${evidence.value.trim()}\n![${name}](${got.shot.url})`.trim();
  } finally {
    uploading.value = false;
  }
}
const held = computed(() => {
  const account = data.value.me?.account || "";
  const person = `person-${account.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
  return props.claims.find((c) => c.agent === person && c.state === "claimed") || null;
});
const progress = ref("");
const summary = ref("");
const writeup = ref("");
const evidence = ref("");
const risk = ref("");
const busy = ref(false);
const handInOpen = ref(false);

async function act(work: () => Promise<boolean>) {
  busy.value = true;
  try {
    await work();
  } finally {
    busy.value = false;
  }
}

const update = () => act(() => onPersonTaskProgress(props.work.id, progress.value));
const handIn = async () => {
  if (!summary.value.trim()) return false;
  const ok = await onPersonTaskHandIn(props.work.id, {
    note: summary.value,
    writeup: writeup.value,
    evidence: evidence.value,
    risk: risk.value,
  });
  if (ok) handInOpen.value = false;
  return ok;
};
</script>

<template>
  <!-- Taking it and "Not for me" are the work page's own acts, in its header. -->
  <section v-if="held" class="rounded-3 bg-raised p-4 shadow-edge" aria-label="Your work on this">
      <h2 class="m-0 font-ui text-sm font-semibold text-fg">You’re working on this</h2>
      <form class="mt-3 flex flex-col gap-3" @submit.prevent="update">
        <label class="flex flex-col gap-2 font-ui text-sm">
          Progress update
          <textarea v-model="progress" rows="2" maxlength="280" placeholder="What have you done, and what comes next?" />
        </label>
        <div class="flex flex-wrap gap-2">
          <button class="btn" type="submit" :disabled="busy || !progress.trim()">{{ busy ? "Saving…" : "Update progress" }}</button>
          <button class="btn primary" type="button" :aria-expanded="handInOpen" @click="handInOpen = !handInOpen">Finish</button>
        </div>
      </form>
      <form v-if="handInOpen" class="mt-4 flex flex-col gap-3 border-t border-line pt-4" @submit.prevent="act(handIn)">
        <label class="flex flex-col gap-2 font-ui text-sm">In one sentence, what did you do?<input v-model="summary" required maxlength="280" placeholder="The requested onboarding flow is now in place." /></label>
        <label class="flex flex-col gap-2 font-ui text-sm">What shows it works?<textarea v-model="evidence" rows="3" placeholder="A screenshot, or the command you ran and its result: npm test → 41 pass" /></label>
        <label class="btn sm self-start" :aria-busy="uploading">
          {{ uploading ? "Uploading…" : "Add a screenshot" }}
          <input type="file" accept="image/*" class="sr-only" :disabled="uploading" @change="addShot" />
        </label>
        <label class="flex flex-col gap-2 font-ui text-sm">What you had to adapt (optional)<textarea v-model="writeup" rows="3" maxlength="500" placeholder="A few lines at most. Anything longer belongs in the change itself." /></label>
        <label class="flex flex-col gap-2 font-ui text-sm">What could it break? (optional)<input v-model="risk" maxlength="280" placeholder="One line, or leave empty." /></label>
        <button class="btn primary self-start" type="submit" :disabled="busy || !summary.trim()">{{ busy ? "Finishing…" : "Finish" }}</button>
      </form>
    <p v-if="error" class="mt-3 mb-0 font-ui text-sm text-danger" role="status">{{ error }}</p>
  </section>
</template>
