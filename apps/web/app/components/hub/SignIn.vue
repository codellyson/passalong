<!--
  One screen, three modes. Each states its own purpose rather than making the reader infer it from
  which of three identical tabs happens to be pressed.

  The order of the doors below is deliberate and is explained in AGENTS.md: an account is not the
  product, a team is, so a self-serve signup with no team dead-ends in an empty hub. The invite
  paste is the one path that leads somewhere immediately, and the copy says outright that a fresh
  account will be empty until someone hands you something.
-->
<script setup lang="ts">
defineProps<{ error: string | null }>();
const emit = defineEmits<{ token: [string]; signedIn: [] }>();

type Mode = "login" | "signup" | "forgot";

const mode = ref<Mode>("login");
const authError = ref<string | null>(null);
const notice = ref<string | null>(null);

const COPY: Record<Mode, { title: string; lede: string; submit: string }> = {
  login: {
    title: "Sign in to Passalong",
    lede: "Pick up work handed to you, and see what you handed over.",
    submit: "Sign in",
  },
  signup: {
    title: "Create your account",
    lede: "Somewhere to keep the guides you publish, and to receive the ones handed to you.",
    submit: "Create account",
  },
  forgot: {
    title: "Reset your password",
    lede: "We will email you a link. It works once, and for an hour.",
    submit: "Email me a link",
  },
};

const copyFor = computed(() => COPY[mode.value]);

function go(next: Mode) {
  mode.value = next;
  authError.value = null;
  notice.value = null;
}

const PATHS: Record<Mode, string> = {
  login: "/v1/auth/login",
  signup: "/v1/auth/signup",
  forgot: "/v1/auth/forgot",
};

async function submit(e: Event) {
  authError.value = null;
  notice.value = null;
  const f = e.target as HTMLFormElement;
  const body: { email: string; password?: string } = { email: field(f, "email") };
  if (mode.value !== "forgot") body.password = field(f, "password");
  try {
    const res = await fetch(PATHS[mode.value], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const failed = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(failed.message || res.statusText);
    }
    // Whether that address has an account is not something an unauthenticated caller gets to
    // learn, so the same sentence comes back either way.
    if (mode.value === "forgot") {
      notice.value = "If that address has an account, a reset link is on its way.";
    } else {
      emit("signedIn");
    }
  } catch (err) {
    authError.value = (err as Error).message;
  }
}

function useToken(e: Event) {
  const t = field(e.target as HTMLFormElement, "token");
  if (t) emit("token", t);
}
</script>

<template>
  <section class="auth">
    <AppBrand />
    <h1>{{ copyFor.title }}</h1>
    <p class="lede">{{ copyFor.lede }}</p>

    <div class="authcard">
      <form class="join" @submit.prevent="submit">
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            placeholder="ada@example.com"
            autocomplete="email"
          />
        </label>
        <label v-if="mode !== 'forgot'">
          Password
          <input
            name="password"
            type="password"
            required
            :placeholder="mode === 'signup' ? 'choose a password' : 'your password'"
            :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
          />
        </label>
        <button class="primary" type="submit">{{ copyFor.submit }}</button>
        <p v-if="authError" class="error">{{ authError }}</p>
        <p v-if="notice" class="muted">{{ notice }}</p>
      </form>
      <p class="auth-alt">
        <template v-if="mode === 'login'">
          New here?
          <button class="linkish" type="button" @click="go('signup')">Create an account</button>
          ·
          <button class="linkish" type="button" @click="go('forgot')">Forgot password</button>
        </template>
        <template v-else-if="mode === 'signup'">
          Already have an account?
          <button class="linkish" type="button" @click="go('login')">Sign in</button>
        </template>
        <template v-else>
          Remembered it?
          <button class="linkish" type="button" @click="go('login')">Sign in</button>
        </template>
      </p>
    </div>

    <details class="more">
      <summary>Other ways in — invite link, API token</summary>
      <p class="muted">
        Been sent an invite? Opening the link makes your account and joins the team in one step.
      </p>
      <HubInvitePaste label="invite link" />
      <p class="muted">
        Or paste an API token — the CLI prints one with <code>passalong login</code>, and
        <code>passalong hub</code> opens this page already signed in.
      </p>
      <form class="invite-paste" @submit.prevent="useToken">
        <input
          class="grow"
          name="token"
          type="password"
          placeholder="pa_…"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="btn" type="submit">Use token</button>
      </form>
    </details>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>
