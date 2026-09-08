<!--
  Where someone approves a connector.

  The authorization endpoint in apps/api validates the request and sends the browser here; this
  page is the part a person reads. It is a page rather than HTML from the Worker because approving
  a grant needs the session cookie the hub already has, and because a screen that decides what
  something may do with your account should look like the rest of your account.

  It states what the connector gets in the words of the product rather than a scope string, and it
  states what it does not get, which is the part people are actually deciding about.
-->
<script setup lang="ts">
usePage({ title: "Approve a connector", description: "Give a connector access.", noindex: true });

const route = useRoute();
const { api, json, signedIn, data } = useHub();

const params = computed(() => route.query as Record<string, string>);
const clientName = computed(
  () => params.value.client_name || params.value.client_id || "A connector",
);
const busy = ref(false);
const trouble = ref("");

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
    trouble.value = (e as Error).message;
    busy.value = false;
  }
}

/** Refusing is an answer the client is entitled to, so it goes back the way approval would. */
function deny() {
  const back = params.value.redirect_uri;
  if (!back) return navigateTo("/hub");
  const url = new URL(back);
  url.searchParams.set("error", "access_denied");
  if (params.value.state) url.searchParams.set("state", params.value.state);
  window.location.href = url.toString();
}
</script>

<template>
  <HubShell heading="Approve a connector">
    <template #sub>Something is asking to use Passalong as you.</template>

    <section v-if="signedIn" class="rounded-3 border border-line bg-raised p-6">
      <p class="eyebrow m-0 font-code text-xs tracking-widest text-muted uppercase">Asking</p>
      <h2 class="mt-1 mb-0 text-h2">{{ clientName }}</h2>
      <p class="mt-1 mb-0 font-code text-xs text-muted">{{ params.client_id }}</p>

      <div class="mt-5 rounded-2 border border-line bg-surface p-4">
        <p class="m-0 font-ui text-sm font-semibold text-fg">If you approve, it can</p>
        <ul class="mt-2 mb-0 flex list-none flex-col gap-1 p-0 font-ui text-sm text-muted">
          <li>· read your guides, your inbox and your board</li>
          <li>· publish guides and file bug reports as you</li>
          <li>· say whether something worked, which your teammates will see</li>
        </ul>
        <p class="mt-4 mb-0 font-ui text-sm font-semibold text-fg">It cannot</p>
        <ul class="mt-2 mb-0 flex list-none flex-col gap-1 p-0 font-ui text-sm text-muted">
          <li>· read or change your account, password, teams or API tokens</li>
          <li>· delete guides</li>
          <li>· do any of this after you remove it in Settings</li>
        </ul>
      </div>

      <p class="mt-4 mb-0 font-ui text-sm text-muted">
        You are approving this as
        <b class="text-fg">{{ data.me?.handle ? `@${data.me.handle}` : data.me?.email }}</b>. It
        will be sent back to <code class="font-code text-xs">{{ params.redirect_uri }}</code>.
      </p>

      <p v-if="trouble" class="mt-4 mb-0 font-ui text-sm text-danger">{{ trouble }}</p>

      <div class="mt-6 flex flex-wrap gap-2">
        <button type="button" class="btn primary" :disabled="busy" @click="approve">
          {{ busy ? "Approving…" : "Approve" }}
        </button>
        <button type="button" class="btn" :disabled="busy" @click="deny">Refuse</button>
      </div>

      <p class="mt-5 mb-0 font-ui text-xs text-muted">
        Approving does not hand over a password or an API token. It creates a credential for this
        connector alone, which you can take back at any time under
        <NuxtLink to="/hub/settings">Settings</NuxtLink>.
      </p>
    </section>
  </HubShell>
</template>
