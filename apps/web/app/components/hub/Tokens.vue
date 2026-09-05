<!--
  Tokens are for the CLI and MCP servers. They are listed here because a credential you cannot see
  is a credential you cannot revoke.
-->
<script setup lang="ts">
const { data, api, json, load } = useHub();

const tokens = computed(() => data.value.tokens);
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
</script>

<template>
  <section class="tokens">
    <div class="head">
      <h2>API tokens · {{ tokens.length }}</h2>
      <button class="btn" @click="mint">new token</button>
    </div>
    <p class="muted">
      For <code>passalong login {{ "<token>" }}</code> and MCP servers. Your password never goes
      near the CLI.
    </p>

    <div v-if="fresh" class="newtoken">
      <p><b>Copy it now — this is the only time it is shown.</b></p>
      <code>{{ fresh.token }}</code>
      <button class="btn" @click="copy(fresh.token, $event.target)">copy</button>
      <button class="btn" @click="fresh = null">done</button>
    </div>

    <ul v-if="tokens.length" class="members">
      <li v-for="t in tokens" :key="t.id">
        <b>{{ t.name }}</b>
        <span class="muted">
          · made {{ rel(t.created) }} ·
          {{ t.last_used ? `last used ${rel(t.last_used)}` : "never used" }}
        </span>
        <button class="btn danger" @click="revoke(t)">revoke</button>
      </li>
    </ul>
    <p v-else class="muted">None yet.</p>
  </section>
</template>
