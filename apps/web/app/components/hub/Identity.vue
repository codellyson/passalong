<!--
  Settings → Profile: your @name, name and email as labelled rows, then the account id and, for
  whoever runs Passalong, how. Without a handle you cannot be addressed — `--to team/@you` has
  nothing to aim at — so the handle leads.
-->
<script setup lang="ts">
import type { Me } from "~/types/hub";

const { data, api, json, setMe } = useHub();
const error = ref<string | null>(null);
/** Save and Cancel only appear once something was typed: there is nothing to save before. */
const dirty = ref(false);
const saving = ref(false);
const saved = ref(false);

const me = computed(() => data.value.me);

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

async function submit() {
  const body = { handle: draft.handle, name: draft.name, email: draft.email };
  error.value = null;
  saving.value = true;
  try {
    const next = await api<Partial<Me>>("/v1/me", json("PATCH", body));
    if (me.value && next) setMe({ ...me.value, ...next });
    dirty.value = false;
    saved.value = true;
  } catch (err) {
    // "handle @x is taken" is the one error people actually hit, and it is useless at the bottom
    // of the page, so it reports next to the field. What was typed stays put.
    error.value = (err as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="me" class="flex flex-col">
    <form class="flex flex-col" @submit.prevent="submit" @input="dirty = true; saved = false">
      <HubSettingRow label="@name" for="handle" hint="How teammates mention you and send you work. Nobody else on Passalong can use the same one.">
        <!-- The @ is not part of the value, and typing it again is the obvious mistake to make, so
             it sits in the field as furniture rather than in the placeholder. -->
        <div class="affix max-w-sm" :class="{ invalid: onHandle }">
          <span class="affix-mark" aria-hidden="true">@</span>
          <input
            id="handle"
            v-model="draft.handle"
            name="handle"
            required
            spellcheck="false"
            pattern="[a-zA-Z0-9][a-zA-Z0-9-]{1,30}"
            title="2 to 31 letters, numbers or dashes"
            :aria-invalid="onHandle || undefined"
            aria-describedby="handle-note"
          />
        </div>
        <p v-if="onHandle" id="handle-note" class="m-0 text-danger" role="alert">{{ error }}</p>
        <p v-else id="handle-note" class="m-0 text-xs text-muted">2 to 31 letters, numbers or dashes.</p>
      </HubSettingRow>

      <HubSettingRow label="Name" for="name" hint="Shown beside your work instead of your @name.">
        <input id="name" v-model="draft.name" name="name" class="w-full max-w-sm" autocomplete="name" />
      </HubSettingRow>

      <HubSettingRow label="Email" for="email" hint="Where Passalong writes about work that needs you.">
        <input id="email" v-model="draft.email" name="email" type="email" class="w-full max-w-sm" autocomplete="email" />
      </HubSettingRow>

      <!-- Nothing at rest: "Saved." before anyone has saved anything reads as a claim. -->
      <div v-if="dirty || saved" class="flex flex-wrap items-center gap-2 border-b border-line py-4 md:pl-[15rem]">
        <template v-if="dirty">
          <button class="btn primary sm" type="submit" :disabled="saving">{{ saving ? "Saving…" : "Save changes" }}</button>
          <button class="btn sm" type="button" @click="cancel">Cancel</button>
        </template>
        <p v-else class="m-0 font-ui text-sm text-muted" role="status">Saved.</p>
      </div>
    </form>

    <p v-if="error && !onHandle" class="m-0 my-3 rounded-2 border border-danger bg-danger-soft px-3 py-3 font-ui text-sm text-danger" role="alert">{{ error }}</p>

    <!-- The account's id, which the product otherwise never shows: the menu prints your name, or
         your @name, and falls back to the id only when you have neither — so somebody with a name
         can use Passalong for a year without ever seeing it. It is what support asks for (and, for
         whoever runs Passalong, what ADMIN_ACCOUNTS wants), and an id is an address rather than a
         secret (they are minted from a no-lookalike alphabet for reading aloud), so it is shown. -->
    <HubSettingRow v-if="me.account" label="Account id" hint="Quote it if you contact support.">
      <div class="flex flex-wrap items-center gap-3">
        <code class="font-code text-xs text-fg">{{ me.account }}</code>
        <button class="btn sm" type="button" @click="copy(me.account, $event.currentTarget)">
          <AppIcon name="copy" /><span data-label>Copy</span>
        </button>
      </div>
      <!-- Said to the person reading it. The line used to name ADMIN_ACCOUNTS to everybody — a
           deployment setting only someone who runs Passalong can act on — so it is kept for them. -->
      <p class="m-0 text-xs text-muted">
        It isn't a secret — your password and tokens are what protect your account.
        <template v-if="me.role === 'super'">
          It's also what a deployment lists in <code class="font-code">ADMIN_ACCOUNTS</code>.
        </template>
      </p>
    </HubSettingRow>

    <!-- Whether you run Passalong, and by which of the two routes — because they differ in what
         they permit, and the only signal until now was an Admin item quietly appearing in a menu. -->
    <HubSettingRow v-if="me?.role === 'super'" label="Admin">
      <p class="m-0 text-fg">
        You run Passalong.
        {{
          me.can_make_supers
            ? "This deployment names your account, so you can also add and remove admins."
            : "Somebody made this account an admin; only an account the deployment names can add or remove one."
        }}
      </p>
      <NuxtLink class="btn sm self-start no-underline" to="/admin">Open Admin</NuxtLink>
    </HubSettingRow>
  </div>
</template>
