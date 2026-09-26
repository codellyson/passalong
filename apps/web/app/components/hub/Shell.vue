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

/**
 * The reading column, named once. The navbar sits outside <main> so that its background can span
 * the viewport without `100vw` — see the template — and its content has to line up with the page
 * under it, so both take their width from here.
 */
// A guide's own page is wide for the same reason Settings is: the guide and what surrounds it sit
// side by side.
const measure = computed(() =>
  route.path === "/hub/settings" || route.path === "/hub" || route.path.startsWith("/hub/g/")
    ? "max-w-[70rem]"
    : "max-w-[54rem]",
);
/**
 * One standing notice: a row, not a card. Shared with HubClaim so the two read as one band.
 * `first:border-t-0` is why they are rows — stacked, the hairlines make a list rather than a pile.
 */
const notice =
  "m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line py-2.5 font-ui text-sm text-muted first:border-t-0";
/** The signal the fill used to carry, at the size a standing condition deserves. */
const dot = "mt-1.5 size-1.5 shrink-0 rounded-pill bg-warn";

/** The bar belongs to the signed-in shell, and to the moment before the server has said so. */
const framed = computed(() => signedIn.value || maybe.value || meFailed.value);

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

// One page for all work, whatever its kind (docs/V2.md §11): tasks and handoffs used to be two.
const tabs = [
  { to: "/hub", label: "Work" },
  { to: "/hub/log", label: "Your log" },
  { to: "/hub/settings", label: "Settings" },
];

/** The pages that are about one guide or one report belong under Work. */
const active = (to: string) =>
  to === "/hub"
    ? route.path === "/hub" ||
      route.path.startsWith("/hub/answer") ||
      route.path.startsWith("/hub/report")
    : route.path === to;
</script>

<template>
  <!-- Wider than the 46rem the rest of the product reads at. That measure is right for a guide
       and wrong for a list: this is the one surface that is scanned rather than read. -->
  <!-- Settings is wider again: it has a section nav beside its content, and the connect sheet puts
       an app picker beside its steps. Tasks too: its review puts an inbox beside a pane that holds
       two columns, what was asked against what came back, and at 54rem each column wrapped every
       Acceptance line to four or five lines. -->
  <!-- The navbar, outside <main> and spanning the viewport by being a block in the page rather
       than a box one viewport wide. `100vw` counts the vertical scrollbar, so the old full-bleed
       pseudo-element was about eight pixels wider than the page and the browser drew a horizontal
       scrollbar on every screen. A plain block has no such opinion, and its content lines up with
       the page under it because both use `measure`. -->
  <div
    v-if="framed"
    class="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md"
  >
    <div class="mx-auto flex h-16 w-full items-center gap-2 px-[var(--s-5)] sm:gap-6" :class="measure">
      <!-- One row at every width. On a phone the brand is its mark, New is a plus, the account
           is an avatar, and the theme switch moves into the account menu. -->
      <AppBrand to="/hub" compact />
      <nav
        class="marked flex min-w-0 gap-0.5 overflow-x-auto [scrollbar-width:none] sm:gap-1"
        aria-label="Hub"
      >
        <NuxtLink
          v-for="t in tabs"
          :key="t.to"
          :to="t.to"
          class="rounded-1 px-2.5 py-1.5 font-ui text-sm whitespace-nowrap no-underline transition-colors sm:px-3"
          :class="active(t.to) ? 'font-semibold text-fg' : 'font-medium text-muted hover:text-fg'"
          :aria-current="active(t.to) ? 'page' : undefined"
        >
          {{ t.label }}
        </NuxtLink>
      </nav>
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <!-- Reachable signed in or out: the sign-in screen is as likely as any to be too bright.
             Signed in on a phone it is in the account menu instead, to keep the bar one row. -->
        <AppThemeToggle :class="signedIn ? 'max-sm:hidden' : ''" />
        <template v-if="signedIn">
          <HubNewMenu />
          <HubAccountMenu />
        </template>
      </div>
    </div>
  </div>

  <!-- Less room above than the 48px every other page gets: those open on a heading with nothing
       over it, and this one opens under a navbar that is already a band of its own. -->
  <main class="pt-8" :class="measure">
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

      <!-- Standing notices, as one band of quiet rows rather than a stack of filled cards.
           Each of these is true for weeks — a plan not chosen, a team lapsed, a browser with no
           password — and filled warning cards for a permanent condition take the top of the page,
           the loudest colour on it and the reader's first glance, every single visit, for something
           nobody is going to act on right now. A dot carries the signal, a hairline separates the
           rows, and the work starts higher up the page. -->
      <div v-if="lapsed.length || noPlan || nearLimit" class="mb-8 flex flex-col">
        <!-- Specific about which half stops: everything in the team can still be read and answered,
             and only new guides are refused. -->
        <p v-for="t in lapsed" :key="t.slug" :class="notice">
          <span :class="dot" aria-hidden="true" />
          <span class="min-w-0 grow">
            <b class="text-fg">{{ t.name }} can't take new guides right now.</b>
            Its plan has lapsed. Everything already in it can still be read and answered, and nobody
            new can join.
            {{ t.role === "owner" ? "Renew it in Settings." : "Ask the team owner to renew it." }}
          </span>
        </p>

        <p v-if="noPlan" :class="notice">
          <span :class="dot" aria-hidden="true" />
          <span class="min-w-0 grow">
            <b class="text-fg">Sending guides needs a plan.</b>
            Guides you already have stay where they are.
          </span>
          <NuxtLink v-if="plansOffered" class="shrink-0 font-medium" to="/hub/settings#plan">Choose a plan</NuxtLink>
        </p>

        <p v-if="nearLimit" :class="notice">
          <span :class="dot" aria-hidden="true" />
          <span class="min-w-0 grow">
            <b class="text-fg">You're using {{ data.me?.guides }} of {{ data.me?.limit }} guides on the free plan.</b>
            <template v-if="full"> New guides can't be sent until you make room.</template>
            Archiving a finished guide frees a space.
          </span>
          <NuxtLink class="shrink-0 font-medium" :to="{ path: '/hub', query: { done: '1' } }">Show Done</NuxtLink>
          <NuxtLink v-if="plansOffered" class="shrink-0 font-medium" to="/hub/settings#plan">See plans</NuxtLink>
        </p>
      </div>

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
