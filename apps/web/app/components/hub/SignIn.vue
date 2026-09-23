<!--
  One screen, three modes. Each states its own purpose rather than making the reader infer it from
  which of three identical tabs happens to be pressed.

  The order of the doors below is deliberate and is explained in AGENTS.md: an account is not the
  product, a team is, so a self-serve signup with no team dead-ends in an empty hub. The invite
  paste is the one path that leads somewhere immediately, and the copy says outright that a fresh
  account will be empty until someone hands you something.
-->
<script setup lang="ts">
import { useMutation } from "@tanstack/vue-query";

defineProps<{ error: string | null; expired?: boolean }>();
const emit = defineEmits<{ token: [string]; signedIn: [] }>();

type Mode = "login" | "signup" | "forgot";

// `?forgot=1` is where an expired reset link sends someone: straight to asking for a new one.
const mode = ref<Mode>(useRoute().query.forgot ? "forgot" : "login");
const authError = ref<string | null>(null);
const notice = ref<string | null>(null);

const COPY: Record<Mode, { title: string; lede: string; submit: string; busy: string }> = {
  login: {
    busy: "Signing in…",
    title: "Sign in to Passalong",
    lede: "Pick up work sent to you, and see where the work you sent got to.",
    submit: "Sign in",
  },
  signup: {
    busy: "Creating your account…",
    title: "Create your account",
    lede: "Somewhere to keep the guides you send, and to receive the ones sent to you.",
    submit: "Create account",
  },
  forgot: {
    busy: "Sending…",
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

/** Pending while the request is out, so the button can say what it is doing and not be pressed twice. */
const { mutate: send, isPending: sending } = useMutation({
  mutationFn: async (o: { mode: Mode; body: { email: string; password?: string } }) => {
    const res = await fetch(PATHS[o.mode], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(o.body),
    });
    if (!res.ok) {
      const failed = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(failed.message || "That didn't work. Try again in a moment.");
    }
    return o.mode;
  },
  onSuccess: (sent) => {
    // Whether that address has an account is not something an unauthenticated caller gets to
    // learn, so the same sentence comes back either way.
    if (sent === "forgot") {
      notice.value = "If that address has an account, a reset link is on its way.";
    } else {
      emit("signedIn");
    }
  },
  onError: (err) => {
    authError.value = err.message;
  },
});

function submit(e: Event) {
  if (sending.value) return;
  authError.value = null;
  notice.value = null;
  const f = e.target as HTMLFormElement;
  const body: { email: string; password?: string } = { email: field(f, "email") };
  if (mode.value !== "forgot") body.password = field(f, "password");
  send({ mode: mode.value, body });
}

function useToken(e: Event) {
  const t = field(e.target as HTMLFormElement, "token");
  if (t) emit("token", t);
}

/**
 * The scratch account, for working on this screen and the hub behind it without making one.
 *
 * Shown only when the page is being served from localhost, and the route behind it refuses unless
 * `DEMO_LOGIN=1` is set as well — so this is a convenience on top of the gate, not the gate. It is
 * computed after mount because the server rendering this page has no window to ask, and a button
 * that flickers in on a real host would be worse than one that appears a moment late on a fake one.
 */
const local = ref(false);
onMounted(() => {
  const h = window.location.hostname;
  local.value = h === "localhost" || h === "127.0.0.1" || h === "[::1]";
});

const { mutate: demo, isPending: startingDemo } = useMutation({
  mutationFn: async () => {
    const res = await fetch("/v1/auth/demo", { method: "POST" });
    // 404 is the route saying it is not turned on, which is a different thing to say than "that
    // didn't work": the fix is a line in .dev.vars, and guessing at it wastes the next ten minutes.
    if (res.status === 404)
      throw new Error("Demo sign-in is off. Put DEMO_LOGIN=1 in apps/web/.dev.vars and restart.");
    if (!res.ok) throw new Error("Could not start a demo account.");
  },
  onSuccess: () => emit("signedIn"),
  onError: (err: Error) => {
    authError.value = err.message;
  },
});
</script>

<template>
  <section class="auth">
    <AppBrand />
    <h1>{{ expired ? "Signed out" : copyFor.title }}</h1>
    <p class="lede">{{ expired ? "Your session ended. Sign in and you are back where you were." : copyFor.lede }}</p>

    <!-- Arriving signed out and being signed out mid-session look identical otherwise, and the
         second one reads as the app having forgotten you for no reason. -->
    <p
      v-if="expired"
      class="mx-auto mb-5 max-w-sm rounded-2 border border-warn bg-warn-soft px-3 py-3 font-ui text-sm text-muted"
    >
      Nothing was lost — guides live on the server, not in this tab.
    </p>

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
        <button class="btn primary" type="submit" :disabled="sending" :aria-busy="sending">
          {{ sending ? copyFor.busy : copyFor.submit }}
        </button>

        <!-- The same treatments the hub uses: a refusal is a danger block, a "we sent it" is not
             a refusal and should not be red. Both were one unstyled line. -->
        <p
          v-if="authError"
          class="m-0 rounded-2 border border-danger bg-danger-soft px-3 py-3 font-ui text-sm text-danger"
        >
          {{ authError }}
        </p>
        <p
          v-if="notice"
          class="m-0 rounded-2 border border-ok bg-ok-soft px-3 py-3 font-ui text-sm text-ok"
        >
          {{ notice }}
        </p>
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

    <!-- Local only, and it says what it is: a throwaway account, not a tour of a filled-in one. -->
    <p v-if="local" class="auth-alt">
      <button class="linkish" type="button" :disabled="startingDemo" @click="demo()">
        {{ startingDemo ? "Making one…" : "Skip: use a scratch account" }}
      </button>
      <span class="muted"> — empty, local, and a new one each time</span>
    </p>

    <details class="more">
      <summary>Other ways in: an invite link, or the terminal tool</summary>
      <p class="muted">
        Been sent an invite? Opening the link makes your account and joins the team in one step.
      </p>
      <HubInvitePaste label="Invite link" />
      <p class="muted">
        Using the Passalong terminal tool? It can sign this page in for you, or paste the token it
        gives you here.
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
    <!-- Not the form's error: this is a failed load, which on this screen means a token that was
         refused. -->
    <p
      v-if="error"
      class="mx-auto mt-4 max-w-sm rounded-2 border border-danger bg-danger-soft px-3 py-3 font-ui text-sm text-danger"
    >
      {{ error }}
    </p>
  </section>
</template>
