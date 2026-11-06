<!--
  Stopping product news from the link at the foot of one (apps/api/src/announcements.ts). The token
  is in the URL fragment, which browsers never send, so no log holds it, as with a choice link.

  It asks once before it acts. Mail scanners open every link in a message, and a link that
  unsubscribed by being opened would turn news off for people who never clicked it. Mail providers'
  own Unsubscribe buttons skip this page: they POST the one-click address in the mail's headers.
-->
<script setup lang="ts">
usePage({
  title: "Stop product news · Passalong",
  description: "Stop emails about what's new in Passalong.",
  noindex: true,
});
useHead({ bodyAttrs: { class: "hub-app" } });

const token = ref("");
const mounted = ref(false);
const busy = ref(false);
const done = ref(false);
const problem = ref("");

onMounted(() => {
  const p = new URLSearchParams(location.hash.slice(1));
  token.value = p.get("t") || "";
  if (location.hash) history.replaceState(null, "", location.pathname);
  mounted.value = true;
});

async function stop() {
  busy.value = true;
  problem.value = "";
  try {
    const res = await fetch("/v1/news/off", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: token.value }),
    });
    const out = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) throw new Error(out.message || res.statusText);
    done.value = true;
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main>
    <header>
      <AppBrand />
      <h1>{{ done ? "You won't get product news" : "Stop product news" }}</h1>
    </header>

    <p v-if="done" role="status" class="max-w-[65ch] font-ui text-sm">
      Done. Passalong won't email you about new features any more. Mail about your work still
      comes as before. You can turn product news back on in
      <a href="/hub/settings#news">Settings</a>.
    </p>

    <template v-else-if="mounted && token">
      <p class="mb-4 max-w-[65ch] font-ui text-sm">
        Stop the occasional email about what's new in Passalong? Mail about your work isn't
        affected.
      </p>
      <button class="btn primary" type="button" :disabled="busy" @click="stop">
        {{ busy ? "Stopping…" : "Stop product news" }}
      </button>
    </template>

    <p
      v-else-if="mounted"
      class="mb-5 max-w-[65ch] rounded-2 border border-line bg-raised px-3 py-3 font-ui text-sm"
    >
      This link is incomplete. It may have been cut off when it was copied. You can turn product
      news off in <a href="/hub/settings#news">Settings</a> instead.
    </p>

    <p v-if="problem" role="alert" class="mt-4 font-ui text-sm text-danger">{{ problem }}</p>
  </main>
</template>
