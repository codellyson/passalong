<!--
  Go straight to a guide by its id. Agents name guides by id (`w45xjxw9`) in what they write, and
  finding one meant searching for words that may not be in its title. Paste the id — with its
  backticks, or a share or hub link — and Enter opens it. ⌘K or Ctrl+K focuses it from any hub page.
-->
<script setup lang="ts">
import { guideIdFrom } from "~/utils/goto";

const box = ref<HTMLInputElement | null>(null);
const wrong = ref(false);
const mac = ref(false);

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    box.value?.focus();
    box.value?.select();
  }
}
onMounted(() => {
  mac.value = /Mac|iPhone|iPad/.test(navigator.platform);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));

// Uncontrolled, as the hub's other inputs: read on submit.
async function go(form: HTMLFormElement) {
  const id = guideIdFrom(field(form, "id"));
  wrong.value = !id;
  if (!id) return;
  form.reset();
  box.value?.blur();
  await navigateTo(`/hub/g/${id}`);
}
</script>

<template>
  <form class="relative max-sm:hidden" role="search" @submit.prevent="go($event.target as HTMLFormElement)">
    <label class="sr-only" for="hub-goto">Go to a guide by its id</label>
    <input
      id="hub-goto"
      ref="box"
      name="id"
      class="w-40 pr-10 font-code text-sm lg:w-48"
      placeholder="Go to id"
      autocomplete="off"
      spellcheck="false"
      :aria-invalid="wrong || undefined"
      aria-describedby="hub-goto-help"
      @input="wrong = false"
      @keydown.esc="box?.blur()"
    />
    <kbd aria-hidden="true" class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-ui text-xs text-muted">{{ mac ? "⌘K" : "Ctrl K" }}</kbd>
    <p id="hub-goto-help" class="sr-only" aria-live="polite">{{ wrong ? "That isn't a guide id" : "" }}</p>
  </form>
</template>
