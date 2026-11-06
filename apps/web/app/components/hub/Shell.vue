<!--
  Everything the hub pages have in common: the credential, the load, the sign-in gate, the rail,
  the error line and the plan banners. It is a component rather than a Nuxt layout because the
  signed-out state is not a page — every /hub route collapses to the same sign-in card, and a layout
  would have to render a heading above it that describes a screen the visitor cannot see.

  The rail (HubSidebar) holds the places: Needs you, the projects, Work, Support, the box, and you.
  On a phone the places are a dock along the bottom (HubDock), as in a phone app, and the rest of the
  rail — Go to id, each project, Settings, you — is a drawer behind the top bar's menu. The hub's tokens
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
          route.path.startsWith("/hub/w/") ||
          route.path.startsWith("/hub/projects") ||
          route.path.startsWith("/hub/support") ||
          route.path === "/hub/new" ||
          route.path === "/hub/start"
        ? "max-w-[70rem]"
        : "max-w-[54rem]",
);

useHead({
  bodyAttrs: { class: "hub-app" },
  // `viewport-fit=cover` is what makes `env(safe-area-inset-bottom)` real, so the dock clears a
  // phone's home indicator. Hub pages only: the landing and share pages keep the plain viewport.
  meta: [{ name: "viewport", content: "width=device-width,initial-scale=1,viewport-fit=cover" }],
});

/** The rail as a drawer on a phone: closed on every move, and by Escape. */
const drawer = ref(false);
/**
 * The rail folded to icons on a desktop (HubSidebar `small`), giving the page the room. Kept in a
 * cookie, not local storage, so the server draws the page folded too: no wide rail that snaps
 * narrow as the page wakes up. A year, and nothing in it but the one choice.
 */
const railSmall = useCookie<boolean>("rail-small", {
  default: () => false,
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
});
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
 * A notice's links. Beside the text on a wide screen; on a phone, a line of their own under it,
 * lined up with the text. Beside it there, they squeezed the sentence into a column a few words
 * wide (2026-11-06). The indent is the dot's width and the gap after it.
 */
const acts = "flex shrink-0 flex-wrap gap-x-3 max-sm:basis-full max-sm:pl-[1.125rem]";

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
  navigator.serviceWorker?.addEventListener("message", onWorker);
  // Moving between hub pages remounts this shell. That must not refetch: the queries are shared
  // and cached, and calling `load()` here invalidated all of them on every navigation, which
  // restarted every retry — so a server that was failing kept the page on its skeleton forever and
  // the error never got the chance to show. `start()` only begins loading the first time.
  start();
});

/**
 * A notification clicked while the hub is open (sw.js): go to its page in this window, as a link
 * in the hub would, rather than the worker reloading the window. Only a page on this site.
 */
function onWorker(e: MessageEvent) {
  if (e.data?.type !== "open" || typeof e.data.url !== "string") return;
  const to = new URL(e.data.url, location.origin);
  if (to.origin === location.origin) navigateTo(to.pathname + to.search + to.hash);
}
// The shell remounts on every hub page, so its listener goes with it.
onBeforeUnmount(() => navigator.serviceWorker?.removeEventListener("message", onWorker));

function onSignedIn() {
  // Signing in replaces any pasted token: the cookie is the credential now, and a stale bearer
  // header would keep authenticating as whoever that token belongs to.
  setToken(null);
  load({ dropToken: true });
}

/**
 * Plans that end within the week and won't renew: your own Solo, and teams you own. The mail said it
 * a week out; the hub says it every day of that week, so it is in front of whoever can renew it.
 */
const WEEK = 7 * 24 * 60 * 60 * 1000;
const endOf = (x: { plan_until?: string; plan_ends?: string }) =>
  [x.plan_until, x.plan_ends].filter(Boolean).sort()[0] || "";
const soon = (end: string) => {
  const left = Date.parse(end) - Date.now();
  return Boolean(end) && left > 0 && left <= WEEK;
};
const onDay = (end: string) =>
  new Date(end).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const ending = computed(() => {
  const me = data.value.me;
  if (!me) return [];
  const mine =
    me.plan === "solo" && soon(endOf(me))
      ? [
          {
            key: "solo",
            name: "Your Solo plan",
            end: endOf(me),
            given: endOf(me) === me.plan_until,
            to: "/hub/settings/plan",
            after: "new work past the free limit waits",
          },
        ]
      : [];
  const teams = (me.teams ?? [])
    .filter((t) => t.role === "owner" && t.plan === "team" && soon(endOf(t)))
    .map((t) => ({
      key: t.slug,
      name: `${t.name}'s Team plan`,
      end: endOf(t),
      given: endOf(t) === t.plan_until,
      to: "/hub/settings/teams",
      after: `${t.name} can't take new work`,
    }));
  return [...mine, ...teams];
});

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
  return Boolean(me && me.sync === "free" && me.work >= me.limit);
});
const nearLimit = computed(() => {
  const me = data.value.me;
  return Boolean(me && me.sync === "free" && me.work >= me.limit * 0.8);
});
/** The limit is on your own work: what a paid team covers is said beside it (utils/covered.ts). */
const covered = computed(() => coveredLine(payingTeams(data.value.me)));
</script>

