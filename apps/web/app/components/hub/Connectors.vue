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

// The same two class strings the tokens table uses. Credentials on one page should not be
// presented two different ways: this section sat in nested cards while the one above it was a
// plain table, which is what made a finished page look half-built.
const cell = "border-0 border-b border-b-line px-0 py-3 align-middle";
const head =
  "border-0 border-b border-b-line bg-transparent px-0 py-2 font-ui text-xs font-semibold tracking-wide text-muted uppercase";

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
    <!-- Shown once, the same shape and wording as a new token: the interface is holding something
         the server cannot give back, and it says so where the value is. -->
    <div v-if="fresh" class="mb-4 rounded-2 border border-accent bg-accent-soft p-3">
      <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <b class="font-ui text-sm text-fg">
          New connector<template v-if="fresh.secret"> · secret shown once</template>
        </b>
        <span class="font-ui text-sm text-accent">paste these into the connector</span>
      </div>
      <div class="flex flex-col gap-2">
        <code
          class="overflow-x-auto rounded-1 border border-line-strong bg-raised px-3 py-2 font-code text-sm whitespace-nowrap text-fg"
        >{{ fresh.id }}</code>
        <code
          v-if="fresh.secret"
          class="overflow-x-auto rounded-1 border border-line-strong bg-raised px-3 py-2 font-code text-sm whitespace-nowrap text-fg"
        >{{ fresh.secret }}</code>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button class="btn primary sm" @click="copy(fresh.id, $event.currentTarget)">
          copy client id
        </button>
        <button class="btn sm" @click="fresh = null">done</button>
        <span v-if="!fresh.secret" class="font-ui text-sm text-muted">
          no secret — set the connector's token auth method to <code class="font-code">none</code>
        </span>
      </div>
    </div>

    <p v-if="trouble" class="mb-3 font-ui text-sm text-danger">{{ trouble }}</p>

    <table v-if="clients.length" class="w-full">
      <thead>
        <tr>
          <th :class="head">Name</th>
          <th :class="head">Client ID</th>
          <th :class="head">Holding</th>
          <th :class="head"><span class="sr-only">Remove</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="client in clients" :key="client.id">
          <td :class="cell" class="font-ui text-sm font-semibold text-fg">
            {{ client.name || "Unnamed" }}
          </td>
          <td :class="cell" class="pr-3 font-code text-xs break-all text-muted">{{ client.id }}</td>
          <td :class="cell" class="font-ui text-sm text-muted">
            {{ plural(client.grants, "grant") }}
          </td>
          <td :class="cell" class="text-right whitespace-nowrap">
            <!-- Two taps to break something, and the second one says what breaks. -->
            <template v-if="removing === client.id">
              <span class="mr-2 font-ui text-sm text-muted">It stops working now.</span>
              <button class="btn outline danger sm" @click="remove(client.id)">Remove it</button>
              <button class="btn sm ml-2" @click="removing = null">Cancel</button>
            </template>
            <button v-else class="btn destructive sm" @click="removing = client.id">remove</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="m-0 font-ui text-sm text-muted">None yet.</p>

    <form v-if="adding" class="appears mt-3 flex flex-wrap items-end gap-3" @submit.prevent="create">
      <div class="grow basis-48">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="connector-name">
          What is connecting?
        </label>
        <input id="connector-name" v-model="name" class="w-full" placeholder="ChatGPT" required>
      </div>
      <div class="grow basis-72">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="connector-redirect">
          Callback URL, copied from its form
        </label>
        <input id="connector-redirect" v-model="redirect" class="w-full" type="url" placeholder="https://…" required>
      </div>
      <button class="btn primary sm" type="submit" :disabled="busy || !redirect.trim()">
        {{ busy ? "Creating…" : "Create connector" }}
      </button>
      <button class="btn sm" type="button" @click="adding = false">Cancel</button>
      <label class="basis-full font-ui text-sm text-muted">
        <input v-model="confidential" type="checkbox" class="mr-2 w-auto">
        issue a client secret — leave off unless the connector demands one, since PKCE proves the
        exchange without a secret you have to keep in someone else's configuration
      </label>
    </form>

    <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
      <button v-if="!adding" class="btn sm" @click="adding = true">
        <AppIcon name="plus" />new connector
      </button>
      <span v-else />
      <NuxtLink to="/connect" class="font-ui text-sm">how to connect one</NuxtLink>
    </div>
  </div>
</template>
