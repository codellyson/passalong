<!--
  On Needs you, for an account with no name: asked once, until it has one. Sign-up asks for a name
  now, but accounts made before that went by a random code on everything they and their agents did
  ("@f62r7bcm75 sent it", "Someone's agent finished it") (2026-11-07). An @name comes with it when
  the account has none, made from the name the way setup suggests one.
-->
<script setup lang="ts">
import { handleFrom } from "~/utils/people";

const { data, api, json, refresh } = useHub();
const me = computed(() => data.value.me);
const show = computed(() => Boolean(me.value) && !me.value?.name?.trim());

const name = ref("");
const busy = ref(false);
const problem = ref("");

async function save() {
  const typed = name.value.trim();
  if (!typed || busy.value) return;
  busy.value = true;
  problem.value = "";
  try {
    await api("/v1/me", json("PATCH", { name: typed }));
    // The @name is a bonus: taken or unusable, the name alone is saved and it can be set later.
    const handle = handleFrom(typed);
    if (!me.value?.handle && handle.length >= 2)
      await api("/v1/me", json("PATCH", { handle })).catch(() => null);
    await refresh(hubKeys.me);
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section v-if="show" aria-labelledby="name-h" class="settle mb-8 flex flex-col gap-3 rounded-3 border border-line bg-raised px-4 py-4">
    <div>
      <h2 id="name-h" class="m-0 font-ui text-base font-medium tracking-normal text-fg">What should people call you?</h2>
      <p class="m-0 mt-1 font-ui text-sm text-muted">
        Your teammates see it on the work you send and on what your agent does. Until you say, they
        see a random code.
      </p>
    </div>
    <form class="flex flex-wrap items-center gap-2" @submit.prevent="save">
      <label class="sr-only" for="name-note">Your name</label>
      <input
        id="name-note"
        v-model="name"
        type="text"
        required
        maxlength="80"
        autocomplete="name"
        placeholder="Ada Lovelace"
        class="min-w-0 grow basis-56"
      />
      <button class="btn primary sm" type="submit" :disabled="busy || !name.trim()">
        {{ busy ? "Saving…" : "Save" }}
      </button>
    </form>
    <p v-if="problem" role="alert" class="m-0 font-ui text-sm text-danger">{{ problem }}</p>
  </section>
</template>
