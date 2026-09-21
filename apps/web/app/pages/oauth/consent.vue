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
import { useMutation, useQuery } from "@tanstack/vue-query";

usePage({
  title: "Connect an app",
  description: "Let an app use Passalong for you.",
  noindex: true,
});

const route = useRoute();
const { api, json, signedIn, data } = useHub();

const params = computed(() => route.query as Record<string, string>);

/** A protocol failure, in words, with what to do next. */
const BROKEN =
  "This connection link is broken or out of date. Start connecting again from the app you came from.";
const MISMATCH =
  "This connection link doesn't match the app that started it, so it isn't safe to follow. Start connecting again from the app you came from.";

/** What is wrong with the link itself, before anything is asked of the server. */
const linkProblem = computed(() => {
  const problem = params.value.problem;
  if (problem) return problem === "redirect_mismatch" ? MISMATCH : BROKEN;
  if (!params.value.client_id || !params.value.code_challenge) return BROKEN;
  return "";
});

const {
  data: info,
  isPending: lookingUp,
  error: lookupFailed,
} = useQuery({
  queryKey: computed(
    () => ["consent", params.value.client_id, params.value.redirect_uri || ""] as const,
  ),
  queryFn: () =>
    api<{ name: string; host: string; registered: string }>(
      `/v1/oauth/consent?${new URLSearchParams({
        client_id: params.value.client_id || "",
        redirect_uri: params.value.redirect_uri || "",
      })}`,
    ),
  enabled: computed(() => signedIn.value && !linkProblem.value),
  retry: false,
});

const {
  mutate: approve,
  isPending: approving,
  error: approveFailed,
} = useMutation({
  /** Everything the authorize endpoint checked is already in the query; this only passes it back. */
  mutationFn: () =>
    api<{ redirect: string }>(
      "/v1/oauth/approve",
      json("POST", {
        client_id: params.value.client_id,
        redirect_uri: params.value.redirect_uri,
        state: params.value.state,
        code_challenge: params.value.code_challenge,
      }),
    ),
  onSuccess: (answer) => {
    if (answer?.redirect) window.location.href = answer.redirect;
  },
});

const trouble = computed(() => {
  if (linkProblem.value) return linkProblem.value;
  if (lookupFailed.value)
    return /redirect_uri/.test(lookupFailed.value.message) ? MISMATCH : BROKEN;
  if (approveFailed.value) {
    const message = approveFailed.value.message;
    return /signed in|token cannot/.test(message)
      ? "Sign in to Passalong in this browser with your email and password, then press Allow again."
      : /unknown client|redirect_uri|PKCE/.test(message)
        ? BROKEN
        : "Something went wrong on our side. Press Allow again, or start connecting again from the app you came from.";
  }
  return "";
});

const app = computed(() => info.value?.name || info.value?.host || "This app");
const you = computed(() => meName(data.value.me) || data.value.me?.email || "you");

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

    <section v-else-if="info" class="rounded-3 border border-line bg-raised p-6">
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

      <p v-if="trouble" class="mt-4 mb-0 font-ui text-sm text-danger" role="alert">{{ trouble }}</p>

      <div class="mt-6 flex flex-wrap items-center gap-2">
        <button type="button" class="btn primary" :disabled="approving" @click="approve()">
          {{ approving ? "Allowing…" : "Allow" }}
        </button>
        <button type="button" class="btn" :disabled="approving" @click="deny">Cancel</button>
      </div>
      <p class="mt-3 mb-0 font-ui text-xs text-muted">You'll return to {{ info.host }}.</p>
    </section>

    <!-- The app's name and host are one short request away. Drawing the card's shape keeps Allow
         from appearing under the reader's pointer a moment after they started reading. -->
    <section
      v-else-if="lookingUp"
      class="flex flex-col gap-4 rounded-3 border border-line bg-raised p-6"
      role="status"
      aria-label="Checking the app"
    >
      <span class="block h-7 w-2/3 rounded-pill bg-line-strong" aria-hidden="true" />
      <span class="block h-3 w-32 rounded-pill bg-line" aria-hidden="true" />
      <span class="mt-2 block h-3 w-full rounded-pill bg-line" aria-hidden="true" />
      <span class="block h-3 w-4/5 rounded-pill bg-line" aria-hidden="true" />
      <span class="sr-only">Checking the app…</span>
    </section>
  </HubShell>
</template>
