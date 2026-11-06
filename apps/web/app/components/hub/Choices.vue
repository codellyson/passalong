<!--
  A question's options, where the question reaches you: Needs you and the work's page. A card
  each, with its picture, and Choose sends the pick as the reply, the same as from the conversation
  or the email. After a pick it says so, and the row leaves Needs you on the next load.
-->
<script setup lang="ts">
const props = defineProps<{
  id: string;
  choices: { label: string; detail: string; picture: string }[];
  /** Smaller cards in a list row; full ones on the work's page and the lead. */
  compact?: boolean;
}>();

const { onReply, refresh } = useHub();
const { toast } = useLive();
const busy = ref(false);
const picked = ref("");
const trouble = ref("");

async function choose(n: number) {
  const c = props.choices[n];
  if (!c || busy.value) return;
  busy.value = true;
  trouble.value = "";
  try {
    await onReply(props.id, `I choose option ${n + 1}: ${c.label}`);
    picked.value = c.label;
    // Said in the corner too: on Needs you the row leaves as soon as the list is read again, and a
    // tap that makes its row vanish without a word reads as a tap that did nothing (2026-11-06).
    toast({
      text: `You chose ${c.label}. The agent carries on with it.`,
      work: props.id,
      kind: "task_finished",
    });
    await refresh(hubKeys.needs);
  } catch (e) {
    trouble.value = e instanceof Error ? e.message : "That didn't send. Try again.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-2 font-ui">
    <p v-if="picked" role="status" class="m-0 text-sm">
      You chose <b class="font-medium">{{ picked }}</b>. The agent carries on with it.
    </p>
    <ol
      v-else
      class="m-0 grid list-none gap-2 p-0"
      :class="compact ? 'grid-cols-2 @2xl:grid-cols-4' : 'sm:grid-cols-2'"
      aria-label="Pick one"
    >
      <li
        v-for="(c, n) in choices"
        :key="n"
        class="flex flex-col gap-2 rounded-2 border border-line bg-surface p-2"
      >
        <img
          v-if="c.picture"
          :src="c.picture"
          :alt="`Option ${n + 1}: ${c.label}`"
          class="w-full rounded-1 border border-line"
          loading="lazy"
        />
        <p class="m-0 text-sm font-medium">{{ n + 1 }}. {{ c.label }}</p>
        <p v-if="c.detail && !compact" class="m-0 text-xs text-muted">{{ c.detail }}</p>
        <button class="btn sm primary mt-auto self-start" type="button" :disabled="busy" @click="choose(n)">
          Choose
        </button>
      </li>
    </ol>
    <p v-if="trouble" role="alert" class="m-0 text-sm text-danger">{{ trouble }}</p>
  </div>
</template>
