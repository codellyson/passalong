<!--
  Tokens are for the CLI and MCP servers. They are listed here because a credential you cannot see
  is a credential you cannot revoke — and a table, because "made" and "last used" are the two facts
  you compare across rows when deciding which of four laptops to cut off.
-->
<script setup lang="ts">
const { data, api, json, load } = useHub();

const tokens = computed(() => data.value.tokens);
const me = computed(() => data.value.me);

/** Shown once, on creation. The server stores a SHA-256, so there is no second chance. */
const fresh = ref<{ token: string } | null>(null);

async function mint() {
  const name = prompt("What is this token for? (e.g. laptop, work MacBook)");
  if (!name?.trim()) return;
  fresh.value = await api<{ token: string }>("/v1/tokens", json("POST", { name: name.trim() }));
  await load();
}

async function revoke(t: { id: string; name: string }) {
  if (!confirm(`Revoke "${t.name}"? Anything using it stops working immediately.`)) return;
  await api(`/v1/tokens/${t.id}`, { method: "DELETE" });
  await load();
}

const cell = "border-0 border-b border-b-line px-0 py-2.5 align-middle";
const head =
  "border-0 border-b border-b-line bg-transparent px-0 py-1.5 font-ui text-xs font-semibold tracking-wide text-muted uppercase";
</script>

<template>
  <div>
    <!-- The only moment in the product where the interface holds something the server cannot give
         back. It says so where the value is, not in a line underneath it. -->
    <div v-if="fresh" class="mb-4 rounded-2 border border-accent bg-accent-soft p-3">
      <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <b class="font-ui text-sm text-fg">New token · shown once</b>
        <span class="font-ui text-sm text-accent">copy it now, it is not stored</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <code
          class="min-w-0 flex-1 overflow-x-auto rounded-1 border border-line-strong bg-raised px-3 py-2 font-code text-sm whitespace-nowrap text-fg"
        >{{ fresh.token }}</code>
        <button
          class="cursor-pointer rounded-1 border border-accent bg-accent px-3 py-2 font-ui text-sm font-semibold whitespace-nowrap text-accent-fg transition-colors hover:bg-accent-hover"
          @click="copy(fresh.token, $event.currentTarget)"
        >
          copy token
        </button>
        <button
          class="cursor-pointer rounded-1 border border-line-strong px-3 py-2 font-ui text-sm font-medium text-fg transition-colors hover:border-muted hover:bg-surface"
          @click="fresh = null"
        >
          done
        </button>
      </div>
    </div>

    <table v-if="tokens.length" class="w-full">
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
            <button
              class="cursor-pointer rounded-1 border border-line-strong px-3 py-1.5 font-ui text-sm font-medium text-fg transition-colors hover:border-danger hover:bg-danger-soft hover:text-danger"
              @click="revoke(t)"
            >
              revoke
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="m-0 font-ui text-sm text-muted">None yet.</p>

    <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
      <button
        class="cursor-pointer rounded-1 border border-line-strong px-3 py-2 font-ui text-sm font-medium text-fg transition-colors hover:border-muted hover:bg-surface"
        @click="mint"
      >
        + new token
      </button>
      <span v-if="me" class="font-ui text-sm text-muted">
        {{ plural(tokens.length, "active token") }} ·
        {{ me.guides }} of {{ me.limit }} synced guides used on the free tier
      </span>
    </div>
  </div>
</template>
