<!-- An account created by `passalong login` or an invite has no way to sign in yet. -->
<script setup lang="ts">
const { data, api, json, setToken, load } = useHub();
const error = ref<string | null>(null);

const needed = computed(() => Boolean(data.value.me) && !data.value.me?.has_password);

async function submit(e: Event) {
  const f = e.target as HTMLFormElement;
  const body = { email: field(f, "email"), password: field(f, "password") };
  error.value = null;
  try {
    await api("/v1/auth/password", json("POST", body));
    // The server rotated the session; a pasted token is no longer how this browser gets in.
    setToken(null);
    await load({ dropToken: true });
  } catch (err) {
    error.value = (err as Error).message;
  }
}
</script>

<template>
  <section v-if="needed" class="identity needed">
    <h2>Add a way to sign in</h2>
    <p class="muted">
      This account only exists as a token. Set an email and password and you can sign in from any
      browser — and recover it if the token is lost.
    </p>
    <form @submit.prevent="submit">
      <input
        name="email"
        type="email"
        required
        placeholder="email"
        :value="data.me?.email || ''"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="password"
        autocomplete="new-password"
      />
      <button class="primary" type="submit">Save</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>
