<script setup lang="ts">
import type { ContextClaim, Guide } from "~/types/hub";

const props = defineProps<{ guide: Guide; claims: ContextClaim[]; owner: boolean }>();
const { data, onPersonTaskTake, onPersonTaskProgress, onPersonTaskHandIn, error } = useHub();
const held = computed(() => {
  const account = data.value.me?.account || "";
  const person = `person-${account.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
  return props.claims.find((c) => c.agent === person && c.state === "claimed") || null;
});
const canTake = computed(
  () => !props.owner && props.guide.status === "published" && props.guide.for_me !== false && !props.claims.length,
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
  <section v-if="canTake || held" class="rounded-3 bg-raised p-4 shadow-edge" aria-label="Task work">
    <div v-if="canTake" class="flex flex-wrap items-center justify-between gap-3">
      <p class="m-0 font-ui text-sm text-muted">You can take this task and keep its progress here.</p>
      <button class="btn primary" type="button" :disabled="busy" @click="take">{{ busy ? "Taking…" : "Take task" }}</button>
    </div>
    <template v-else-if="held">
      <h2 class="m-0 font-ui text-sm font-semibold text-fg">You’re working on this task</h2>
      <form class="mt-3 flex flex-col gap-3" @submit.prevent="update">
        <label class="flex flex-col gap-2 font-ui text-sm">
          Progress update
          <textarea v-model="progress" rows="2" maxlength="280" placeholder="What have you done, and what comes next?" />
        </label>
        <div class="flex flex-wrap gap-2">
          <button class="btn" type="submit" :disabled="busy || !progress.trim()">{{ busy ? "Saving…" : "Update progress" }}</button>
          <button class="btn primary" type="button" :aria-expanded="handInOpen" @click="handInOpen = !handInOpen">Hand in</button>
        </div>
      </form>
      <form v-if="handInOpen" class="mt-4 flex flex-col gap-3 border-t border-line pt-4" @submit.prevent="act(handIn)">
        <label class="flex flex-col gap-2 font-ui text-sm">What did you do?<textarea v-model="writeup" rows="4" placeholder="Describe what you completed against the task’s Acceptance." /></label>
        <label class="flex flex-col gap-2 font-ui text-sm">What should the reviewer know?<textarea v-model="evidence" rows="3" placeholder="Add links, outcomes, or other evidence." /></label>
        <label class="flex flex-col gap-2 font-ui text-sm">Risk (optional)<textarea v-model="risk" rows="2" placeholder="Anything this change could affect." /></label>
        <label class="flex flex-col gap-2 font-ui text-sm">One sentence summary<input v-model="summary" required maxlength="280" placeholder="The requested onboarding flow is now in place." /></label>
        <button class="btn primary self-start" type="submit" :disabled="busy || !summary.trim()">{{ busy ? "Handing in…" : "Send for review" }}</button>
      </form>
      <p v-if="error" class="mt-3 mb-0 font-ui text-sm text-danger" role="status">{{ error }}</p>
    </template>
  </section>
</template>
