<!--
  An account created by `passalong login` or an invite has no way to sign in yet.

  Built from the same parts as Identity.vue, which is the panel directly beside this one: labelled
  fields in a column, one measure, and the error against the field that caused it. It was a row of
  bare placeholder-only inputs, which made the two boxes different widths, left the form with no
  labels once anyone started typing, and put both of its refusals at the bottom of the card.
-->
<script setup lang="ts">
/** `bare` on Settings: just the form, inside a section that already says what it is for. */
defineProps<{ bare?: boolean }>();

const { data, api, json, setToken, load } = useHub();
const error = ref<string | null>(null);

const needed = computed(() => Boolean(data.value.me) && !data.value.me?.has_password);
/**
 * On the board this is a notice first and a form only when asked for: the same one-line band
 * Settings shows, so the state reads one way wherever it appears. It used to be the whole form in
 * an accent-ringed panel, half the page, above the work the page is for.
 */
const open = ref(false);
/**
 * The email is kept here, not bound with `:value`: Vue writes `:value` back on every re-render, and
 * the hub refetches the account when the window regains focus, which could wipe what was typed.
 */
const email = ref("");
const typed = ref(false);
watch(
  () => data.value.me?.email,
  (v) => {
    if (!typed.value) email.value = v || "";
  },
  { immediate: true },
);

/**
 * Both refusals worth designing for are about the password: it is too short, or it is one of the
 * ones in a public breach corpus. Neither is worth a trip to the bottom of the card to read.
 */
const onPassword = computed(() => Boolean(error.value?.toLowerCase().includes("password")));
/**
 * "Another account already uses that email" is about the email, so it goes under the email field.
 * It used to land in a full-width box below the buttons, away from the one field it was about. The
 * password is checked first, so a message naming the password never lands here.
 */
const onEmail = computed(() =>
  Boolean(!onPassword.value && error.value && /email/i.test(error.value)),
);

const label = "block font-ui text-sm font-medium text-fg mb-2";
const box = "block w-full max-w-sm";

async function submit(e: Event) {
  // Read first, then set state — the inputs are uncontrolled, as everywhere else in the hub.
  const f = e.target as HTMLFormElement;
  const body = { email: email.value, password: field(f, "password") };
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
  <section v-if="needed" :class="bare ? '' : '-mt-8 mb-8 flex flex-col gap-4'">
    <!-- A row in the shell's band of standing notices, not a card of its own: this is true until
         somebody sets a password, which is not today, and a filled card said otherwise every visit.
         Same shape as the notices in Shell.vue — see the note there. -->
    <p
      v-if="!bare"
      class="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line py-2.5 font-ui text-sm text-muted"
    >
      <span class="mt-1.5 size-1.5 shrink-0 rounded-pill bg-warn" aria-hidden="true" />
      <span class="min-w-0 grow">
        <b class="text-fg">You're only signed in on this browser.</b> Add a password to sign in
        anywhere else, and to get back in if this browser forgets you.
      </span>
      <button v-if="!open" class="linkish shrink-0 font-medium" type="button" @click="open = true">
        Add a password
      </button>
    </p>

    <form v-if="bare || open" class="appears flex flex-col gap-4" @submit.prevent="submit">
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
          v-model="email"
          :class="onEmail ? 'border-danger' : ''"
          @input="typed = true"
        />
        <p v-if="onEmail" class="mt-2 mb-0 font-ui text-sm text-danger">{{ error }}</p>
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
        <p v-if="onPassword" class="mt-2 mb-0 font-ui text-sm text-danger">{{ error }}</p>
        <p v-else class="mt-2 mb-0 font-ui text-sm text-muted">
          At least 8 characters, and not one that appears in a public breach list.
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <button class="primary" type="submit">Save</button>
        <!-- Opened from the notice, so it can be put away again without saving anything. -->
        <button v-if="!bare" class="btn" type="button" @click="open = false; error = null">
          Cancel
        </button>
      </div>
    </form>

    <p
      v-if="error && !onPassword && !onEmail"
      class="m-0 mt-4 rounded-2 border border-danger bg-danger-soft px-3 py-3 font-ui text-sm text-danger"
    >
      {{ error }}
    </p>
  </section>
</template>
