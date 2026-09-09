<!--
  Connectors: what a hosted assistant uses instead of a token you pasted into it.

  A token here reaches your whole account, which is the right shape for your own CLI and the wrong
  one for a form in somebody else's product. A connector gets its own credential instead — scoped
  to the MCP endpoint, expiring, and revocable on its own — and this is where you create one and
  take it back.

  Listed for the same reason tokens are: a credential you cannot see is one you cannot revoke.
-->
<script setup lang="ts">
interface Connector {
  id: string;
  name: string;
  redirect_uri: string;
  created: string;
  confidential: number;
  grants: number;
}

const { api, json } = useHub();

const clients = ref<Connector[]>([]);
const adding = ref(false);
const name = ref("");
const redirect = ref("");
const confidential = ref(false);
const busy = ref(false);
const trouble = ref("");
/** Shown once. The server keeps a SHA-256 of the secret, so there is no second chance. */
const fresh = ref<{ id: string; secret: string } | null>(null);
const removing = ref<string | null>(null);

async function load() {
  try {
    const answer = await api<{ clients: Connector[] }>("/v1/oauth/clients");
    clients.value = answer?.clients || [];
  } catch (e) {
    trouble.value = (e as Error).message;
  }
}
onMounted(load);

async function create() {
  if (busy.value) return;
  busy.value = true;
  trouble.value = "";
  try {
    const answer = await api<{ client: { id: string; secret: string } }>(
      "/v1/oauth/clients",
      json("POST", {
        name: name.value.trim(),
        redirect_uri: redirect.value.trim(),
        confidential: confidential.value,
      }),
    );
    if (answer?.client) fresh.value = answer.client;
    adding.value = false;
    name.value = "";
    redirect.value = "";
    confidential.value = false;
    await load();
  } catch (e) {
    trouble.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function remove(id: string) {
  try {
    await api(`/v1/oauth/clients/${id}`, { method: "DELETE" });
    removing.value = null;
    await load();
  } catch (e) {
    trouble.value = (e as Error).message;
  }
}
</script>

<template>
  <div>
    <p class="mt-0 mb-4 font-ui text-sm text-muted">
      It reaches the MCP endpoint and nothing else, and removing it here cuts it off immediately.
      <NuxtLink to="/connect">How to connect one</NuxtLink>.
    </p>

    <!-- Shown once, on creation, like a token. -->
    <div v-if="fresh" class="mb-4 rounded-3 border border-ok bg-raised p-4">
      <p class="m-0 font-ui text-sm font-semibold text-fg">Paste these into the connector</p>
      <dl class="mt-3 mb-0 flex flex-col gap-2">
        <div>
          <dt class="font-ui text-xs tracking-wide text-muted uppercase">Client ID</dt>
          <dd class="m-0 mt-1 rounded-2 border border-line bg-surface px-3 py-2 font-code text-sm break-all select-all">
            {{ fresh.id }}
          </dd>
        </div>
        <div v-if="fresh.secret">
          <dt class="font-ui text-xs tracking-wide text-muted uppercase">
            Client secret — shown once
          </dt>
          <dd class="m-0 mt-1 rounded-2 border border-line bg-surface px-3 py-2 font-code text-sm break-all select-all">
            {{ fresh.secret }}
          </dd>
        </div>
      </dl>
      <p class="mt-3 mb-0 font-ui text-xs text-muted">
        <template v-if="fresh.secret">
          There is no route that shows the secret again. Lose it and remove the connector, then make
          another.
        </template>
        <template v-else>
          No secret: this is a public client, and the proof is PKCE. Set the connector's token
          endpoint auth method to <code>none</code>.
        </template>
      </p>
      <button type="button" class="btn sm mt-3" @click="fresh = null">Done</button>
    </div>

    <p v-if="trouble" class="mb-3 font-ui text-sm text-danger">{{ trouble }}</p>

    <ul v-if="clients.length" class="m-0 flex list-none flex-col gap-2 p-0">
      <li
        v-for="client in clients"
        :key="client.id"
        class="rounded-3 border border-line bg-raised px-4 py-3"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <b class="font-ui text-sm font-semibold text-fg">{{ client.name || "Unnamed" }}</b>
          <span class="font-code text-xs text-muted">
            {{ client.grants }} grant{{ client.grants === 1 ? "" : "s" }}
          </span>
          <span v-if="client.confidential" class="font-code text-xs text-muted">· has a secret</span>
          <span class="ml-auto flex flex-wrap items-center gap-2">
            <template v-if="removing === client.id">
              <span class="font-ui text-sm text-muted">Cut it off now?</span>
              <button type="button" class="btn sm destructive" @click="remove(client.id)">
                Remove
              </button>
              <button type="button" class="btn sm" @click="removing = null">Keep</button>
            </template>
            <button v-else type="button" class="btn sm" @click="removing = client.id">
              Remove
            </button>
          </span>
        </div>
        <!-- The two long opaque strings, each on its own line and each allowed to break, because
             at no column width do they wrap well beside anything else. -->
        <dl class="mt-2 mb-0 grid gap-x-3 gap-y-1 sm:grid-cols-[6rem_minmax(0,1fr)]">
          <dt class="font-ui text-xs tracking-wide text-muted uppercase">Client ID</dt>
          <dd class="m-0 font-code text-xs break-all text-fg">{{ client.id }}</dd>
          <dt class="font-ui text-xs tracking-wide text-muted uppercase">Callback</dt>
          <dd class="m-0 font-code text-xs break-all text-muted">{{ client.redirect_uri }}</dd>
        </dl>
      </li>
    </ul>
    <p v-else class="font-ui text-sm text-muted">No connectors yet.</p>

    <form v-if="adding" class="mt-4 rounded-3 border border-line bg-raised p-4" @submit.prevent="create">
      <label class="flex flex-col gap-1.5">
        <span class="font-ui text-xs font-semibold tracking-wide text-muted uppercase">Name</span>
        <input v-model="name" type="text" placeholder="ChatGPT" required>
      </label>
      <label class="mt-3 flex flex-col gap-1.5">
        <span class="font-ui text-xs font-semibold tracking-wide text-muted uppercase">
          Callback URL
        </span>
        <input v-model="redirect" type="url" placeholder="https://…" required>
        <span class="font-ui text-xs text-muted">
          Copy it from the connector's own form. It must match exactly — no wildcards, because a
          redirect that accepts more than one address is how an authorization code walks off.
        </span>
      </label>
      <label class="mt-3 flex items-start gap-2 font-ui text-sm text-muted">
        <input v-model="confidential" type="checkbox" class="mt-1 w-auto">
        <span>
          Issue a client secret. Leave this off unless the connector demands one — PKCE proves the
          exchange without a secret you have to keep in someone else's configuration.
        </span>
      </label>
      <div class="mt-4 flex gap-2">
        <button type="submit" class="btn primary" :disabled="busy">
          {{ busy ? "Creating…" : "Create connector" }}
        </button>
        <button type="button" class="btn" @click="adding = false">Cancel</button>
      </div>
    </form>
    <button v-else type="button" class="btn mt-4" @click="adding = true">Add a connector</button>
  </div>
</template>
