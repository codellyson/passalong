<!--
  What the runner finished, waiting on a person (2026-11-06).

  The runner's agent works with nobody watching, so its hand-in no longer goes straight to Done: it
  waits here. Approve puts it in Done with what it showed. Send back says what to change: the runner
  takes it again and carries on from its branch, with the note in front of it. Nothing is closed
  that nobody looked at, and nothing goes back without a reason.
-->
<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import type { ContextClaim } from "~/types/hub";

const props = defineProps<{ id: string; claim: ContextClaim }>();
const { api, json } = useHub();
const queryClient = useQueryClient();

const busy = ref<"" | "approve" | "back">("");
const problem = ref("");
const sending = ref(false);
const note = ref("");

/** A link to the change, when the hand-in carried one: the pull request is what you review. */
const link = computed(() => (/^https?:\/\//.test(props.claim.pr || "") ? props.claim.pr : ""));
const checks = computed(() => props.claim.checks ?? []);

async function act(kind: "approve" | "back") {
  if (busy.value) return;
  busy.value = kind;
  problem.value = "";
  try {
    if (kind === "approve") await api(`/v1/work/${props.id}/approve`, json("POST", {}));
    else await api(`/v1/work/${props.id}/send-back`, json("POST", { note: note.value.trim() }));
    await queryClient.invalidateQueries({ queryKey: hubKeys.context(props.id) });
    await queryClient.invalidateQueries({ queryKey: hubKeys.board });
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <section
    aria-labelledby="review-h"
    class="flex flex-col gap-3 rounded-3 border border-line bg-raised p-4 font-ui text-sm"
  >
    <h2 id="review-h" class="m-0 text-sm font-semibold tracking-normal">Ready for your review</h2>
    <p class="m-0 max-w-[65ch]">
      The runner finished this. Look at what it did, then approve it or send it back with what to change.
    </p>
    <p v-if="claim.note" class="m-0 max-w-[65ch] text-muted">“{{ claim.note }}”</p>
    <p v-if="link" class="m-0">
      <a :href="link" target="_blank" rel="noopener">Open the pull request</a>
    </p>
    <p v-else-if="claim.pr" class="m-0 font-code text-xs text-muted">{{ claim.pr }}</p>

    <ul v-if="checks.length" class="m-0 flex list-none flex-col gap-2 p-0">
      <li v-for="(k, i) in checks" :key="i" class="flex gap-2">
        <AppIcon :name="k.ok === false ? 'x' : 'check'" class="mt-0.5 shrink-0" :class="k.ok === false ? 'text-danger' : 'text-ok'" />
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="font-medium">{{ k.check }}</span>
          <span v-if="k.says" class="text-muted">{{ k.says }}</span>
        </div>
      </li>
    </ul>
    <p v-if="claim.writeup" class="m-0 max-w-[65ch] whitespace-pre-wrap text-muted">{{ claim.writeup }}</p>
    <details v-if="claim.evidence" class="text-xs">
      <summary class="cursor-pointer text-muted">What it ran</summary>
      <HubEvidence :text="claim.evidence" />
    </details>

    <form v-if="sending" class="flex flex-col gap-2" @submit.prevent="act('back')">
      <label for="review-note" class="font-medium">What should it change?</label>
      <textarea
        id="review-note"
        v-model="note"
        rows="3"
        class="w-full resize-none [field-sizing:content] min-h-[4.5rem]"
        placeholder="The coupon still shows yesterday's date after midnight."
      />
      <span class="flex flex-wrap gap-2">
        <button class="btn primary" type="submit" :disabled="!note.trim() || Boolean(busy)">
          {{ busy === "back" ? "Sending back…" : "Send back to the runner" }}
        </button>
        <button class="btn" type="button" :disabled="Boolean(busy)" @click="sending = false">Cancel</button>
      </span>
    </form>
    <span v-else class="flex flex-wrap gap-2">
      <button class="btn primary" type="button" :disabled="Boolean(busy)" @click="act('approve')">
        <AppIcon name="check" />{{ busy === "approve" ? "Approving…" : "Approve" }}
      </button>
      <button class="btn" type="button" :disabled="Boolean(busy)" @click="sending = true">Send back</button>
    </span>
    <p v-if="problem" class="m-0 text-danger" role="alert">{{ problem }}</p>
  </section>
</template>
