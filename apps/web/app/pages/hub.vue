<!--
  The hub: your transfers, your teams, your credentials. Ported from apps/api/public/hub.js and the
  `renderHub()` shell around it. Everything it can do, the CLI and the MCP server can do too.

  The document deliberately carries no server-rendered heading. This one route serves two different
  screens — signing in, and the hub itself — and auth state lives in a cookie the client reads, or a
  token in localStorage the server cannot see at all. A server-rendered header could only ever
  describe one of them, which is how a signed-out visitor once ended up being told these were "Your
  transfers". Each state renders its own.
-->
<script setup lang="ts">
usePage({
  title: "Passalong hub",
  description: "Your synced transfer guides.",
  noindex: true,
});

// Every form here submits through JavaScript, and the CSP's `form-action 'none'` blocks the native
// fallback, so without script this page cannot do anything. Say so, and point at the surface that
// has no such requirement.
//
// It goes in through `useHead` rather than sitting in the template because a browser with script
// *enabled* parses the contents of <noscript> as plain text, while Vue's server render emits it as
// markup — so hydration finds a text node where it expected a <p> and reports a mismatch. Injected
// into the document, it is never part of the tree Vue tries to reconcile.
useHead({
  noscript: [
    {
      tagPosition: "bodyOpen",
      innerHTML:
        "<p><b>Passalong</b> — the hub needs JavaScript. The CLI does not: <code>passalong list</code>.</p>",
    },
  ],
});

const { data, signedIn, scope, error, editing, adoptToken, setToken, load, createTeam, signOut } =
  useHub();

// Nothing is fetched during SSR: neither credential is visible from the server, so the first
// render is always the signed-out screen and the client decides from there.
onMounted(() => {
  adoptToken();
  load();
});

watch(scope, () => load());

function onToken(t: string) {
  setToken(t);
  load();
}

function onSignedIn() {
  // Signing in replaces any pasted token: the cookie is the credential now, and a stale bearer
  // header would keep authenticating as whoever that token belongs to.
  setToken(null);
  load({ dropToken: true });
}

// ---- filtering -------------------------------------------------------------------------------

/** The one genuinely controlled input on the page. */
const q = ref("");
const status = ref("all");

const visible = computed(() => {
  const terms = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return data.value.guides.filter((g) => {
    if (status.value !== "all" && g.status !== status.value) return false;
    const hay = [
      g.title,
      g.source_context,
      g.from,
      g.to,
      ...(g.tags || []),
      ...(g.stack_assumptions || []),
    ]
      .join("\n")
      .toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
});

const counts = computed(() => {
  const out: Record<string, number> = {};
  for (const g of data.value.guides) out[g.status] = (out[g.status] || 0) + 1;
  return out;
});

const teams = computed(() => data.value.me?.teams || []);

const statusLabel = (value: string, label: string) => {
  if (value === "all") return `${label} ${data.value.guides.length}`;
  return counts.value[value] ? `${label} ${counts.value[value]}` : label;
};
</script>

<template>
  <main>
    <HubSignIn v-if="!signedIn" :error="error" @token="onToken" @signed-in="onSignedIn" />

    <section v-else class="hub">
      <header>
        <AppBrand />
        <h1>Your transfers</h1>
        <div class="meta">
          <span>what is waiting, in flight, and landed · <a href="/">what is Passalong?</a></span>
        </div>
      </header>

      <HubClaim />
      <HubIdentity />
      <HubBoard />
      <HubActivity />

      <div class="chips scopes">
        <template v-if="teams.length">
          <button :class="['chip', { on: scope === 'all' }]" @click="scope = 'all'">
            everything
          </button>
          <button :class="['chip', { on: scope === 'mine' }]" @click="scope = 'mine'">mine</button>
        </template>
        <button
          v-for="t in teams"
          :key="t.slug"
          :class="['chip', { on: scope === t.slug }]"
          @click="scope = t.slug"
        >
          {{ t.name }}
        </button>
        <button class="chip" @click="createTeam">
          {{ teams.length ? "+ team" : "+ start a team" }}
        </button>
      </div>

      <HubTeamPanel />
      <HubTokens />

      <h2 v-if="data.guides.length" class="all">All guides</h2>
      <div class="toolbar">
        <input
          v-model="q"
          type="search"
          placeholder="search title, tags, stack, source, people…"
        />
        <div class="chips">
          <button
            v-for="s in ['all', 'published', 'consumed', 'promoted']"
            :key="s"
            :class="['chip', { on: status === s }]"
            @click="status = s"
          >
            {{ statusLabel(s, s) }}
          </button>
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <!-- An account with no team has an empty hub by design: guides are only created by
           `share()`, and the hub has no editor. So the empty state hands over the two things that
           actually lead somewhere rather than dead-ending. -->
      <div v-if="data.guides.length === 0" class="empty">
        <p>Nothing synced yet. After your next finished piece of work:</p>
        <pre><code>passalong share</code></pre>
        <p>or say <em>“pass this along”</em> to Claude Code.</p>
        <template v-if="!teams.length">
          <p>Waiting on someone else's work instead? Paste the invite link they sent you:</p>
          <HubInvitePaste label="invite link" />
        </template>
      </div>
      <p v-else-if="visible.length === 0" class="empty">No guides match.</p>
      <ul v-else class="guides">
        <HubGuideRow v-for="g in visible" :key="g.id" :g="g" />
      </ul>

      <footer>
        <template v-if="data.me">
          <a href="#" @click.prevent="editing = true">
            {{ data.me.handle ? `@${data.me.handle}` : `account ${data.me.account}` }}
          </a>
          {{ ` · ${data.me.guides} synced (${data.me.limit} active on the free tier) · ` }}
        </template>
        <a href="#" @click.prevent="signOut">sign out</a>
      </footer>
    </section>
  </main>
</template>
