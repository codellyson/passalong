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
    <!-- Said once, quietly: a card with no button in it does not look tappable at rest, and on a
         phone there is no hover to show it. -->
    <p v-if="!picked" class="m-0 text-xs text-muted">Tap one to choose it.</p>
    <ol
      v-if="!picked"
      class="m-0 grid list-none gap-2 p-0"
      :class="compact ? 'grid-cols-2 @2xl:grid-cols-4' : 'sm:grid-cols-2'"
      aria-label="Pick one"
    >
      <!-- The whole card is the button: one quiet target each, rather than a filled Choose in
           every card competing with the page's own actions (2026-11-06). -->
      <li v-for="(c, n) in choices" :key="n" class="flex">
        <button
          type="button"
          class="flex w-full cursor-pointer flex-col gap-1.5 rounded-2 border border-line bg-surface p-2 text-left font-ui transition-colors hover:border-fg focus-visible:border-fg disabled:cursor-wait disabled:opacity-60"
          :disabled="busy"
          :aria-label="`Choose ${n + 1}: ${c.label}`"
          @click="choose(n)"
        >
          <img
            v-if="c.picture"
            :src="c.picture"
            alt=""
            class="w-full rounded-1 border border-line"
            loading="lazy"
          />
          <span class="text-sm font-medium text-fg">{{ n + 1 }}. {{ c.label }}</span>
          <span v-if="c.detail && !compact" class="text-xs text-muted">{{ c.detail }}</span>
        </button>
      </li>
    </ol>
    <p v-if="trouble" role="alert" class="m-0 text-sm text-danger">{{ trouble }}</p>
  </div>
</template>
