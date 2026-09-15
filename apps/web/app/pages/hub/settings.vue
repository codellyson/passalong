<!--
  Settings: who you are, what you pay for, who you work with, and what else can act as you.

  Scanned rather than read, and visited when something is wrong more often than not. So it opens
  with "Needs you" — every failing channel, empty group and refused connector on the page, each with
  the way to its fix — and a section nav that carries the same state, so the section you came for
  is findable without scrolling.

  Four bands. Account and Plan are about you; Teams puts each team's people, groups, channels and
  seats on one card, where the team plan used to be a separate section above it; Access is the two
  kinds of credential, connected apps first because that is where setup happens now.
-->
<script setup lang="ts">
import { appForHost, attention, connectorState } from "~/utils/connect-apps";

usePage({
  title: "Settings · Passalong",
  description: "Your profile, plan, teams, connected apps and API tokens.",
  noindex: true,
});

const { data } = useHub();
const { teamTab, connect } = useSettingsUi();
const { data: connectorsData } = useConnectors();
const extras = useTeamExtras();

const me = computed(() => data.value.me);
const connectors = computed(() => connectorsData.value ?? []);
const needsPassword = computed(() => Boolean(me.value) && !me.value?.has_password);

const items = computed(() =>
  attention({
    hasPassword: !needsPassword.value,
    connectors: connectors.value,
    teams: extras.value,
  }),
);

// Nothing connected yet: the sheet is the section, so it starts open.
watch(
  () => connectorsData.value,
  (rows) => {
    if (rows && !rows.length && !connect.value.open)
      connect.value = { ...connect.value, open: true };
  },
  { once: true },
);

function go(item: (typeof items.value)[number]) {
  if (item.team) teamTab.value = { ...teamTab.value, [item.team.slug]: item.team.tab };
  if (item.app) connect.value = { open: true, app: item.app };
  nextTick(() =>
    document.getElementById(item.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
}

const planNote = computed(() => {
  const m = me.value;
  if (!m) return "";
  if (m.sync === "free") return `${m.guides} of ${m.limit}`;
  return m.plan === "solo" ? "Solo" : m.plan === "lapsed" ? "lapsed" : "no limit";
});

const failingApps = computed(
  () => connectors.value.filter((c) => connectorState(c).tone === "bad").length,
);

const nav = computed(() => {
  const teams = (me.value?.teams ?? []).map((t) => {
    const n = items.value.filter((i) => i.team?.slug === t.slug).length;
    return {
      href: `#team-${t.slug}`,
      label: t.name || t.slug,
      note: n ? `${n} needs you` : t.role,
      tone: n ? "bad" : "",
    };
  });
  return [
    {
      group: "Account",
      links: [
        ...(needsPassword.value
          ? [{ href: "#signin", label: "Sign-in", note: "this browser only", tone: "warn" }]
          : []),
        {
          href: "#profile",
          label: "Profile",
          note: me.value?.handle ? `@${me.value.handle}` : "no @name",
          tone: me.value?.handle ? "" : "warn",
        },
      ],
    },
    {
      group: "Plan",
      links: [{ href: "#plan", label: "Your plan", note: planNote.value, tone: "" }],
    },
    {
      group: "Teams",
      links: [...teams, { href: "#new-team", label: "New team", note: "", tone: "" }],
    },
    {
      group: "Access",
      links: [
        {
          href: "#apps",
          label: "Connected apps",
          note: failingApps.value
            ? `${failingApps.value} failing`
            : String(connectors.value.length || ""),
          tone: failingApps.value ? "bad" : "",
        },
        {
          href: "#tokens",
          label: "API tokens",
          note: String(data.value.tokens.length || ""),
          tone: "",
        },
      ],
    },
  ];
});

// Which section is on screen, for the nav's marker. Nothing waits on this to be visible.
const here = ref("#profile");
let observer: IntersectionObserver | null = null;
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) here.value = `#${e.target.id}`;
    },
    { rootMargin: "-15% 0px -75% 0px" },
  );
  watchEffect(() => {
    observer?.disconnect();
    for (const g of nav.value)
      for (const l of g.links) {
        const el = document.getElementById(l.href.slice(1));
        if (el) observer?.observe(el);
      }
  });
});
onBeforeUnmount(() => observer?.disconnect());

const claiming = ref(false);
const band = "flex flex-col border-t border-line pt-8 first:border-t-0 first:pt-0";
const bandLabel = "m-0 mb-2 font-ui text-xs font-semibold tracking-widest text-muted uppercase";
const sec = "flex scroll-mt-6 flex-col gap-4 py-5";
const secHead = "flex flex-wrap items-baseline gap-x-3 gap-y-1";
const title = "m-0 font-ui text-lg font-semibold text-fg";
const blurb = "m-0 basis-full max-w-prose font-ui text-sm text-muted";
const noteTone: Record<string, string> = {
  bad: "text-danger",
  warn: "text-warn",
  "": "text-muted",
};
</script>