<template>
  <div
    :class="
      framed
        ? [
            'md:grid md:min-h-dvh md:transition-[grid-template-columns] md:duration-200 motion-reduce:transition-none',
            railSmall ? 'md:grid-cols-[3.75rem_minmax(0,1fr)]' : 'md:grid-cols-[15rem_minmax(0,1fr)]',
          ]
        : ''
    "
  >
    <!-- The rail. Sticky beside the page from md up; below that a drawer over it. -->
    <template v-if="framed">
      <!-- Always there, faded in and out with the drawer, so closing is the opening run backwards. -->
      <div
        class="fixed inset-0 z-40 bg-[oklch(0_0_0/0.4)] transition-opacity duration-200 ease-out motion-reduce:transition-none md:hidden"
        :class="drawer ? 'opacity-100' : 'pointer-events-none opacity-0'"
        aria-hidden="true"
        @click="drawer = false"
      />
      <aside
        id="hub-rail"
        class="z-50 w-60 transition-[translate,visibility] duration-200 ease-out motion-reduce:transition-none max-md:fixed max-md:inset-y-0 max-md:right-0 md:sticky md:top-0 md:h-dvh"
        :class="[drawer ? '' : 'max-md:invisible max-md:translate-x-full', railSmall ? 'md:w-[3.75rem]' : '']"
        @keydown.esc="drawer = false"
      >
        <HubSidebar :small="railSmall" @toggle="railSmall = !railSmall" />
      </aside>
    </template>

    <div class="min-w-0">
      <!-- A phone's top bar: the mark, and the menu at the right, where the thumb is. -->
      <div
        v-if="framed"
        class="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg px-4 md:hidden"
      >
        <AppBrand to="/hub" />
        <button
          type="button"
          class="btn icon -mr-2 ml-auto"
          aria-controls="hub-rail"
          :aria-expanded="drawer"
          aria-label="Open the menu"
          @click="openDrawer"
        >
          <AppIcon name="menu" />
        </button>
      </div>

  <main class="max-md:pt-6 max-md:pb-[calc(var(--dock)+var(--s-7))] md:pt-10" :class="measure">
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

      <div v-if="lapsed.length || noPlan || nearLimit || ending.length" class="mb-8 flex flex-col">
        <p v-for="e in ending" :key="`ending-${e.key}`" :class="notice">
          <span :class="dot" aria-hidden="true" />
          <span class="min-w-0 grow">
            <b class="text-fg">{{ e.name }} ends on {{ onDay(e.end) }}.</b>
            {{ e.given ? "It was given, so it won't renew." : "It was cancelled, so it won't renew." }}
            After that, {{ e.after }}.
          </span>
          <span v-if="plansOffered" :class="acts">
            <NuxtLink class="font-medium" :to="e.to">{{ e.given ? "Choose a plan" : "Manage billing" }}</NuxtLink>
          </span>
        </p>
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
          <span v-if="plansOffered" :class="acts">
            <NuxtLink class="font-medium" to="/hub/settings#plan">Choose a plan</NuxtLink>
          </span>
        </p>

        <p v-if="nearLimit" :class="notice">
          <span :class="dot" aria-hidden="true" />
          <span class="min-w-0 grow">
            <b class="text-fg">You're using {{ data.me?.work }} of {{ data.me?.limit }} pieces of work on the free plan.</b>
            <template v-if="full"> New work can't be sent until you make room.</template>
            Everything you keep counts, archived too, so deleting work you no longer need frees a space.
            <template v-if="covered"> {{ covered }}</template>
          </span>
          <span :class="acts">
            <NuxtLink class="font-medium" :to="{ path: '/hub/work', query: { done: '1' } }">Find work to delete</NuxtLink>
            <NuxtLink v-if="plansOffered" class="font-medium" to="/hub/settings#plan">See plans</NuxtLink>
          </span>
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
  <HubDock v-if="signedIn" />
  <HubToasts v-if="framed" />
  <!-- The one conversation panel for every page of the hub. -->
  <HubThreadDrawer v-if="signedIn" />
</template>
