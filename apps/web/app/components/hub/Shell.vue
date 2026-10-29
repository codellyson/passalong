<!--
  Everything the hub pages have in common: the credential, the load, the sign-in gate, the rail,
  the error line and the plan banners. It is a component rather than a Nuxt layout because the
  signed-out state is not a page — every /hub route collapses to the same sign-in card, and a layout
  would have to render a heading above it that describes a screen the visitor cannot see.

  The rail (HubSidebar) holds the places: Needs you, the projects, Work, Support, the box, and you.
  On a phone it is a drawer behind a top bar, so the page keeps its whole width. The hub's tokens
  (`.hub-app` in styles.css) go on <body>, so what a page teleports there draws the same way.
-->
<script setup lang="ts">
import { useMutation, useQuery } from "@tanstack/vue-query";

withDefaults(
  defineProps<{
    /** The page's own title. The Work page draws its own, with the team picker in it. */
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
        "<p><b>Passalong</b> needs JavaScript to show your work. A share link still opens without it.</p>",
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
  json,
} = useHub();

/**
 * Whether this deployment takes money at all. The limit banners link to plans, and a link to a page
 * that says "Paid plans aren't available yet" is a dead end, so the link only appears when there is
 * something there to choose. Same query and key as the plan blocks on Settings.
 */
const { data: billing } = useQuery({
  queryKey: hubKeys.billing,
  queryFn: () => api<{ mode: string }>("/v1/billing"),
  enabled: signedIn,
  staleTime: Number.POSITIVE_INFINITY,
});
const plansOffered = computed(() => !!billing.value?.mode && billing.value.mode !== "unset");
const route = useRoute();

/** How wide each page reads. The board takes all of it; Needs you holds a register and a column. */
const measure = computed(() =>
  route.path === "/hub/work"
    ? "max-w-none"
    : route.path === "/hub"
      ? "max-w-[78rem]"
      : route.path.startsWith("/hub/settings") ||
          route.path.startsWith("/hub/g/") ||
          route.path.startsWith("/hub/projects") ||
          route.path.startsWith("/hub/support")
        ? "max-w-[70rem]"
        : "max-w-[54rem]",
);

useHead({ bodyAttrs: { class: "hub-app" } });

/** The rail as a drawer on a phone: closed on every move, and by Escape. */
const drawer = ref(false);
/** Focus goes into the drawer with it, so Escape and the keyboard reach what was opened. */
async function openDrawer() {
  drawer.value = true;
  await nextTick();
  document.querySelector<HTMLElement>("#hub-rail a")?.focus();
}
watch(
  () => route.fullPath,
  () => {
    drawer.value = false;
  },
);
/**
 * One standing notice: a row, not a card. Shared with HubClaim so the two read as one band.
 * `first:border-t-0` is why they are rows — stacked, the hairlines make a list rather than a pile.
 */
const notice =
  "m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line py-2.5 font-ui text-sm text-muted first:border-t-0";
/** The signal the fill used to carry, at the size a standing condition deserves. */
const dot = "mt-1.5 size-1.5 shrink-0 rounded-pill bg-warn";

/**
 * Email verification (migrations/0050). The link in the mail lands on `/hub?verified=1`, or
 * `?verified=expired` when it was used or ran out; the answer is read once, after mount so the
 * server render never redirects, and taken out of the address so a reload does not repeat it.
 */
const router = useRouter();
const verifiedFrom = ref("");
onMounted(() => {
  const v = route.query.verified;
  if (v !== "1" && v !== "expired") return;
  verifiedFrom.value = v;
  const { verified: _, ...rest } = route.query;
  router.replace({ query: rest });
});
const unverified = computed(() =>
  Boolean(
    data.value.me?.email && data.value.me.email_verified === false && verifiedFrom.value !== "1",
  ),
);
const {
  mutate: resend,
  isPending: resending,
  isSuccess: resent,
  error: resendFailed,
} = useMutation({ mutationFn: () => api("/v1/auth/verify", json("POST", {})) });

/** The bar belongs to the signed-in shell, and to the moment before the server has said so. */
const framed = computed(() => signedIn.value || maybe.value || meFailed.value);

// Nothing is fetched during SSR: neither credential is visible from the server, so the first
// render is always the signed-out screen and the client decides from there.
// The hub, live: events from the server refresh what they touch and arrive as toasts.
const live = useLive();
onMounted(() => {
  live.start();
  adoptToken();
  // The worker is what puts Passalong in an installed phone app's Share menu; registering asks
  // nothing of the person (push permission is still asked only on its button in Settings).
  navigator.serviceWorker?.register("/sw.js").catch(() => {});
  // Moving between hub pages remounts this shell. That must not refetch: the queries are shared
  // and cached, and calling `load()` here invalidated all of them on every navigation, which
  // restarted every retry — so a server that was failing kept the page on its skeleton forever and
  // the error never got the chance to show. `start()` only begins loading the first time.
  start();
});

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
</script>

<template>
  <div :class="framed ? 'md:grid md:min-h-dvh md:grid-cols-[15rem_minmax(0,1fr)]' : ''">
    <!-- The rail. Sticky beside the page from md up; below that a drawer over it. -->
    <template v-if="framed">
      <div
        v-if="drawer"
        class="fixed inset-0 z-40 bg-[oklch(0_0_0/0.4)] md:hidden"
        aria-hidden="true"
        @click="drawer = false"
      />
      <aside
        id="hub-rail"
        class="z-50 w-60 transition-transform duration-200 ease-out max-md:fixed max-md:inset-y-0 max-md:left-0 md:sticky md:top-0 md:h-dvh"
        :class="drawer ? '' : 'max-md:invisible max-md:-translate-x-full'"
        @keydown.esc="drawer = false"
      >
        <HubSidebar />
      </aside>
    </template>

    <div class="min-w-0">
      <!-- A phone's top bar: the drawer, the mark, and the way to the box. -->
      <div
        v-if="framed"
        class="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg px-4 md:hidden"
      >
        <button
          type="button"
          class="btn icon -ml-2"
          aria-controls="hub-rail"
          :aria-expanded="drawer"
          aria-label="Open the menu"
          @click="openDrawer"
        >
          <AppIcon name="menu" />
        </button>
        <AppBrand to="/hub" />
        <div class="ml-auto flex items-center gap-2">
          <NuxtLink v-if="signedIn" to="/hub/new" class="btn primary sm" aria-label="New">
            <AppIcon name="plus" />
          </NuxtLink>
        </div>
      </div>

  <main class="max-md:pt-6 md:pt-10" :class="measure">
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
            {{ error ? "That didn't work" : "Your work didn't load" }}
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
      <!-- Not a standing notice: an unproven address is something to do now, once, so it is a
           callout like the failed-load one above rather than a quiet row in the band below. -->
      <div
        v-if="verifiedFrom === '1'"
        role="status"
        class="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-ok bg-ok-soft px-4 py-3"
      >
        <p class="m-0 min-w-0 grow basis-64 font-ui text-sm font-semibold text-fg">
          Your email is confirmed.
        </p>
        <button class="btn sm" type="button" @click="verifiedFrom = ''">Dismiss</button>
      </div>
      <div
        v-else-if="unverified"
        role="alert"
        class="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-warn bg-warn-soft px-4 py-3"
      >
        <div class="min-w-0 grow basis-64">
          <p class="m-0 font-ui text-sm font-semibold text-fg">
            {{ verifiedFrom === "expired" ? "That link has expired or was already used" : "Confirm your email" }}
          </p>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">
            <template v-if="resent">A new link is on its way to {{ data.me?.email }}. Open it to confirm.</template>
            <template v-else-if="resendFailed">{{ resendFailed.message }}</template>
            <template v-else>Open the link we sent to {{ data.me?.email }}.</template>
          </p>
        </div>
        <button
          v-if="!resent"
          class="btn primary sm"
          type="button"
          :disabled="resending"
          @click="resend()"
        >
          {{ resending ? "Sending…" : "Send a new link" }}
        </button>
      </div>

      <div v-if="lapsed.length || noPlan || nearLimit" class="mb-8 flex flex-col">
        <!-- Specific about which half stops: everything in the team can still be read and answered,
             and only new work is refused. -->
        <p v-for="t in lapsed" :key="t.slug" :class="notice">
          <span :class="dot" aria-hidden="true" />
          <span class="min-w-0 grow">
            <b class="text-fg">{{ t.name }} can't take new work right now.</b>
            Its plan has lapsed. Everything already in it can still be read and answered, and nobody
            new can join.
            {{ t.role === "owner" ? "Renew it in Settings." : "Ask the team owner to renew it." }}
          </span>
        </p>

        <p v-if="noPlan" :class="notice">
          <span :class="dot" aria-hidden="true" />
          <span class="min-w-0 grow">
            <b class="text-fg">Sending work needs a plan.</b>
            Work you already have stays where it is.
          </span>
          <NuxtLink v-if="plansOffered" class="shrink-0 font-medium" to="/hub/settings#plan">Choose a plan</NuxtLink>
        </p>

        <p v-if="nearLimit" :class="notice">
          <span :class="dot" aria-hidden="true" />
          <span class="min-w-0 grow">
            <b class="text-fg">You're using {{ data.me?.guides }} of {{ data.me?.limit }} pieces of work on the free plan.</b>
            <template v-if="full"> New work can't be sent until you make room.</template>
            Archiving finished work frees a space.
          </span>
          <NuxtLink class="shrink-0 font-medium" :to="{ path: '/hub/work', query: { done: '1' } }">Show finished work</NuxtLink>
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
        <HubSkeleton :rows="4" label="Loading your work" />
      </div>
      <!-- Only for a known session. After a failed session check the banner is the page: the
           slot would render its empty states ("Nothing is waiting on you") as if they were facts. -->
      <slot v-else-if="signedIn" />
    </section>
  </main>
    </div>
  </div>
  <HubToasts v-if="framed" />
  <!-- The one conversation panel for every page of the hub. -->
  <HubThreadDrawer v-if="signedIn" />
</template>
