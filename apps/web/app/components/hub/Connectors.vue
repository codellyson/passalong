<!--
  Connectors: the apps that use Passalong for you, and how to add one.

  A token here reaches your whole account, which is the right shape for your own CLI and the wrong
  one for somebody else's product. A connector gets its own credential instead — reaching only the
  MCP endpoint, expiring, and revocable on its own.

  Adding one is pasting an address into the app: it registers itself and sends you to approve
  (RFC 7591), so that is what this leads with. The manual form stays, folded away, for an app that
  cannot register itself and asks for a client ID instead.

  Listed for the same reason tokens are: a credential you cannot see is one you cannot revoke.
-->
<script setup lang="ts">
interface Connector {
  id: string;
  name: string;
  host: string;
  registered: "manual" | "dynamic";
  created: string;
  approved: string | null;
  last_used: string | null;
  confidential: number;
  grants: number;
}

const { api, json } = useHub();

/** The address people paste. The same one /connect shows. */
const MCP_URL = "https://passalong.dev/v1/mcp";

const clients = ref<Connector[]>([]);
const name = ref("");
const redirect = ref("");
/**
 * The callback nobody could guess, for the manual form only. A client's own setup screen does not
 * always show the value to copy — so the one we know is offered here, next to the field that needs
 * it, and on /connect. Kept identical in both by test/connect-claude.test.mjs.
 */
const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
function useClaude() {
  redirect.value = CLAUDE_CALLBACK;
  if (!name.value.trim()) name.value = "Claude";
}
const confidential = ref(false);
const busy = ref(false);
const trouble = ref("");
/** Shown once. The server keeps a SHA-256 of the secret, so there is no second chance. */
const fresh = ref<{ id: string; secret: string } | null>(null);
const removing = ref<string | null>(null);

// The same two class strings the tokens table uses, so credentials on one page look one way.
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
    <div class="mb-4 font-ui text-sm text-muted">
      <!-- No app leads. Claude, ChatGPT, Cursor and the rest all connect the same way — paste an
           address, approve — so the instructions are written once, for whichever one you use. -->
      <p class="m-0">
        To connect an assistant, open its connector settings, add a custom connector and paste
        this address. It opens Passalong and asks you to approve.
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <code
          class="overflow-x-auto rounded-1 border border-line-strong bg-raised px-3 py-2 font-code text-sm whitespace-nowrap text-fg"
        >{{ MCP_URL }}</code>
        <button class="btn sm" @click="copy(MCP_URL, $event.currentTarget)">
          <AppIcon name="copy" /><span data-label>Copy</span>
        </button>
      </div>
      <p class="mt-2 mb-0">
        Works with any assistant that supports MCP connectors, such as Claude, ChatGPT and Cursor.
        If it asks how to sign in, choose OAuth.
      </p>
    </div>

    <!-- Shown once, the same shape and wording as a new token: the interface is holding something
         the server cannot give back, and it says so where the value is. -->
    <div v-if="fresh" class="mb-4 rounded-2 border border-accent bg-accent-soft p-3">
      <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <b class="font-ui text-sm text-fg">
          New connector<template v-if="fresh.secret"> · secret shown once</template>
        </b>
        <span class="font-ui text-sm text-accent">Paste these into the app</span>
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
          <AppIcon name="copy" /><span data-label>Copy client ID</span>
        </button>
        <button class="btn sm" @click="fresh = null">Done</button>
        <span v-if="!fresh.secret" class="font-ui text-sm text-muted">
          There's no secret. If the app asks for one, or asks how it authenticates, choose "none".
        </span>
      </div>
    </div>

    <p v-if="trouble" class="mb-3 font-ui text-sm text-danger">{{ trouble }}</p>

    <table v-if="clients.length" class="w-full">
      <thead>
        <tr>
          <th :class="head">App</th>
          <th :class="head">Approved</th>
          <th :class="head">Last used</th>
          <th :class="head"><span class="sr-only">Disconnect</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="client in clients" :key="client.id">
          <td :class="cell" class="pr-3">
            <span class="block font-ui text-sm font-semibold text-fg">
              {{ client.name || client.host || "Unnamed app" }}
            </span>
            <span class="block font-ui text-xs text-muted">{{ client.host }}</span>
          </td>
          <td :class="cell" class="pr-3 font-ui text-sm text-muted">
            {{ client.approved ? rel(client.approved) : "—" }}
          </td>
          <td :class="cell" class="pr-3 font-ui text-sm text-muted">
            {{ client.last_used ? rel(client.last_used) : "never" }}
          </td>
          <td :class="cell" class="text-right whitespace-nowrap">
            <!-- Two taps to break something, and the second one says what breaks. -->
            <template v-if="removing === client.id">
              <span class="mr-2 font-ui text-sm text-muted">It stops working now.</span>
              <button class="btn outline danger sm" @click="remove(client.id)">Disconnect</button>
              <button class="btn sm ml-2" @click="removing = null">Cancel</button>
            </template>
            <button v-else class="btn destructive sm" @click="removing = client.id">
              Disconnect
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="m-0 font-ui text-sm text-muted">Nothing connected yet.</p>

    <details class="mt-4">
      <summary class="cursor-pointer font-ui text-sm text-fg">Set up a connector manually</summary>
      <p class="mt-2 mb-0 font-ui text-sm text-muted">
        Only for an app that asks you for a client ID instead of taking the address above.
      </p>
      <form class="mt-3 flex flex-wrap items-end gap-3" @submit.prevent="create">
        <div class="grow basis-48">
          <label class="mb-2 block font-ui text-sm font-medium text-fg" for="connector-name">
            What is connecting?
          </label>
          <input id="connector-name" v-model="name" class="w-full" placeholder="ChatGPT" required>
        </div>
        <div class="grow basis-72">
          <label class="mb-2 block font-ui text-sm font-medium text-fg" for="connector-redirect">
            Its callback address, copied from its setup screen
          </label>
          <input id="connector-redirect" v-model="redirect" class="w-full" type="url" placeholder="https://…" required>
          <p class="mt-2 mb-0 font-ui text-xs text-muted">
            Claude's is <code>https://claude.ai/api/mcp/auth_callback</code>
            <button type="button" class="btn sm ml-1" @click="useClaude">Use it</button>
          </p>
        </div>
        <button class="btn primary sm" type="submit" :disabled="busy || !redirect.trim()">
          {{ busy ? "Creating…" : "Create connector" }}
        </button>
        <label class="basis-full font-ui text-sm text-muted">
          <input v-model="confidential" type="checkbox" class="mr-2 w-auto">
          This app keeps a secret (most don't)
        </label>
      </form>
    </details>

    <div class="mt-3 flex justify-end">
      <NuxtLink to="/connect" class="font-ui text-sm">More about connecting apps</NuxtLink>
    </div>
  </div>
</template>
