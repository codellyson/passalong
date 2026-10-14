<!--
  Ready, asked where the card is: which repo the task is for, prefilled with the one it already
  names and offering the repos this account's tasks and agents use, as the guide's page does. A
  task dropped on To do, or Ready for agents… in its menu, opens this rather than leaving the board.

  The repo list comes from the guide's context, which records no pull. Escape, a click elsewhere
  or Cancel closes it without changing anything.
-->
<script setup lang="ts">
import type { Guide, GuideContext } from "~/types/hub";

const props = defineProps<{ guide: Guide; x: number; y: number }>();
const emit = defineEmits<{ close: []; ready: [repo: string] }>();
const { api } = useHub();

const ctx = ref<GuideContext | null>(null);
const box = ref<HTMLElement | null>(null);
const at = ref({ left: props.x, top: props.y });
const list = `ready-repos-${props.guide.id}`;

onMounted(async () => {
  const r = box.value?.getBoundingClientRect();
  if (r)
    at.value = {
      left: Math.max(8, Math.min(props.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(props.y, window.innerHeight - r.height - 8)),
    };
  box.value?.querySelector("input")?.focus();
  document.addEventListener("pointerdown", outside, true);
  ctx.value = await api<GuideContext>(`/v1/guides/${props.guide.id}/context`).catch(() => null);
  // Prefilled once it is known, unless somebody has already started typing.
  const input = box.value?.querySelector("input");
  if (input && !input.value) input.value = ctx.value?.target || "";
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside, true));
function outside(e: PointerEvent) {
  if (!box.value?.contains(e.target as Node)) emit("close");
}
// Uncontrolled, as every prefilled input in the hub: read on submit.
function submit(form: HTMLFormElement) {
  emit("ready", field(form, "repo"));
}
</script>

<template>
  <Teleport to="body">
    <form
      ref="box"
      class="menu !fixed !m-0 w-72 gap-2"
      :style="{ left: `${at.left}px`, top: `${at.top}px`, right: 'auto' }"
      :aria-label="`Make ${guide.title || 'this task'} ready for agents`"
      @submit.prevent="submit($event.target as HTMLFormElement)"
      @keydown.esc="emit('close')"
    >
      <label class="font-ui text-sm font-medium" :for="`${list}-input`">Which repo is this for?</label>
      <input
        :id="`${list}-input`"
        name="repo"
        :list="list"
        placeholder="owner/repo"
        autocomplete="off"
        spellcheck="false"
      />
      <datalist :id="list">
        <option v-for="r in ctx?.repos || []" :key="r" :value="r" />
      </datalist>
      <p class="menu-note !m-0 !p-0">The next agent working in that repo takes it. Leave it empty for no repo.</p>
      <div class="flex items-center gap-2">
        <button class="btn sm primary" type="submit">Ready for agents</button>
        <button class="btn sm" type="button" @click="emit('close')">Cancel</button>
      </div>
    </form>
  </Teleport>
</template>
