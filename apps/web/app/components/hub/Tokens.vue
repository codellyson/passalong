<!--
  Tokens are for the CLI and MCP servers. They are listed here because a credential you cannot see
  is a credential you cannot revoke — and a table, because "made" and "last used" are the two facts
  you compare across rows when deciding which of four laptops to cut off.
-->
<script setup lang="ts">
const { data, api, json, refresh, loading } = useHub();

const tokens = computed(() => data.value.tokens);
const me = computed(() => data.value.me);

/** Shown once, on creation. The server stores a SHA-256, so there is no second chance. */
const fresh = ref<{ token: string } | null>(null);

/**
 * Naming a token used to be a `prompt()`. In a browser that does not support one — an embedded
 * webview, a preview pane, anything with dialogs blocked — it throws, the promise rejects
 * unhandled, and the button silently does nothing at all. A field on the page cannot fail that way.
 */
const naming = ref(false);
const name = ref("");
const field = ref<HTMLInputElement | null>(null);
const busy = ref(false);

/** Which token is being revoked. Destructive, so it asks in place rather than acting. */
const revoking = ref<string | null>(null);

async function ask() {
  naming.value = true;
  name.value = "";
  await nextTick();
  field.value?.focus();
}

async function mint() {
  if (!name.value.trim() || busy.value) return;
  busy.value = true;
  try {
    fresh.value = await api<{ token: string }>(
      "/v1/tokens",
      json("POST", { name: name.value.trim() }),
    );
    naming.value = false;
    name.value = "";
    await refresh(hubKeys.tokens);
  } finally {
    busy.value = false;
  }
}

async function revoke(id: string) {
  revoking.value = null;
  await api(`/v1/tokens/${id}`, { method: "DELETE" });
  await refresh(hubKeys.tokens);
}

const cell = "border-0 border-b border-b-line px-0 py-3 align-middle";
const head =
  "border-0 border-b border-b-line bg-transparent px-0 py-2 font-ui text-xs font-semibold tracking-wide text-muted uppercase";
</script>

<template>
  <div>
    <!-- The only moment in the product where the interface holds something the server cannot give
         back. It says so where the value is, not in a line underneath it. -->
    <div v-if="fresh" class="mb-4 rounded-2 border border-accent bg-accent-soft p-3">
      <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <b class="font-ui text-sm text-fg">Your new token</b>
        <span class="font-ui text-sm text-accent">Copy it now. You won't be able to see it again.</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <code
          class="min-w-0 flex-1 overflow-x-auto rounded-1 border border-line-strong bg-raised px-3 py-2 font-code text-sm whitespace-nowrap text-fg"
        >{{ fresh.token }}</code>
        <button
          class="btn primary sm"
          @click="copy(fresh.token, $event.currentTarget)"
        >
          <AppIcon name="copy" /><span data-label>Copy token</span>
        </button>
        <button
          class="btn sm"
          @click="fresh = null"
        >
          Done
        </button>
      </div>
    </div>

    <HubSkeleton v-if="loading.tokens" variant="lines" :rows="2" label="Loading your tokens" />
    <table v-else-if="tokens.length" class="w-full">
      <thead>
        <tr>
          <th :class="head">Name</th>
          <th :class="head">Made</th>
          <th :class="head">Last used</th>
          <th :class="head"><span class="sr-only">Revoke</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in tokens" :key="t.id">
          <td :class="cell" class="font-ui text-sm font-semibold text-fg">{{ t.name }}</td>
          <td :class="cell" class="font-ui text-sm text-muted">{{ rel(t.created) }}</td>
          <td :class="cell" class="font-ui text-sm text-muted">
            {{ t.last_used ? rel(t.last_used) : "never used" }}
          </td>
          <td :class="cell" class="text-right">
            <!-- Two taps to break something, and the second one says what breaks. -->
            <template v-if="revoking === t.id">
              <span class="mr-2 font-ui text-sm text-muted">Anything using it stops working.</span>
              <button class="btn outline danger sm" @click="revoke(t.id)">Revoke it</button>
              <button class="btn sm ml-2" @click="revoking = null">Cancel</button>
            </template>
            <button v-else class="btn destructive sm" @click="revoking = t.id">Revoke</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="m-0 font-ui text-sm text-muted">None yet.</p>

    <form v-if="naming" class="appears mt-3 flex flex-wrap items-end gap-3" @submit.prevent="mint">
      <div class="grow basis-64">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="token-name">
          What is this token for?
        </label>
        <input
          id="token-name"
          ref="field"
          v-model="name"
          class="w-full"
          placeholder="laptop, work MacBook, CI"
          required
        />
      </div>
      <button class="btn primary sm" type="submit" :disabled="busy || !name.trim()">
        {{ busy ? "Creating…" : "Create token" }}
      </button>
      <button class="btn sm" type="button" @click="naming = false">Cancel</button>
    </form>

    <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
      <button v-if="!naming" class="btn sm" @click="ask"><AppIcon name="plus" />New token</button>
      <span v-else />
      <!-- How many guides you're using lives with your plan in Settings, where someone who has hit
           the limit looks. Under API tokens it was a fact in the wrong room. -->
      <span v-if="me" class="font-ui text-sm text-muted">
        {{ plural(tokens.length, "active token") }}
      </span>
    </div>
  </div>
</template>
