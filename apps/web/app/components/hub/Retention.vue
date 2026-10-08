<!--
  Whether Passalong tidies guides away on a clock.

  On by default, and it is the setting most people should leave alone: a closed guide's proof
  screenshots are deleted five days after it is closed, and a guide you sent that nobody has opened
  is shelved after fourteen days. Turning it off keeps both for good. Saved the moment it is
  flipped, because a switch that waits for a Save button is a switch people leave half done.
-->
<script setup lang="ts">
const { data, api, json, setMe } = useHub();

const me = computed(() => data.value.me);
const tidy = computed(() => !me.value?.keep_forever);
const saving = ref(false);
const error = ref<string | null>(null);

async function flip(next: boolean) {
  saving.value = true;
  error.value = null;
  try {
    const saved = await api<{ keep_forever?: boolean }>(
      "/v1/me",
      json("PATCH", { keep_forever: !next }),
    );
    if (me.value) setMe({ ...me.value, keep_forever: !next, ...(saved ?? {}) });
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="flex max-w-xl flex-col gap-3">
    <label class="flex items-start gap-3 font-ui text-sm text-fg">
      <input
        type="checkbox"
        class="mt-1"
        :checked="tidy"
        :disabled="saving || (tidy && me?.may_keep === false)"
        @change="flip(($event.target as HTMLInputElement).checked)"
      >
      <span>
        <b>Clean up automatically</b>
        <span class="mt-1 block text-muted">
          Proof screenshots are deleted 5 days after a guide is closed, and a guide you sent that
          nobody has opened is shelved after 14 days. Shelving is reversible; deleting a screenshot
          is not. Turn this off to keep both for good.
        </span>
      </span>
    </label>
    <p v-if="tidy && me?.may_keep === false" class="m-0 font-ui text-xs text-muted">
      Keeping everything is part of a paid plan.
    </p>
    <p v-if="error" class="m-0 font-ui text-sm text-danger" role="alert">{{ error }}</p>
  </div>
</template>
