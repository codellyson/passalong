<!--
  Where an invite link lands. Ported from `renderJoin()` in apps/api/src/render.ts and the
  apps/api/public/join.js that ran inside it.

  The person clicking this link is often the one who has never used Passalong — a tester, a
  designer, someone handed a link in chat — so the terminal cannot be on the critical path. Three
  calls, no password: mint an account, claim a handle, accept the invite. The CLI instructions stay
  on the page for people who would rather.
-->
<script setup lang="ts">
const route = useRoute();
const code = computed(() => String(route.params.code));

const { data: invite } = await useFetch(`/api/invite/${encodeURIComponent(code.value)}`);
if (!invite.value) throw createError({ statusCode: 404, statusMessage: "no such invite" });

const team = computed(() => invite.value?.team ?? "");
const joinUrl = computed(() => `${useRequestURL().origin}/join/${code.value}`);

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
    throw new Error(failed.message || res.statusText);
  }
  return res.json() as Promise<T>;
}

const me = ref<Me | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

// Someone already signed in gets their handle filled in rather than an empty form.
onMounted(() => {
  if (token.get()) {
    call<Me>("/v1/me")
      .then((who) => {
        me.value = who;
      })
      .catch(() => {});
  }
});

// An account is minted once and kept, so a rejected handle is retried against the same account
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
  const minted = await call<{ token: string }>("/v1/accounts", { method: "POST", auth: false });
  token.set(minted.token);
  return call<Me>("/v1/me");
}

async function submit(e: Event) {
  // Read the form before touching state, exactly as the Preact version had to: this is now a
  // Vue form with uncontrolled inputs, and reading them first is still the honest order.
  const f = e.target as HTMLFormElement;
  const typed = {
    handle: field(f, "handle"),
    name: field(f, "name"),
    email: field(f, "email"),
  };
  busy.value = true;
  error.value = null;
  try {
    const who = await account();
    me.value = who;
    const patch: Record<string, string> = {};
    if (typed.handle && typed.handle !== who.handle) patch.handle = typed.handle;
    if (typed.name) patch.name = typed.name;
    if (typed.email) patch.email = typed.email;
    if (Object.keys(patch).length) {
      me.value = await call<Me>("/v1/me", { method: "PATCH", body: patch });
    }
    await call(`/v1/invites/${encodeURIComponent(code.value)}/accept`, { method: "POST" });
    location.assign("/hub");
  } catch (err) {
    error.value = (err as Error).message;
    busy.value = false;
  }
}
</script>

<template>
  <main>
    <header>
      <AppBrand />
      <h1>Join {{ team }}</h1>
      <div class="meta"><span>an invite to a Passalong team</span></div>
    </header>

    <article>
      <p>
        Teams share transfer guides: when someone finishes a piece of work you need to pick up —
        implement it, verify it, take it to another repo — they hand it to you and it lands in your
        inbox, written to be acted on.
      </p>

      <form class="join" @submit.prevent="submit">
        <label>
          Your handle
          <input
            :key="me?.handle || 'new'"
            name="handle"
            :value="me?.handle || ''"
            placeholder="ada"
            required
            autocomplete="username"
            spellcheck="false"
            pattern="[a-zA-Z0-9][a-zA-Z0-9-]{1,30}"
            title="2–31 characters: letters, digits and dashes"
          />
          <span class="muted"
            >how teammates address you: passalong share --to {{ "<team>" }}/@you</span
          >
        </label>
        <label>
          Your name <span class="muted">optional</span>
          <input name="name" placeholder="Ada Lovelace" autocomplete="name" />
        </label>
        <label>
          Email <span class="muted">optional</span>
          <input name="email" type="email" placeholder="ada@example.com" autocomplete="email" />
          <span class="muted">only used to tell you when something is handed to you</span>
        </label>
        <button class="btn primary" type="submit" :disabled="busy">
          {{ busy ? "Joining…" : `Join ${team}` }}
        </button>
        <p v-if="error" class="m-0 rounded-2 border border-danger bg-danger-soft px-3 py-2.5 font-ui text-sm text-danger">{{ error }}</p>
        <p class="muted">
          No password. Your account is a token this browser keeps;
          <code>passalong login</code> moves it to a terminal later if you want one.
        </p>
      </form>

      <h2>Or from a terminal</h2>
      <pre><code>npm i -g passalong
passalong login                 # your account
passalong me --handle you
passalong team join {{ joinUrl }}</code></pre>
    </article>
  </main>
</template>
