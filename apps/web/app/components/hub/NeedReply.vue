<!--
  Reply, opened in place on a Needs you row where an agent is asking: the answer goes to whoever
  holds the work, the same as from its page, and the row leaves on the next load. Opening the work
  to type one line was the only way before (2026-11-10).
-->
<script setup lang="ts">
const props = defineProps<{ id: string }>();
const emit = defineEmits<{ done: [] }>();

const { onReply, refresh } = useHub();
const { toast } = useLive();
const busy = ref(false);
const trouble = ref("");
const box = ref<HTMLTextAreaElement | null>(null);
onMounted(() => box.value?.focus());

async function send(form: HTMLFormElement) {
  const body = field(form, "body").trim();
  if (!body || busy.value) return;
  busy.value = true;
  trouble.value = "";
  try {
    await onReply(props.id, body);
    // Said in the corner: the row leaves as soon as the list is read again (as Choices does).
    toast({ text: "Sent. The agent carries on with it.", work: props.id, kind: "task_finished" });
    emit("done");
    await refresh(hubKeys.needs);
  } catch (e) {
    trouble.value = e instanceof Error ? e.message : "That didn't send. Try again.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="send($event.target as HTMLFormElement)">
    <label class="sr-only" :for="`reply-${id}`">Your answer</label>
    <!-- The server cuts a reply at 1000 characters; refusing here keeps it whole. -->
    <textarea
      :id="`reply-${id}`"
      ref="box"
      name="body"
      rows="2"
      maxlength="1000"
      required
      class="min-h-16 w-full text-sm"
      placeholder="Your answer"
      @keydown.meta.enter="($event.target as HTMLTextAreaElement).form?.requestSubmit()"
      @keydown.ctrl.enter="($event.target as HTMLTextAreaElement).form?.requestSubmit()"
    />
    <p v-if="trouble" role="alert" class="m-0 font-ui text-xs text-danger">{{ trouble }}</p>
    <div class="flex items-center gap-2">
      <button class="btn primary sm" type="submit" :disabled="busy">{{ busy ? "Sending…" : "Send" }}</button>
      <button class="btn sm" type="button" @click="emit('done')">Cancel</button>
    </div>
  </form>
</template>
