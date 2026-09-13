<!--
  Everything the three hub pages have in common: the credential, the load, the sign-in gate, the
  masthead, the error line and the footer. It is a component rather than a Nuxt layout because the
  signed-out state is not a page — /hub, /hub/guides and /hub/settings all collapse to the same
  sign-in card, and a layout would have to render a heading above it that describes a screen the
  visitor cannot see. That is how a signed-out visitor once ended up being told these were "Your
  transfers".
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    /** "Your transfers" everywhere the page is about guides; settings names itself. */
    heading?: string;
  }>(),
  { heading: "Your transfers" },
);

// Every form on these pages submits through JavaScript, and the CSP's `form-action 'none'` blocks
// the native fallback, so without script the hub cannot do anything. Say so, and point at the
// surface that has no such requirement.
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

const { data, signedIn, maybe, expired, scope, error, adoptToken, setToken, load, signOut } =
  useHub();
const route = useRoute();

// Nothing is fetched during SSR: neither credential is visible from the server, so the first
// render is always the signed-out screen and the client decides from there.
onMounted(() => {
  adoptToken();
  // Moving between hub pages remounts this shell. The state it would fetch is already in memory
  // and every mutation reloads on its own, so a tab switch is not a reason to refetch five
  // endpoints.
  if (!signedIn.value) load();
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

const waiting = computed(() => data.value.board?.waiting.length ?? 0);

/**
 * Teams whose subscription lapsed, so the hub says it before a terminal does.
 *
 * Same reasoning as the quota warning below: the refusal happens at `passalong share`, on a machine
 * where nothing can explain itself beyond one line of stderr. This is the only place the state is
 * visible before it bites.
 */
const lapsed = computed(() => (data.value.me?.teams ?? []).filter((t) => t.plan === "lapsed"));

/**
 * Warn before the limit bites, not after: the share that fails happens in a terminal.
 *
 * Keyed on the plan name rather than on the number. A falsy `limit` used to mean "no ceiling", and
 * now an account with no plan also has no number — so truthiness alone would tell somebody who may
 * sync nothing that they may sync everything.
 */
const noPlan = computed(() => data.value.me?.sync === "none");
const full = computed(() => {
  const me = data.value.me;
  return Boolean(me && me.sync === "free" && me.guides >= me.limit);
});
const nearLimit = computed(() => {
  const me = data.value.me;
  return Boolean(me && me.sync === "free" && me.guides >= me.limit * 0.8);
});

// Counting is the whole point of it: the pages below say which guides, this says how much there is
// to care about before you have read anything. Small numbers are spelled out because it is a
// sentence, not a stat line.
const WORDS = ["Nothing", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const word = (n: number) => WORDS[n] ?? String(n);

/** A plain sum: /v1/board's four sender buckets are disjoint in SQL, so nothing is counted twice. */
const handed = computed(() => {
  const b = data.value.board;
  if (!b) return 0;
  return b.failing.length + b.in_flight.length + b.landed.length;
});

const standing = computed(() => {
  const w = waiting.value;
  const m = handed.value;
  const first = w
    ? `${word(w)} thing${w === 1 ? " waits" : "s wait"} on you.`
    : "Nothing waits on you.";
  const second = m
    ? `${word(m)} of yours ${m === 1 ? "is" : "are"} out there.`
    : "Nothing of yours is out there.";
  return `${first} ${second}`;
});

const tabs = computed(() => [
  // One page for guides now: what needs you, what you sent, what is done. The count is what waits
  // on you, because that is the only number here that asks anything of the reader.
  { to: "/hub", label: "Guides", count: waiting.value || null },
  // No count. The other two numbers say how much is waiting; a log has nothing waiting in it, and
  // a number beside it would only ever be "how much have you done", which is the stat line this
  // page exists without.
  { to: "/hub/log", label: "Your log", count: null },
  // The one tab that is a verb. Everything else here is a place; this is the thing you came to do
  // when what you have is a list of bugs rather than a guide you already wrote somewhere else.
  { to: "/hub/report", label: "Report a bug", count: null },
  { to: "/hub/settings", label: "Settings", count: null },
]);
</script>

<template>
  <!-- Wider than the 46rem the rest of the product reads at. That measure is right for a guide
       and wrong for a board: this is the one surface that is scanned rather than read. -->
  <main class="max-w-[54rem]">
    <!-- `maybe` is the server saying a session cookie arrived with the request. Rendering the
         signed-out screen to someone who is signed in, and then replacing it, is a flash on every
         refresh and every click of the logo — which is a full page load. -->
    <HubSignIn
      v-if="!signedIn && !maybe"
      :error="error"
      :expired="expired"
      @token="onToken"
      @signed-in="onSignedIn"
    />

    <section v-else class="hub">
      <!-- The rule under the tab bar is the one this page needs, so the header gives up its own. -->
      <header class="mb-3 border-b-0 pb-0">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <AppBrand to="/hub" />
          <HubScopes />
        </div>
        <h1>{{ heading }}</h1>
        <div class="meta">
          <span><slot name="sub">{{ standing }}</slot> <a href="/">What is Passalong?</a></span>
        </div>
      </header>

      <!-- The page you are on is the one thing this bar has to say, so it says it with weight and
           a rule rather than a filled pill: these are three places, not three filters, and the
           chips below them already mean "filter". -->
      <nav class="mb-6 flex flex-wrap gap-1 border-b border-line">
        <NuxtLink
          v-for="t in tabs"
          :key="t.to"
          :to="t.to"
          class="-mb-px border-b-2 px-3 py-2 font-ui text-sm no-underline transition-colors"
          :class="
            route.path === t.to
              ? 'border-b-accent font-semibold text-fg'
              : 'border-b-transparent font-medium text-muted hover:text-fg'
          "
        >
          {{ t.label }}
          <span v-if="t.count" class="ml-1 font-code text-xs text-muted">{{ t.count }}</span>
        </NuxtLink>
      </nav>

      <!-- A failed call used to be one red sentence, with no way to tell whether the page you are
           looking at is stale and nothing to do about it but reload. -->
      <div
        v-if="error"
        class="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3"
      >
        <div class="min-w-0 grow basis-64">
          <p class="m-0 font-ui text-sm font-semibold text-danger">That did not go through</p>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">
            {{ error }} — what you can see may be out of date.
          </p>
        </div>
        <button class="btn outline danger sm" @click="load()">Try again</button>
        <button class="btn sm" @click="error = null">Dismiss</button>
      </div>

      <!-- Read-only, and specific about which half: everything in the team can still be read and
           answered, and only new work is refused. A banner that said "read-only" and stopped would
           have people assuming their guides were gone. -->
      <p
        v-for="t in lapsed"
        :key="t.slug"
        class="mb-6 rounded-2 border border-warn bg-warn-soft px-4 py-3 font-ui text-sm text-muted"
      >
        <b class="text-fg">{{ t.name }} is read-only.</b>
        Its subscription lapsed. Everything already in it can still be read, pulled and answered —
        what stops is handing over anything new, and anyone else joining. Sharing a guide without a
        team is unaffected.
      </p>

      <!-- No plan at all is a different sentence from being near a ceiling: there is no number to
           be under and nothing to archive, so the only useful thing to say is where to fix it. -->
      <p
        v-if="noPlan"
        class="mb-6 rounded-2 border border-warn bg-warn-soft px-4 py-3 font-ui text-sm text-muted"
      >
        <b class="text-fg">Syncing needs a plan.</b>
        <code>passalong share</code> will be refused until there is one. Anything already synced
        stays exactly where it is, and everything local still works.
        <NuxtLink to="/hub/settings">See plans</NuxtLink>
      </p>

      <!-- The ceiling stops `passalong share` server-side. Saying so here is the only warning
           anyone gets before the next share fails from a terminal. -->
      <p
        v-if="nearLimit"
        class="mb-6 rounded-2 border border-warn bg-warn-soft px-4 py-3 font-ui text-sm text-muted"
      >
        <b class="text-fg">{{ data.me?.guides }} of {{ data.me?.limit }} synced guides used.</b>
        <template v-if="full">
          The next <code>passalong share</code> will be refused — archive one you are done with.
        </template>
        <template v-else>The free tier stops at this number.</template>
        <NuxtLink to="/hub">See what is synced</NuxtLink>
      </p>

      <!-- Between the guess and the answer there is no data, so the page's own empty states would
           read as facts — "nothing is on your board yet" is a sentence, not a spinner, and it is
           the wrong one to show someone whose board is about to appear. -->
      <p v-if="!signedIn" class="font-ui text-sm text-muted">Loading your board…</p>
      <slot v-else />

      <!-- The quota used to be repeated here. It is one line in the tokens section of settings
           now, which is where someone who has hit it is going to end up anyway. -->
      <footer>
        <template v-if="data.me">
          <NuxtLink to="/hub/settings">
            {{ data.me.handle ? `@${data.me.handle}` : `account ${data.me.account}` }}
          </NuxtLink>
          {{ " · " }}
        </template>
        <a href="#" @click.prevent="signOut">sign out</a>
      </footer>
    </section>
  </main>
</template>
