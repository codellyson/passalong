<!--
  Without a handle you cannot be addressed — `--to team/@you` has nothing to aim at — so an account
  that has not claimed one is prompted rather than left to find the CLI.

  Two shapes, one form. On the board it is a panel that appears only when there is no handle yet;
  on settings (`bare`) it is the content of a section that already has its own label and blurb.
-->
<script setup lang="ts">
import type { Me } from "~/types/hub";

const props = defineProps<{ bare?: boolean }>();

const { data, api, json, editing, setMe } = useHub();
const error = ref<string | null>(null);

const me = computed(() => data.value.me);
const show = computed(
  () => Boolean(me.value) && (props.bare || !me.value?.handle || editing.value),
);

/** The one error anyone actually hits belongs against the field that caused it. */
const onHandle = computed(() => Boolean(error.value?.includes("handle")));

const label = "block font-ui text-sm font-medium text-fg mb-1.5";
const box = "block w-full max-w-sm";

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
  <div v-if="show" :class="bare ? '' : 'identity' + (me?.handle ? '' : ' needed')">
    <template v-if="!bare">
      <h2>{{ me?.handle ? "Your details" : "Claim a handle" }}</h2>
      <p class="muted">
        {{
          me?.handle
            ? "How teammates address you, and where handoffs are mailed."
            : "Teammates hand work to a handle. Until you claim one, nothing can be addressed to you."
        }}
      </p>
    </template>

    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <div :class="box">
        <label :class="label" for="handle">Handle</label>
        <!-- The @ is not part of the value, and typing it again is the obvious mistake to make, so
             it sits in the field as furniture rather than in the placeholder. -->
        <div
          class="flex items-center gap-1 rounded-1 border bg-raised pl-3 focus-within:border-accent"
          :class="onHandle ? 'border-danger' : 'border-line-strong'"
        >
          <span class="font-code text-sm text-muted">@</span>
          <input
            id="handle"
            name="handle"
            :value="me?.handle || ''"
            class="w-full border-0 bg-transparent px-0 py-2 pr-3 focus:outline-none"
            required
            spellcheck="false"
            pattern="[a-zA-Z0-9][a-zA-Z0-9-]{1,30}"
            title="2–31 characters: letters, digits and dashes"
          />
        </div>
        <p v-if="onHandle" class="mt-1.5 mb-0 font-ui text-sm text-danger">
          {{ error }}. Handles are unique across Passalong.
        </p>
      </div>

      <div :class="box">
        <label :class="label" for="name">Name</label>
        <input id="name" name="name" class="w-full" :value="me?.name || ''" />
      </div>

      <div :class="box">
        <label :class="label" for="email">Email</label>
        <input id="email" name="email" type="email" class="w-full" :value="me?.email || ''" />
      </div>

      <div class="flex flex-wrap gap-2">
        <button class="primary" type="submit">Save</button>
        <!-- On settings there is nothing to close, so cancel means "put back what was there" —
             which a native reset does exactly, the inputs being uncontrolled. -->
        <button v-if="bare" class="btn" type="reset" @click="error = null">Cancel</button>
        <button v-else-if="me?.handle" class="btn" type="button" @click="editing = false">
          Cancel
        </button>
      </div>
    </form>

    <p v-if="error && !onHandle" class="m-0 rounded-2 border border-danger bg-danger-soft px-3 py-2.5 font-ui text-sm text-danger">{{ error }}</p>
  </div>
</template>
