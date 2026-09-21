<!--
  Everything the hub pages have in common: the credential, the load, the sign-in gate, the top
  bar, the error line and the plan banners. It is a component rather than a Nuxt layout because
  the signed-out state is not a page — every /hub route collapses to the same sign-in card, and a
  layout would have to render a heading above it that describes a screen the visitor cannot see.

  The top bar holds only places (Guides, Your log, Settings) and two menus: New, for making a
  guide, and you. It used to carry a large "Your transfers" heading, a sentence of counts computed
  differently from the counts below it, team chips labelled with slugs, and a "Report a bug" tab
  that was a verb among places. Each page now names itself, and the guides page counts its own
  sections.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";

withDefaults(
  defineProps<{
    /** The page's own title. The guides page draws its own, with the team picker in it. */
    heading?: string;
  }>(),
  { heading: "" },
);

// Every form on these pages submits through JavaScript, and the CSP's `form-action 'none'` blocks
// the native fallback, so without script the hub cannot do anything. Say so, and say what still
// works.
//
// It goes in through `useHead` rather than sitting in the template because a browser with script
// *enabled* parses the contents of <noscript> as plain text, while Vue's server render emits it as
// markup — so hydration finds a text node where it expected a <p> and reports a mismatch.
useHead({
  noscript: [
    {
      tagPosition: "bodyOpen",
      innerHTML:
        "<p><b>Passalong</b> needs JavaScript to show your guides. A guide's own link still opens without it.</p>",
    },
  ],
});

const {
  data,
  signedIn,
  maybe,
  expired,
  error,
  loadError,
  meFailed,
  adoptToken,
  setToken,
  start,
  load,
  api,
} = useHub();

/**
 * Whether this deployment takes money at all. The limit banners link to plans, and a link to a page
 * that says "Paid plans aren't available yet" is a dead end, so the link only appears when there is
 * something there to choose. Same query and key as the plan blocks on Settings.
 */
const { data: billing } = useQuery({
  queryKey: hubKeys.billing,
  queryFn: () => api<{ stripe: string; paystack: string }>("/v1/billing"),
  enabled: signedIn,
  staleTime: Number.POSITIVE_INFINITY,
});
const plansOffered = computed(() =>
  (["stripe", "paystack"] as const).some((p) => billing.value?.[p] && billing.value[p] !== "unset"),
);
const route = useRoute();

// Nothing is fetched during SSR: neither credential is visible from the server, so the first
// render is always the signed-out screen and the client decides from there.
onMounted(() => {
  adoptToken();
  // Moving between hub pages remounts this shell. That must not refetch: the queries are shared
  // and cached, and calling `load()` here invalidated all of them on every navigation, which
  // restarted every retry — so a server that was failing kept the page on its skeleton forever and
  // the error never got the chance to show. `start()` only begins loading the first time.
  start();
});

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

/** Teams whose plan lapsed, so the hub says it before a share is refused somewhere else. */
const lapsed = computed(() => (data.value.me?.teams ?? []).filter((t) => t.plan === "lapsed"));

/**
 * Warn before the limit bites, not after.
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

const tabs = [
  { to: "/hub", label: "Guides" },
  { to: "/hub/tasks", label: "Tasks" },
  { to: "/hub/log", label: "Your log" },
  { to: "/hub/settings", label: "Settings" },
];

/** The pages that are about one guide or one report belong under Guides. */
const active = (to: string) =>
  to === "/hub"
    ? route.path === "/hub" ||
      route.path === "/hub/write" ||
      route.path.startsWith("/hub/answer") ||
      route.path.startsWith("/hub/report")
    : route.path === to;
</script>

