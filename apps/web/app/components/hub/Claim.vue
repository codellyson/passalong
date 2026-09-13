<!--
  An account created by `passalong login` or an invite has no way to sign in yet.

  Built from the same parts as Identity.vue, which is the panel directly beside this one: labelled
  fields in a column, one measure, and the error against the field that caused it. It was a row of
  bare placeholder-only inputs, which made the two boxes different widths, left the form with no
  labels once anyone started typing, and put both of its refusals at the bottom of the card.
-->
<script setup lang="ts">
const { data, api, json, setToken, load } = useHub();
const error = ref<string | null>(null);

const needed = computed(() => Boolean(data.value.me) && !data.value.me?.has_password);

/**
 * Both refusals worth designing for are about the password: it is too short, or it is one of the
 * ones in a public breach corpus. Neither is worth a trip to the bottom of the card to read.
 */
const onPassword = computed(() => Boolean(error.value?.toLowerCase().includes("password")));

const label = "block font-ui text-sm font-medium text-fg mb-2";
const box = "block w-full max-w-sm";

async function submit(e: Event) {
  // Read first, then set state — the inputs are uncontrolled, as everywhere else in the hub.
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
      Right now you're only signed in on this browser. Add an email and password to sign in
      anywhere else, and to get back in if this browser forgets you.
    </p>

    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <div :class="box">
        <label :class="label" for="claim-email">Email</label>
        <input
          id="claim-email"
          name="email"
          type="email"
          class="w-full"
          required
          placeholder="ada@example.com"
          autocomplete="email"
          :value="data.me?.email || ''"
        />
      </div>

      <div :class="box">
        <label :class="label" for="claim-password">Password</label>
        <input
          id="claim-password"
          name="password"
          type="password"
          class="w-full"
          :class="onPassword ? 'border-danger' : ''"
          required
          minlength="8"
          autocomplete="new-password"
        />
        <!-- Said before the round trip rather than after it. The length is the browser's to
             enforce; the breach check is the server's and cannot be, so the field says it is
             coming — a password refused with no warning reads as the form being broken. -->
        <p v-if="onPassword" class="mt-2 mb-0 font-ui text-sm text-danger">{{ error }}.</p>
        <p v-else class="mt-2 mb-0 font-ui text-sm text-muted">
          At least 8 characters, and not one that appears in a public breach list.
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <button class="primary" type="submit">Save</button>
      </div>
    </form>

    <p
      v-if="error && !onPassword"
      class="m-0 mt-4 rounded-2 border border-danger bg-danger-soft px-3 py-3 font-ui text-sm text-danger"
    >
      {{ error }}
    </p>
  </section>
</template>
