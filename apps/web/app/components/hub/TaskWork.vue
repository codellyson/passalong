<script setup lang="ts">
import type { ContextClaim, Guide } from "~/types/hub";

const props = defineProps<{ guide: Guide; claims: ContextClaim[]; owner: boolean }>();
const { data, api, onPersonTaskTake, onPersonTaskProgress, onPersonTaskHandIn, onPass, error } =
  useHub();

/**
 * Finishing needs proof a person can look at (docs/REVIEW.md §3), so the form takes a screenshot:
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
const canTake = computed(
  () =>
    !props.owner &&
    props.guide.status === "published" &&
    // Sent to the whole team, or to you or a group you are in: not given to somebody else.
    !((props.guide.to || props.guide.to_group) && !props.guide.for_me) &&
    !props.claims.length,
);
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

const take = () => act(() => onPersonTaskTake(props.guide.id));
/** Not for me: the reason is required, because "not me" without "why" leaves the sender guessing. */
const passing = ref(false);
const why = ref("");
const pass = () => act(() => onPass(props.guide.id, why.value.trim()));
const update = () => act(() => onPersonTaskProgress(props.guide.id, progress.value));
const handIn = async () => {
  if (!summary.value.trim()) return false;
  const ok = await onPersonTaskHandIn(props.guide.id, {
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
  <section v-if="canTake || held" class="rounded-3 bg-raised p-4 shadow-edge" aria-label="Your work on this">
    <div v-if="canTake" class="flex flex-wrap items-center justify-between gap-3">
      <p class="m-0 font-ui text-sm text-muted">Take it to work on it yourself: nobody else can take it while you hold it.</p>
      <div class="flex flex-wrap gap-2">
        <button class="btn primary" type="button" :disabled="busy" @click="take">{{ busy ? "Taking…" : "I'll do this" }}</button>
        <button class="btn outline warn" type="button" :aria-expanded="passing" @click="passing = !passing">Not for me</button>
      </div>
    </div>
    <form v-if="canTake && passing" class="mt-3 flex flex-col gap-3 border-t border-line pt-3" @submit.prevent="pass">
      <label class="flex flex-col gap-2 font-ui text-sm">
        Why isn't it yours? Whoever sent it is told.
        <input v-model="why" required maxlength="280" placeholder="Not my area — the payments team owns this." />
      </label>
      <button class="btn outline warn self-start" type="submit" :disabled="busy || !why.trim()">{{ busy ? "Handing back…" : "Hand it back" }}</button>
    </form>
    <template v-else-if="held">
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
    </template>
    <p v-if="error" class="mt-3 mb-0 font-ui text-sm text-danger" role="status">{{ error }}</p>
  </section>
</template>
