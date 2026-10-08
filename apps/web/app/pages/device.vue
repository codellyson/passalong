<!--
  Where someone says yes to a terminal signing in as them.

  `passalong login` shows a short code and opens this page. The page shows the same code, because
  the check that matters is a person comparing the two: a link to this page can be sent by anyone,
  and only the person at the terminal knows which code it is waiting on. The label comes from the
  server, never from this page's query string.
-->
<script setup lang="ts">
import { useMutation, useQuery } from "@tanstack/vue-query";

usePage({
  title: "Sign in a terminal",
  description: "Approve a terminal signing in to Passalong as you.",
  noindex: true,
});

const route = useRoute();
const { api, json, signedIn, data } = useHub();

const code = computed(() => String(route.query.code ?? "").trim());

const {
  data: info,
  isPending: lookingUp,
  error: lookupFailed,
} = useQuery({
  queryKey: computed(() => ["device", code.value] as const),
  queryFn: () =>
    api<{ label: string; approved: boolean }>(`/v1/device/${encodeURIComponent(code.value)}`),
  enabled: computed(() => signedIn.value && Boolean(code.value)),
  retry: false,
});

const {
  mutate: approve,
  isPending: approving,
  isSuccess: approved,
  error: approveFailed,
} = useMutation({
  mutationFn: () => api("/v1/device/approve", json("POST", { code: code.value })),
});

const you = computed(() => meName(data.value.me) || data.value.me?.email || "you");
const gone = computed(() =>
  !code.value
    ? "This link has no code in it. Run `passalong login` in your terminal and open the page it gives you."
    : lookupFailed.value || approveFailed.value
      ? "This sign-in link has expired, or it was already used. Run `passalong login` again."
      : "",
);
</script>

<template>
  <HubShell heading="Sign in a terminal">
    <template #sub>A terminal is asking to sign in as you.</template>

    <section v-if="approved || info?.approved" class="rounded-3 bg-raised shadow-edge p-6">
      <h2 class="m-0 text-h2">Done</h2>
      <p class="mt-2 mb-0 font-ui text-sm text-muted">
        Go back to your terminal: it is signed in. You can close this page.
      </p>
    </section>

    <section v-else-if="gone" class="rounded-3 bg-raised shadow-edge p-6">
      <h2 class="m-0 text-h2">This link didn't work</h2>
      <p class="mt-2 mb-0 font-ui text-sm text-muted" role="alert">{{ gone }}</p>
    </section>

    <section v-else-if="info" class="rounded-3 bg-raised shadow-edge p-6">
      <h2 class="m-0 text-h2">Sign in {{ info.label }}?</h2>
      <p class="mt-4 mb-0 font-ui text-sm text-muted">
        Your terminal should be showing this code. If it isn't the same, don't approve it.
      </p>
      <p class="mt-2 mb-0 font-code text-2xl font-semibold tracking-wider text-fg">{{ code }}</p>
      <p class="mt-4 mb-0 font-ui text-base text-fg">
        It will be able to use Passalong as <b>{{ you }}</b>, until you remove its token in
        <NuxtLink to="/hub/settings">Settings</NuxtLink>.
      </p>
      <div class="mt-6 flex flex-wrap items-center gap-2">
        <button type="button" class="btn primary" :disabled="approving" @click="approve()">
          {{ approving ? "Approving…" : "Approve" }}
        </button>
        <NuxtLink class="btn" to="/hub">Not me</NuxtLink>
      </div>
    </section>

    <section
      v-else-if="lookingUp"
      class="flex flex-col gap-4 rounded-3 bg-raised shadow-edge p-6"
      role="status"
      aria-label="Checking the code"
    >
      <span class="block h-7 w-2/3 rounded-pill bg-line-strong" aria-hidden="true" />
      <span class="block h-3 w-full rounded-pill bg-line" aria-hidden="true" />
      <span class="sr-only">Checking the code…</span>
    </section>
  </HubShell>
</template>
