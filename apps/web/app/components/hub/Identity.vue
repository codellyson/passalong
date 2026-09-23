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

/**
 * What is in the fields, kept here rather than in the DOM. The inputs used to be bound with
 * `:value`, which Vue writes back on every re-render — and the hub refetches the account whenever
 * the window regains focus, so clicking into the field and typing could lose the typing to a
 * refetch landing a moment later. The drafts follow the account only until you start typing, and
 * Cancel puts them back.
 */
const draft = reactive({ handle: "", name: "", email: "" });
function fromAccount() {
  draft.handle = me.value?.handle || "";
  draft.name = me.value?.name || "";
  draft.email = me.value?.email || "";
}
watch(
  me,
  () => {
    if (!dirty.value) fromAccount();
  },
  { immediate: true },
);
function cancel() {
  fromAccount();
  dirty.value = false;
  error.value = null;
}

/** The one error anyone actually hits belongs against the field that caused it. */
const onHandle = computed(() => Boolean(error.value && /handle|@|taken/i.test(error.value)));

const label = "block font-ui text-sm font-medium text-fg mb-2";
const box = "block w-full max-w-sm";

async function submit() {
  const body = { handle: draft.handle, name: draft.name, email: draft.email };
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
    >
      <div :class="box">
        <label :class="label" for="handle">How teammates mention you</label>
        <!-- The @ is not part of the value, and typing it again is the obvious mistake to make, so
             it sits in the field as furniture rather than in the placeholder. -->
        <div class="affix" :class="{ invalid: onHandle }">
          <span class="affix-mark" aria-hidden="true">@</span>
          <input
            id="handle"
            name="handle"
            v-model="draft.handle"
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
        <input id="name" v-model="draft.name" name="name" class="w-full" />
      </div>

      <div :class="box">
        <label :class="label" for="email">Email</label>
        <input id="email" v-model="draft.email" name="email" type="email" class="w-full" />
      </div>

      <!-- Nothing at rest: "Saved." before anyone has saved anything reads as a claim. -->
      <div v-if="!bare || dirty" class="flex flex-wrap gap-2">
        <button class="primary" type="submit">{{ bare ? "Save changes" : "Save" }}</button>
        <!-- On settings there is nothing to close, so cancel means "put back what was there". -->
        <button v-if="bare" class="btn" type="button" @click="cancel">Cancel</button>
        <button v-else-if="me?.handle" class="btn" type="button" @click="editing = false">
          Cancel
        </button>
      </div>
    </form>

    <p v-if="error && !onHandle" class="m-0 rounded-2 border border-danger bg-danger-soft px-3 py-3 font-ui text-sm text-danger">{{ error }}</p>

    <!-- The account's id, which the product otherwise never shows: the menu prints your name, or
         your @name, and falls back to the id only when you have neither — so somebody with a name
         can use Passalong for a year without ever seeing it. It is what a deployment's
         ADMIN_ACCOUNTS wants, and an id is an address rather than a secret (they are minted from a
         no-lookalike alphabet for reading aloud), so it is shown rather than hidden. -->
    <p v-if="bare && me?.account" class="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-line pt-4 font-ui text-sm text-muted">
      <span>Account id</span>
      <code class="font-code text-xs text-fg">{{ me.account }}</code>
      <button class="linkish" type="button" @click="copy(me.account, $event.currentTarget)">
        <span data-label>Copy</span>
      </button>
      <span class="basis-full text-xs">
        Yours to quote in a support question, and what a deployment names in
        <code class="font-code">ADMIN_ACCOUNTS</code>. Not a secret: what guards your account is
        your password and your tokens.
      </span>
    </p>

    <!-- Whether you run Passalong, and by which of the two routes — because they differ in what
         they permit, and the only signal until now was an Admin item quietly appearing in a menu. -->
    <p v-if="bare && me?.role === 'super'" class="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-line pt-4 font-ui text-sm text-muted">
      <span class="rounded-pill bg-accent-soft px-2 py-0.5 font-ui text-xs font-semibold tracking-wide text-accent uppercase">
        admin
      </span>
      <span class="min-w-0 grow">
        You run Passalong.
        {{
          me.can_make_supers
            ? "This deployment names your account, so you can also add and remove admins."
            : "Somebody made this account an admin; only an account the deployment names can add or remove one."
        }}
      </span>
      <NuxtLink class="shrink-0 font-medium" to="/admin">Open Admin</NuxtLink>
    </p>
  </div>
</template>