<template>
  <!-- Wider than the 46rem the rest of the product reads at. That measure is right for a guide
       and wrong for a list: this is the one surface that is scanned rather than read. -->
  <!-- Settings is wider again: it has a section nav beside its content, and the connect sheet puts
       an app picker beside its steps. -->
  <main :class="route.path === '/hub/settings' ? 'max-w-[70rem]' : 'max-w-[54rem]'">
    <!-- `maybe` is the server saying a session cookie arrived with the request. Rendering the
         signed-out screen to someone who is signed in, and then replacing it, is a flash on every
         refresh. -->
    <!-- Not when `/v1/me` failed for a reason other than a 401. That is a server that did not
         answer, not a session that ended, and showing the sign-in card for it tells someone who is
         signed in that they are not. -->
    <HubSignIn
      v-if="!signedIn && !maybe && !meFailed"
      :error="error || loadError"
      :expired="expired"
      @token="onToken"
      @signed-in="onSignedIn"
    />

    <section v-else class="hub">
      <header class="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
          <AppBrand to="/hub" />
          <nav class="flex flex-wrap gap-1" aria-label="Hub">
            <NuxtLink
              v-for="t in tabs"
              :key="t.to"
              :to="t.to"
              class="rounded-1 px-3 py-1.5 font-ui text-sm no-underline transition-colors"
              :class="
                active(t.to)
                  ? 'bg-surface font-semibold text-fg'
                  : 'font-medium text-muted hover:text-fg'
              "
              :aria-current="active(t.to) ? 'page' : undefined"
            >
              {{ t.label }}
            </NuxtLink>
          </nav>
        </div>
        <div v-if="signedIn" class="flex items-center gap-2">
          <HubNewMenu />
          <HubAccountMenu />
        </div>
      </header>

      <template v-if="heading">
        <h1 class="mt-0">{{ heading }}</h1>
        <p v-if="$slots.sub" class="-mt-2 mb-6 font-ui text-sm text-muted"><slot name="sub" /></p>
      </template>

      <!-- A failed call used to be one red sentence, with no way to tell whether the page you are
           looking at is stale and nothing to do about it but reload. The sentence itself comes
           from the server, which words it for a person. -->
      <div
        v-if="error || loadError"
        role="alert"
        class="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3"
      >
        <div class="min-w-0 grow basis-64">
          <p class="m-0 font-ui text-sm font-semibold text-danger">
            {{ error ? "That didn't work" : "Your guides didn't load" }}
          </p>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ error || loadError }}</p>
        </div>
        <button class="btn outline danger sm" @click="load()">Try again</button>
        <button class="btn sm" @click="error = null">Dismiss</button>
      </div>

      <!-- Specific about which half stops: everything in the team can still be read and answered,
           and only new guides are refused. -->
      <p
        v-for="t in lapsed"
        :key="t.slug"
        class="mb-6 rounded-2 border border-warn bg-warn-soft px-4 py-3 font-ui text-sm text-muted"
      >
        <b class="text-fg">{{ t.name }} can't take new guides right now.</b>
        Its plan has lapsed. Everything already in it can still be read and answered, and nobody new
        can join. {{ t.role === "owner" ? "Renew it in Settings." : "Ask the team owner to renew it." }}
      </p>

      <p
        v-if="noPlan"
        class="mb-6 rounded-2 border border-warn bg-warn-soft px-4 py-3 font-ui text-sm text-muted"
      >
        <b class="text-fg">Sending guides needs a plan.</b>
        Guides you already have stay where they are.
        <NuxtLink v-if="plansOffered" to="/hub/settings#plan">Choose a plan</NuxtLink>
      </p>

      <p
        v-if="nearLimit"
        class="mb-6 rounded-2 border border-warn bg-warn-soft px-4 py-3 font-ui text-sm text-muted"
      >
        <b class="text-fg">You're using {{ data.me?.guides }} of {{ data.me?.limit }} guides on the free plan.</b>
        <template v-if="full"> New guides can't be sent until you make room.</template>
        Archiving a finished guide frees a space.
        <NuxtLink :to="{ path: '/hub', query: { done: '1' } }">Show Done</NuxtLink>
        <template v-if="plansOffered">
          ·
          <NuxtLink to="/hub/settings#plan">See plans</NuxtLink>
        </template>
      </p>

      <!-- Between the guess and the answer there is no data, so the page's own empty states would
           read as facts — "nothing is waiting on you" is the wrong sentence to show someone whose
           list is about to appear. -->
      <!-- Once the session check has failed for good, the banner above is the whole message: a
           skeleton under it would promise a list that is not coming. -->
      <div v-if="!signedIn && !meFailed" class="flex flex-col gap-6">
        <span class="block h-6 w-48 rounded-pill bg-line-strong" aria-hidden="true" />
        <HubSkeleton :rows="4" label="Loading your guides" />
      </div>
      <!-- Only for a known session. After a failed session check the banner is the page: the
           slot would render its empty states ("Nothing is waiting on you") as if they were facts. -->
      <slot v-else-if="signedIn" />
    </section>
  </main>
</template>
