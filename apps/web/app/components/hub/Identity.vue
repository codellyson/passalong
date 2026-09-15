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
/** On Settings, Save and Cancel only appear once something was typed: there is nothing to save before. */
const dirty = ref(false);

const me = computed(() => data.value.me);
const show = computed(
  () => Boolean(me.value) && (props.bare || !me.value?.handle || editing.value),
);

/** The one error anyone actually hits belongs against the field that caused it. */
const onHandle = computed(() => Boolean(error.value && /handle|@|taken/i.test(error.value)));

const label = "block font-ui text-sm font-medium text-fg mb-2";
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
    dirty.value = false;
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
      <h2>{{ me?.handle ? "Your details" : "Tell your team who you are" }}</h2>
      <p class="muted">
        {{
          me?.handle
            ? "Your name, the @name teammates send work to, and where we email you about it."
            : "Nothing can be sent to you until teammates have an @name to send it to."
        }}
      </p>
    </template>

    <form
      class="flex flex-col gap-4"
      @submit.prevent="submit"
      @input="dirty = true"
      @reset="dirty = false; error = null"
    >
      <div :class="box">
        <label :class="label" for="handle">How teammates mention you</label>
        <!-- The @ is not part of the value, and typing it again is the obvious mistake to make, so
             it sits in the field as furniture rather than in the placeholder. -->
        <div
          class="flex items-center gap-1 rounded-1 border bg-raised pl-3 focus-within:border-accent"
          :class="onHandle ? 'border-danger' : 'border-line-strong'"
        >
          <span class="text-sm text-muted">@</span>
          <input
            id="handle"
            name="handle"
            :value="me?.handle || ''"
            class="w-full border-0 bg-transparent px-0 py-2 pr-3 focus:outline-none"
            required
            spellcheck="false"
            pattern="[a-zA-Z0-9][a-zA-Z0-9-]{1,30}"
            title="2 to 31 letters, numbers or dashes"
          />
        </div>
        <p v-if="onHandle" class="mt-2 mb-0 font-ui text-sm text-danger">{{ error }}</p>
        <p v-else class="mt-2 mb-0 font-ui text-sm text-muted">
          2 to 31 letters, numbers or dashes. Nobody else on Passalong can use the same one.
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

      <p v-if="bare && !dirty" class="m-0 font-ui text-sm text-muted">Saved.</p>
      <div v-else class="flex flex-wrap gap-2">
        <button class="primary" type="submit">{{ bare ? "Save changes" : "Save" }}</button>
        <!-- On settings there is nothing to close, so cancel means "put back what was there" —
             which a native reset does exactly, the inputs being uncontrolled. -->
        <button v-if="bare" class="btn" type="reset">Cancel</button>
        <button v-else-if="me?.handle" class="btn" type="button" @click="editing = false">
          Cancel
        </button>
      </div>
    </form>

    <p v-if="error && !onHandle" class="m-0 rounded-2 border border-danger bg-danger-soft px-3 py-3 font-ui text-sm text-danger">{{ error }}</p>
  </div>
</template>
