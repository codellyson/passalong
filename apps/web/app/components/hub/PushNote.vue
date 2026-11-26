<!--
  The ask for push, where it pays: on Needs you, on the work board, and right after work is filed.
  Settings has the same switch, and nobody found it there (2026-11-26).

  It says why first: you hear when an agent takes your work, asks you something or hands it in,
  without keeping the tab open. One button turns it on, and the browser's own permission prompt
  comes only from that click, never on load, because a refused prompt cannot be asked again.

  Not shown where it cannot help: push already on for this device, a browser without push, a server
  without VAPID keys, or a browser set to block Passalong. "Not now" is kept per device, as push is.
  On an iPhone in a browser tab it says how to add the home-screen app instead of a button that
  cannot work.
-->
<script setup lang="ts">
const LATER_KEY = "passalong.push-note";

/** Where another button is the page's one primary (after filing: Open it), this one is tonal. */
const props = defineProps<{ quiet?: boolean }>();

const { data } = useHub();
const { state, supported, permission, iosTab, here, load, sense, turnOn } = usePush();

const later = ref(true);
const ready = ref(false);
const busy = ref(false);
const problem = ref("");
/** Kept on screen after the click, so the answer is said where the question was. */
const outcome = ref<"" | "on" | "refused">("");

onMounted(async () => {
  try {
    later.value = localStorage.getItem(LATER_KEY) === "later";
  } catch {
    later.value = false;
  }
  if (later.value) return;
  sense();
  if (!supported.value || permission.value === "denied") return;
  await load().catch(() => null);
  ready.value = true;
});

const show = computed(
  () =>
    Boolean(data.value.me) &&
    (outcome.value !== "" ||
      (ready.value &&
        !later.value &&
        Boolean(state.value?.available) &&
        !here.value &&
        permission.value !== "denied")),
);

function notNow() {
  later.value = true;
  outcome.value = "";
  try {
    localStorage.setItem(LATER_KEY, "later");
  } catch {}
}

async function turnOnHere() {
  busy.value = true;
  problem.value = "";
  try {
    await turnOn();
    outcome.value = permission.value === "granted" ? "on" : "refused";
  } catch (e) {
    problem.value = (e as Error).message || "Notifications could not be turned on here.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section v-if="show" aria-labelledby="push-note-h" aria-live="polite" class="settle flex flex-col gap-3 rounded-3 border border-line bg-raised px-4 py-4">
    <template v-if="outcome === 'on'">
      <p id="push-note-h" class="m-0 flex items-center gap-2 font-ui text-sm text-fg">
        <span class="size-1.5 rounded-pill bg-ok" aria-hidden="true" />
        <span><span class="font-medium">Notifications are on for this device.</span> Hide titles or turn them off in <NuxtLink to="/hub/settings">Settings</NuxtLink>.</span>
      </p>
    </template>
    <template v-else-if="outcome === 'refused'">
      <p id="push-note-h" class="m-0 font-ui text-sm text-muted">
        Your browser didn't allow notifications. To change that, allow them in the site settings (the
        icon beside the address), then turn them on in <NuxtLink to="/hub/settings">Settings</NuxtLink>.
      </p>
    </template>
    <template v-else>
      <div>
        <h2 id="push-note-h" class="m-0 font-ui text-base font-medium tracking-normal text-fg">Hear when your work moves</h2>
        <p class="m-0 mt-1 max-w-[40rem] font-ui text-sm text-muted">
          A notification the moment an agent takes your work, asks you something, or hands it in
          with proof. You don't have to keep this tab open.
        </p>
      </div>
      <p v-if="iosTab" class="m-0 max-w-[40rem] font-ui text-sm text-muted">
        On an iPhone or iPad, notifications need Passalong on your home screen: tap Share, then
        <b class="font-medium text-fg">Add to Home Screen</b>, and open it from there.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <button v-if="!iosTab" class="btn sm" :class="props.quiet ? 'tonal' : 'primary'" type="button" :disabled="busy" @click="turnOnHere">
          {{ busy ? "Turning on…" : "Turn on notifications" }}
        </button>
        <button class="btn sm" type="button" :disabled="busy" @click="notNow">Not now</button>
        <span v-if="!iosTab" class="font-ui text-xs text-muted">Your browser asks first.</span>
      </div>
      <p v-if="problem" class="m-0 font-ui text-sm text-danger" role="alert">{{ problem }}</p>
    </template>
  </section>
</template>
