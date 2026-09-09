<!--
  Setting a new password from an emailed link. Ported from apps/api/public/reset.js and the
  `renderReset()` shell around it.

  The code arrives in the URL fragment, which browsers never send to the server, so it stays out
  of request logs; the page reads it, uses it once, and scrubs the address bar. That also means
  the server cannot know whether the link carries a code — so the form renders either way and the
  "missing code" state only appears after mount. Branching on it during SSR would be a hydration
  mismatch, not a nicety.
-->
<script setup lang="ts">
usePage({
  title: "Reset your password",
  description: "Set a new Passalong password.",
  noindex: true,
});

const code = ref<string | null>(null);
const mounted = ref(false);
const error = ref<string | null>(null);
const busy = ref(false);

onMounted(() => {
  const hash = location.hash.slice(1);
  code.value = new URLSearchParams(hash).get("code") || hash || null;
  if (location.hash) history.replaceState(null, "", location.pathname);
  mounted.value = true;
});

async function submit(e: Event) {
  const password = field(e.target as HTMLFormElement, "password");
  busy.value = true;
  error.value = null;
  try {
    const res = await fetch("/v1/auth/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code.value, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message || res.statusText);
    }
    // The reset signs you in, so there is nowhere to send you but in.
    location.assign("/hub");
  } catch (err) {
    error.value = (err as Error).message;
    busy.value = false;
  }
}
</script>

<template>
  <main>
    <header>
      <AppBrand />
      <h1>Choose a new password</h1>
      <div class="meta"><span>the link works once, and for an hour</span></div>
    </header>

    <!-- The same block the hub and the sign-in screen use for a refusal. A bare red line at the
         product's least forgiving moment — a link that cannot work — read like a stray caption. -->
    <p
      v-if="mounted && !code"
      class="mb-5 rounded-2 border border-danger bg-danger-soft px-3 py-3 font-ui text-sm text-danger"
    >
      This link is missing its code. <a href="/hub">Ask for a new one from the sign-in page.</a>
    </p>

    <form v-else class="join" @submit.prevent="submit">
      <label>
        New password
        <input
          name="password"
          type="password"
          required
          placeholder="choose a new password"
          autocomplete="new-password"
        />
      </label>
      <button class="btn primary" type="submit" :disabled="busy">
        {{ busy ? "Saving…" : "Set password" }}
      </button>
      <p v-if="error" class="m-0 rounded-2 border border-danger bg-danger-soft px-3 py-3 font-ui text-sm text-danger">{{ error }}</p>
      <p class="muted">
        Every other session on this account is signed out when the password changes.
      </p>
    </form>
  </main>
</template>
