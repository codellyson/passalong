<!--
  Go straight to a piece of work by its id. Agents name work by id (`w45xjxw9`) in what they write, and
  finding one meant searching for words that may not be in its title. Paste the id — with its
  backticks, or a share or hub link — and Enter opens it. ⌘K or Ctrl+K focuses it from any hub page.
-->
<script setup lang="ts">
import { workIdFrom } from "~/utils/goto";

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
  const id = workIdFrom(field(form, "id"));
  wrong.value = !id;
  if (!id) return;
  form.reset();
  box.value?.blur();
  await navigateTo(`/hub/w/${id}`);
}
</script>

<template>
  <!-- On the rail, so it is there on every page and in the phone's drawer: an id from an agent's
       message is as likely to be opened on a phone, which has no ⌘K and so no hint. -->
  <form class="relative min-w-0" role="search" @submit.prevent="go($event.target as HTMLFormElement)">
    <label class="sr-only" for="hub-goto">Go to work by its id</label>
    <input
      id="hub-goto"
      ref="box"
      name="id"
      class="h-8 w-full border-rail-line bg-rail-hover pr-12 font-ui text-sm text-on-rail placeholder:text-on-rail-muted focus:border-on-rail-muted"
      placeholder="Go to…"
      autocomplete="off"
      spellcheck="false"
      :aria-invalid="wrong || undefined"
      aria-describedby="hub-goto-help"
      @input="wrong = false"
      @keydown.esc="box?.blur()"
    />
    <kbd aria-hidden="true" class="pointer-events-none absolute max-md:hidden top-1/2 right-2 -translate-y-1/2 font-ui text-xs text-on-rail-muted">{{ mac ? "⌘K" : "Ctrl K" }}</kbd>
    <p id="hub-goto-help" class="sr-only" aria-live="polite">{{ wrong ? "That isn't an id for any work" : "" }}</p>
  </form>
</template>
