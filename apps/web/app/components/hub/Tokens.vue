<!--
  Tokens are for the CLI and MCP servers. They are listed here because a credential you cannot see
  is a credential you cannot revoke — and a register, because "created" and "last used" are the two
  facts you compare across rows when deciding which of four laptops to cut off.
-->
<script setup lang="ts">
import { age } from "~/utils/projects";

const { data, api, json, refresh, loading, failed } = useHub();

const tokens = computed(() => data.value.tokens);

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

const trouble = ref("");

async function mint() {
  if (!name.value.trim() || busy.value) return;
  busy.value = true;
  trouble.value = "";
  try {
    fresh.value = await api<{ token: string }>(
      "/v1/tokens",
      json("POST", { name: name.value.trim() }),
    );
    naming.value = false;
    name.value = "";
    await refresh(hubKeys.tokens);
  } catch (e) {
    trouble.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function revoke(id: string) {
  trouble.value = "";
  try {
    await api(`/v1/tokens/${id}`, { method: "DELETE" });
    revoking.value = null;
    await refresh(hubKeys.tokens);
  } catch (e) {
    trouble.value = (e as Error).message;
  }
}
</script>

<template>
  <HubSettingsSection
    id="tokens"
    title="API tokens"
    blurb="For the command line and your own scripts. A token reaches your whole account, so give each place its own and revoke it there."
  >
    <template #action>
      <button class="btn sm" type="button" :aria-expanded="naming" @click="naming ? (naming = false) : ask()">
        <AppIcon name="plus" />New token
      </button>
    </template>

    <form v-if="naming" class="appears mt-3 flex flex-wrap items-end gap-3" @submit.prevent="mint">
      <div class="grow basis-64">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="token-name">What is this token for?</label>
        <input id="token-name" ref="field" v-model="name" class="w-full" placeholder="laptop, work MacBook, CI" required />
      </div>
      <button class="btn primary" type="submit" :disabled="busy || !name.trim()">
        {{ busy ? "Creating…" : "Create token" }}
      </button>
      <button class="btn" type="button" @click="naming = false">Cancel</button>
    </form>

    <!-- The only moment in the product where the interface holds something the server cannot give
         back. It says so where the value is, not in a line underneath it. -->
    <div v-if="fresh" class="mt-3 flex flex-col gap-2 rounded-3 border border-fg bg-raised p-4" role="status">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <b class="font-ui text-sm font-semibold text-fg">Your new token</b>
        <span class="font-ui text-sm font-medium text-fg">Copy it now. You won't be able to see it again.</span>
      </div>
      <!-- The well and its buttons share one height, the control height, so the row is one line. -->
      <div class="flex flex-wrap items-center gap-2">
        <code class="flex h-[var(--control-h)] min-w-0 flex-1 basis-64 items-center overflow-x-auto rounded-2 border border-line-strong bg-field px-3 font-code text-sm whitespace-nowrap text-fg">{{ fresh.token }}</code>
        <button class="btn primary" type="button" @click="copy(fresh.token, $event.currentTarget)">
          <AppIcon name="copy" /><span data-label>Copy token</span>
        </button>
        <button class="btn" type="button" @click="fresh = null">Done</button>
      </div>
    </div>

    <div v-if="failed.tokens" role="alert" class="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
      <p class="m-0 min-w-0 grow font-ui text-sm text-danger">Your tokens didn't load.</p>
      <button class="btn outline danger sm" type="button" @click="refresh(hubKeys.tokens)">Try again</button>
    </div>
    <HubSkeleton v-else-if="loading.tokens" variant="lines" :rows="2" label="Loading your tokens" />
    <div v-else-if="tokens.length" class="@container">
      <div aria-hidden="true" class="register-label hidden grid-cols-[minmax(0,1fr)_5rem_5rem_auto] gap-x-4 border-b border-line pt-3 pb-2 @2xl:grid">
        <span>Name</span><span class="text-right">Created</span><span class="text-right">Last used</span><span class="w-20" />
      </div>
      <ul class="m-0 list-none p-0">
        <li v-for="t in tokens" :key="t.id" class="border-b border-line py-3 last:border-b-0">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-sm @2xl:grid @2xl:gap-x-4 @2xl:grid-cols-[minmax(0,1fr)_5rem_5rem_auto]">
            <span class="min-w-0 grow basis-full font-medium break-words text-fg @2xl:basis-auto">{{ t.name }}</span>
            <span class="text-muted tabular-nums @2xl:text-right @2xl:text-fg"><span class="@2xl:hidden">Created </span>{{ age(t.created) }}</span>
            <span class="text-muted tabular-nums @2xl:text-right @2xl:text-fg">
              <span class="@2xl:hidden" aria-hidden="true">· </span><template v-if="t.last_used"><span class="@2xl:hidden">used </span>{{ age(t.last_used) }}</template><template v-else>Never used</template>
            </span>
            <span class="ml-auto flex justify-end @2xl:ml-0 @2xl:w-20">
              <button v-if="revoking !== t.id" class="btn sm" type="button" :aria-label="`Revoke ${t.name}`" @click="revoking = t.id">Revoke…</button>
            </span>
          </div>
          <!-- Two presses to break something, and the first says what breaks. -->
          <div v-if="revoking === t.id" class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2" role="alert">
            <p class="m-0 min-w-0 grow basis-64 font-ui text-sm">Revoke “{{ t.name }}”? Anything using it — the command line, a script, an agent — stops working at once.</p>
            <button class="btn sm outline danger" type="button" @click="revoke(t.id)">Revoke</button>
            <button class="btn sm" type="button" @click="revoking = null">Keep it</button>
          </div>
        </li>
      </ul>
    </div>
    <p v-else class="m-0 border-b border-line py-3 font-ui text-sm text-muted">
      No tokens yet. <code class="font-code text-xs">passalong login</code> makes its own; make one here for a script or CI.
    </p>
    <p v-if="trouble" class="m-0 mt-2 font-ui text-sm text-danger" role="alert">{{ trouble }}</p>
  </HubSettingsSection>
</template>
