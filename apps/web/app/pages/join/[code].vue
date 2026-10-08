<!--
  Where an invite link lands.

  The person clicking this is often someone who has never used Passalong — a tester, a designer,
  someone handed a link in chat — so the only thing asked is their name. The @name teammates send
  work to is suggested from it and can be changed; it used to be a required field in a strict
  format, explained with a CLI flag, and it was where people got stuck.

  Email and password are asked for here, because an account is a thing you sign in to. They used to
  be deferred — name only, and a band on the hub asking for a password afterwards — which made the
  first thing a new teammate read a chore about account recovery, before they had anything worth
  recovering. Someone arriving with an account that already has a password is not asked again.

  The terminal tool is one link away for people who want it, not a four-command block competing
  with the button.
-->
<script setup lang="ts">
const route = useRoute();
const code = computed(() => String(route.params.code));

const { data: invite } = await useFetch(`/api/invite/${encodeURIComponent(code.value)}`);
// `statusMessage: "invite"` is what error.vue reads to say "ask for a fresh invite" rather than
// talking about guide links.
if (!invite.value) throw createError({ statusCode: 404, statusMessage: "invite" });

const team = computed(() => invite.value?.team ?? "");

usePage({
  title: `Join ${team.value}`,
  description: `Invitation to the ${team.value} team on Passalong.`,
  noindex: true,
});

const KEY = "passalong.token";
const token = {
  get() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(t: string) {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      // A browser with storage blocked can still join; it just cannot stay signed in.
    }
  },
};

interface Me {
  id: string;
  handle: string;
  name: string;
  email: string;
  /** Already signed in with a password: they are joining a team, not making an account. */
  has_password?: boolean;
}

async function call<T>(
  path: string,
  { method = "GET", body, auth = true }: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = `Bearer ${token.get()}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const failed = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(failed.message || "That didn't work. Try again in a moment.");
  }
  return res.json() as Promise<T>;
}

const me = ref<Me | null>(null);
const name = ref("");
const handle = ref("");
const email = ref("");
const password = ref("");
/** Someone who already has a password is joining a team, not making an account. */
const needsPassword = computed(() => !me.value?.has_password);
/** Once someone edits the @name themselves, typing their name stops overwriting it. */
const handleTouched = ref(false);
const editingHandle = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

watch(name, (typed) => {
  if (!handleTouched.value) handle.value = handleFrom(typed);
});

// Someone already signed in gets their details filled in rather than an empty form.
onMounted(() => {
  if (!token.get()) return;
  call<Me>("/v1/me")
    .then((who) => {
      me.value = who;
      if (who.name) name.value = who.name;
      if (who.handle) {
        handle.value = who.handle;
        handleTouched.value = true;
      }
      if (who.email) email.value = who.email;
    })
    .catch(() => {});
});

// An account is minted once and kept, so a rejected @name is retried against the same account
// rather than leaving a trail of empty ones behind.
async function account(): Promise<Me> {
  if (me.value) return me.value;
  if (token.get()) {
    try {
      return await call<Me>("/v1/me");
    } catch {
      // Stale or foreign token: start fresh rather than dead-end the invite.
    }
  }
  const minted = await call<{ token: string }>("/v1/accounts", {
    method: "POST",
    auth: false,
    body: { invite: code.value },
  });
  token.set(minted.token);
  return call<Me>("/v1/me");
}

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    const who = await account();
    me.value = who;
    const patch: Record<string, string> = {};
    if (handle.value && handle.value !== who.handle) patch.handle = handle.value;
    if (name.value.trim() && name.value.trim() !== who.name) patch.name = name.value.trim();
    if (Object.keys(patch).length) {
      me.value = await call<Me>("/v1/me", { method: "PATCH", body: patch });
    }
    // The email is set here rather than in the PATCH above, so that one refusal covers both it and
    // the password: an address another account already uses is the same problem either way, and
    // hearing about it twice in two different sentences is worse than hearing it once.
    if (needsPassword.value) {
      await call("/v1/auth/password", {
        method: "POST",
        body: { email: email.value.trim(), password: password.value },
      });
    }
    await call(`/v1/invites/${encodeURIComponent(code.value)}/accept`, { method: "POST" });
    location.assign("/hub");
  } catch (err) {
    error.value = (err as Error).message;
    // The @name is the field most likely to be refused, so it opens for editing.
    if (/@|name|handle/i.test(error.value)) editingHandle.value = true;
    busy.value = false;
  }
}
</script>

<template>
  <main>
    <header>
      <AppBrand />
      <h1>Join {{ team }} on Passalong</h1>
      <div class="meta"><span>You've been invited to a team</span></div>
    </header>

    <article>
      <p>
        When someone on the team finishes a piece of work you need to pick up, they send it to you
        as a guide: what the problem was, how they solved it, and how to check it worked.
      </p>
      <p>
        It works the other way too: from your own Claude Code you can record an issue or a task for
        {{ team }}, and the team sees it here.
      </p>

      <form class="join" @submit.prevent="submit">
        <label>
          Your name
          <input v-model="name" name="name" placeholder="Ada Okafor" autocomplete="name" required />
        </label>

        <p class="muted m-0">
          <template v-if="!editingHandle">
            Teammates can send you work as <b>@{{ handle || "your-name" }}</b>.
            <button class="linkish" type="button" @click="editingHandle = true">Change</button>
          </template>
        </p>
        <label v-if="editingHandle">
          How teammates mention you
          <input
            v-model="handle"
            name="handle"
            required
            spellcheck="false"
            autocomplete="username"
            pattern="[a-z0-9][a-z0-9-]{1,30}"
            title="2 to 31 lowercase letters, numbers or dashes"
            @input="handleTouched = true"
          />
          <span class="muted">2 to 31 lowercase letters, numbers or dashes.</span>
        </label>

        <label v-if="needsPassword">
          Email
          <input
            v-model="email"
            name="email"
            type="email"
            required
            placeholder="ada@example.com"
            autocomplete="email"
          />
          <span class="muted">You sign in with this, and it is where we tell you about work sent to you.</span>
        </label>

        <label v-if="needsPassword">
          Password
          <input
            v-model="password"
            name="password"
            type="password"
            required
            placeholder="choose a password"
            autocomplete="new-password"
          />
        </label>

        <button class="btn primary" type="submit" :disabled="busy">
          {{ busy ? "Joining…" : `Join ${team}` }}
        </button>
        <p v-if="error" class="m-0 rounded-2 border border-danger bg-danger-soft px-3 py-3 font-ui text-sm text-danger">{{ error }}</p>
        <p v-if="needsPassword" class="muted">
          That is the whole account. You can sign in from anywhere with it.
        </p>
      </form>

      <p class="muted"><a href="/connect">Use the terminal tool or an assistant instead</a></p>
    </article>
  </main>
</template>
