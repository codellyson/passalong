<!--
  Where someone says yes to an app using Passalong for them.

  The authorization endpoint in apps/api validates the request and sends the browser here; this
  page is the part a person reads. It is a page rather than HTML from the Worker because approving
  needs the session cookie the hub already has, and because a screen that decides what something
  may do with your account should look like the rest of your account.

  Most people arrive from Claude or ChatGPT having pasted one address, so nothing here is protocol:
  no client id, no redirect URI, no PKCE. The name and the host come from the server
  (/v1/oauth/consent), never from this page's own query string — anyone can write a link with any
  name in it. The host is always shown, so an app calling itself "Passalong" still says where it
  will send you.
-->
<script setup lang="ts">
usePage({
  title: "Connect an app",
  description: "Let an app use Passalong for you.",
  noindex: true,
});

const route = useRoute();
const { api, json, signedIn, data } = useHub();

const params = computed(() => route.query as Record<string, string>);
const info = ref<{ name: string; host: string; registered: string } | null>(null);
const busy = ref(false);
const trouble = ref("");

/** A protocol failure, in words, with what to do next. */
const BROKEN =
  "This connection link is broken or out of date. Start connecting again from the app you came from.";
const MISMATCH =
  "This connection link doesn't match the app that started it, so it isn't safe to follow. Start connecting again from the app you came from.";

const app = computed(() => info.value?.name || info.value?.host || "This app");
const you = computed(
  () =>
    data.value.me?.name ||
    (data.value.me?.handle ? `@${data.value.me.handle}` : data.value.me?.email) ||
    "you",
);

async function lookUp() {
  trouble.value = "";
  const problem = params.value.problem;
  if (problem) {
    trouble.value = problem === "redirect_mismatch" ? MISMATCH : BROKEN;
    return;
  }
  if (!params.value.client_id || !params.value.code_challenge) {
    trouble.value = BROKEN;
    return;
  }
  if (!signedIn.value) return;
  try {
    const q = new URLSearchParams({
      client_id: params.value.client_id,
      redirect_uri: params.value.redirect_uri || "",
    });
    info.value = await api<{ name: string; host: string; registered: string }>(
      `/v1/oauth/consent?${q}`,
    );
  } catch (e) {
    const message = (e as Error).message;
    trouble.value = /redirect_uri/.test(message) ? MISMATCH : BROKEN;
  }
}
onMounted(() => watch(signedIn, lookUp, { immediate: true }));

/** Everything the authorize endpoint checked is already in the query; this only passes it back. */
async function approve() {
  busy.value = true;
  trouble.value = "";
  try {
    const answer = await api<{ redirect: string }>(
      "/v1/oauth/approve",
      json("POST", {
        client_id: params.value.client_id,
        redirect_uri: params.value.redirect_uri,
        state: params.value.state,
        code_challenge: params.value.code_challenge,
      }),
    );
    if (answer?.redirect) window.location.href = answer.redirect;
  } catch (e) {
    const message = (e as Error).message;
    trouble.value = /signed in|token cannot/.test(message)
      ? "Sign in to Passalong in this browser with your email and password, then press Allow again."
      : /unknown client|redirect_uri|PKCE/.test(message)
        ? BROKEN
        : "Something went wrong on our side. Press Allow again, or start connecting again from the app you came from.";
    busy.value = false;
  }
}

/** Refusing is an answer the app is entitled to, so it goes back the way approval would. */
function deny() {
  const back = params.value.redirect_uri;
  if (!back || !info.value) return navigateTo("/hub");
  const url = new URL(back);
  url.searchParams.set("error", "access_denied");
  if (params.value.state) url.searchParams.set("state", params.value.state);
  window.location.href = url.toString();
}
</script>

<template>
  <HubShell heading="Connect an app">
    <template #sub>Something wants to use Passalong for you.</template>

    <section v-if="trouble && !info" class="rounded-3 border border-line bg-raised p-6">
      <h2 class="m-0 text-h2">This link didn't work</h2>
      <p class="mt-2 mb-0 font-ui text-sm text-muted">{{ trouble }}</p>
      <p class="mt-4 mb-0 font-ui text-sm">
        <NuxtLink to="/connect">How connecting works</NuxtLink>
      </p>
    </section>

    <section v-else-if="signedIn && info" class="rounded-3 border border-line bg-raised p-6">
      <h2 class="m-0 text-h2">Let {{ app }} use your Passalong?</h2>
      <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ info.host }}</p>

      <p class="mt-5 mb-0 font-ui text-base text-fg">
        It will be able to read guides in your teams, send guides, and answer guides sent to you,
        as <b>{{ you }}</b>.
      </p>
      <p class="mt-2 mb-0 font-ui text-sm text-muted">
        It won't see your password or tokens, and you can disconnect it any time in
        <NuxtLink to="/hub/settings">Settings</NuxtLink>.
      </p>

      <p v-if="trouble" class="mt-4 mb-0 font-ui text-sm text-danger">{{ trouble }}</p>

      <div class="mt-6 flex flex-wrap items-center gap-2">
        <button type="button" class="btn primary" :disabled="busy" @click="approve">
          {{ busy ? "Allowing…" : "Allow" }}
        </button>
        <button type="button" class="btn" :disabled="busy" @click="deny">Cancel</button>
      </div>
      <p class="mt-3 mb-0 font-ui text-xs text-muted">You'll return to {{ info.host }}.</p>
    </section>
  </HubShell>
</template>