<template>
  <HubShell>
    <div class="grid gap-8 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-12">
      <nav class="flex flex-col gap-4 md:sticky md:top-6 md:self-start" aria-label="Settings sections">
        <h1 class="m-0">Settings</h1>
        <div class="flex gap-2 overflow-x-auto pb-1 md:flex-col md:gap-4 md:overflow-visible md:pb-0">
          <div v-for="g in nav" :key="g.group" class="contents md:flex md:flex-col md:gap-0.5">
            <span class="hidden px-2.5 pb-1 font-ui text-xs tracking-widest text-muted uppercase md:block">{{ g.group }}</span>
            <a
              v-for="l in g.links"
              :key="l.href"
              :href="l.href"
              class="flex shrink-0 items-baseline justify-between gap-2 rounded-1 border border-line px-2.5 py-1.5 font-ui text-sm whitespace-nowrap text-fg no-underline hover:bg-surface md:border-transparent"
              :class="here === l.href ? 'bg-surface font-medium md:shadow-[inset_2px_0_0_var(--accent)]' : ''"
              :aria-current="here === l.href ? 'true' : undefined"
            >
              {{ l.label }}
              <small v-if="l.note" class="text-xs font-normal" :class="noteTone[l.tone]">{{ l.note }}</small>
            </a>
          </div>
        </div>
      </nav>

      <div class="flex min-w-0 flex-col">
        <section v-if="items.length" class="mb-8 rounded-2 border border-line bg-raised" aria-labelledby="needs-h">
          <header class="flex items-baseline gap-2 border-b border-line px-4 py-3">
            <h2 id="needs-h" class="m-0 font-ui text-base font-semibold text-fg">Needs you</h2>
            <span class="font-ui text-sm text-muted">{{ plural(items.length, "thing") }}, most urgent first</span>
          </header>
          <ul class="m-0 list-none p-0">
            <li
              v-for="(item, i) in items"
              :key="i"
              class="grid grid-cols-[0.5rem_1fr_auto] items-center gap-3 border-b border-line px-4 py-2.5 font-ui text-sm last:border-b-0"
            >
              <span class="size-2 rounded-pill" :class="item.tone === 'bad' ? 'bg-danger' : 'bg-warn'" aria-hidden="true" />
              <span class="text-fg">{{ item.text }} <span class="text-muted">· {{ item.where }}</span></span>
              <button class="linkish font-medium whitespace-nowrap" type="button" @click="go(item)">{{ item.action }}</button>
            </li>
          </ul>
        </section>

        <div :class="band">
          <h2 :class="bandLabel">Account</h2>

          <section v-if="needsPassword" id="signin" :class="sec" aria-labelledby="signin-h">
            <div :class="secHead">
              <h3 id="signin-h" :class="title">Sign-in</h3>
              <p :class="blurb">How you get back into Passalong from another browser.</p>
            </div>
            <div class="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2 bg-warn-soft px-4 py-3">
              <p class="m-0 grow basis-72 font-ui text-sm text-fg">
                <b>You're only signed in on this browser.</b> Add a password to sign in anywhere else,
                and to get back in if this browser forgets you.
              </p>
              <button v-if="!claiming" class="btn primary sm" type="button" @click="claiming = true">Add a password</button>
            </div>
            <HubClaim v-if="claiming" bare />
          </section>

          <section id="profile" :class="sec" aria-labelledby="profile-h">
            <div :class="secHead">
              <h3 id="profile-h" :class="title">Profile</h3>
              <p :class="blurb">What teammates see, and the @name they send work to.</p>
            </div>
            <HubIdentity bare />
          </section>
        </div>

        <div :class="band">
          <h2 :class="bandLabel">Plan</h2>
          <section id="plan" :class="sec" aria-labelledby="plan-h">
            <div :class="secHead">
              <h3 id="plan-h" :class="title">Your plan</h3>
              <p :class="blurb">Your own plan, separate from any team you're in. A team's plan is on its card below.</p>
            </div>
            <HubSolo />
          </section>
        </div>

        <div :class="band">
          <h2 :class="bandLabel">Teams</h2>
          <section :class="sec" aria-label="Your teams">
            <HubTeamList />
          </section>
        </div>

        <div :class="band">
          <h2 :class="bandLabel">Access</h2>

          <section id="apps" :class="sec" aria-labelledby="apps-h">
            <div :class="secHead">
              <h3 id="apps-h" :class="title">Connected apps</h3>
              <button
                class="btn sm ml-auto"
                :class="connect.open ? '' : 'primary'"
                type="button"
                :aria-expanded="connect.open"
                @click="connect = { ...connect, open: !connect.open }"
              >
                {{ connect.open ? "Close" : "Connect an app" }}
              </button>
              <p :class="blurb">
                Assistants that work with your guides as you. Each has its own access, reaching only
                Passalong's tools, and you can cut it off here.
              </p>
            </div>
            <HubConnectors />
          </section>

          <section id="tokens" :class="sec" aria-labelledby="tokens-h">
            <div :class="secHead">
              <h3 id="tokens-h" :class="title">API tokens</h3>
              <p :class="blurb">
                For the command line and your own scripts. A token reaches your whole account, so give
                each place its own and revoke it there.
              </p>
            </div>
            <HubTokens />
          </section>
        </div>
      </div>
    </div>
  </HubShell>
</template>
