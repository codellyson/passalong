<!--
  Without a handle you cannot be addressed — `--to team/@you` has nothing to aim at — so an account
  that has not claimed one is prompted rather than left to find the CLI.
-->
<script setup lang="ts">
import type { Me } from "~/types/hub";

const { data, api, json, editing, setMe } = useHub();
const error = ref<string | null>(null);

const me = computed(() => data.value.me);
const show = computed(() => Boolean(me.value) && (!me.value?.handle || editing.value));

async function submit(e: Event) {
  // Read first, then set state: a re-render would reset these inputs to the stored values.
  const f = e.target as HTMLFormElement;
  const body = {
    handle: field(f, "handle"),
    name: field(f, "name"),
    email: field(f, "email"),
  };
  error.value = null;
  try {
    const next = await api<Partial<Me>>("/v1/me", json("PATCH", body));
    if (me.value && next) setMe({ ...me.value, ...next });
    editing.value = false;
  } catch (err) {
    // "handle @x is taken" is the one error people actually hit, and it is useless at the bottom
    // of the page, so it reports next to the field. What was typed stays put.
    error.value = (err as Error).message;
  }
}
</script>

<template>
  <section v-if="show" :class="['identity', { needed: !me?.handle }]">
    <h2>{{ me?.handle ? "Your details" : "Claim a handle" }}</h2>
    <p class="muted">
      {{
        me?.handle
          ? "How teammates address you, and where handoffs are mailed."
          : "Teammates hand work to a handle. Until you claim one, nothing can be addressed to you."
      }}
    </p>
    <form @submit.prevent="submit">
      <input
        name="handle"
        :value="me?.handle || ''"
        placeholder="handle"
        required
        spellcheck="false"
        pattern="[a-zA-Z0-9][a-zA-Z0-9-]{1,30}"
        title="2–31 characters: letters, digits and dashes"
      />
      <input name="name" :value="me?.name || ''" placeholder="name (optional)" />
      <input name="email" type="email" :value="me?.email || ''" placeholder="email (optional)" />
      <button class="primary" type="submit">Save</button>
      <button v-if="me?.handle" class="btn" type="button" @click="editing = false">cancel</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>
