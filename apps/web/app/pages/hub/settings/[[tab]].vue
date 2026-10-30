<!--
  Settings: who you are, what you pay for, who you work with, and what else can act as you.

  Five pages, one topic each: Account (the default), Plan, Teams, Agents and Integrations. It used to be
  one long scroll of ten sections, and it was overwhelming: the section you came for was buried
  among the ones you did not. The pages are the world's tabs, each its own address; a tab with
  something broken carries a status dot, and each page opens with the "Needs you" items that belong
  to it, then calm blocks (HubSettingsSection) of labelled rows (HubSettingRow) and registers.

  Agents and Integrations are two pages because they face opposite ways: Agents is what acts as you
  (connected apps, API tokens), Integrations is what sends work to you (email, Sentry, PostHog).
  Agents keeps the `connections` address it had when both were one page.

  Old links still land: `/hub/settings#plan` is forwarded to the page holding `#plan`.
-->
<script setup lang="ts">
import { attention } from "~/utils/connect-apps";

usePage({
  title: "Settings · Passalong",
  description: "Your profile, plan, teams, connected apps and API tokens.",
  noindex: true,
});

const { data } = useHub();
const { connect } = useSettingsUi();
const { data: connectorsData } = useConnectors();
const extras = useTeamExtras();

const me = computed(() => data.value.me);
const connectors = computed(() => connectorsData.value ?? []);
const needsPassword = computed(() => Boolean(me.value) && !me.value?.has_password);

const items = computed(() =>
  attention({
    hasPassword: !needsPassword.value,
    plan: me.value
      ? { sync: me.value.sync, guides: me.value.guides, limit: me.value.limit }
      : undefined,
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
  if (item.app) connect.value = { open: true, app: item.app };
  nextTick(() =>
    document
      .getElementById(item.team ? `team-${item.team.slug}-${item.team.tab}` : item.anchor)
      ?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
}

/** The Plan tab's one fact: work used on the free plan, else the plan's name. */
const planNote = computed(() => {
  const m = me.value;
  if (!m) return "";
  if (m.sync === "free") return `${m.guides} of ${m.limit}`;
  return m.plan === "solo" ? "Solo" : m.plan === "lapsed" ? "lapsed" : "no limit";
});

const TABS = [
  { id: "account", label: "Account", path: "/hub/settings" },
  { id: "plan", label: "Plan", path: "/hub/settings/plan" },
  { id: "teams", label: "Teams", path: "/hub/settings/teams" },
  { id: "connections", label: "Agents", path: "/hub/settings/connections" },
  { id: "integrations", label: "Integrations", path: "/hub/settings/integrations" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Which page each section is on, so an old `#anchor` link and a "Needs you" item find it. */
function tabOf(anchor: string): Tab {
  if (anchor === "plan") return "plan";
  if (anchor.startsWith("team-") || anchor === "new-team") return "teams";
  if (["apps", "tokens"].includes(anchor)) return "connections";
  if (["integrations", "email-in"].includes(anchor)) return "integrations";
  return "account";
}

const route = useRoute();
const tab = computed<Tab>(() => TABS.find((t) => t.id === route.params.tab)?.id ?? "account");
// Said once, where it is fixed: Sign-in is itself the first block of Account when it is missing,
// and an empty group says so on its own row beside Choose people. The tab's dot still counts both.
const pageItems = computed(() =>
  items.value.filter(
    (i) => tabOf(i.anchor) === tab.value && i.anchor !== "signin" && i.team?.tab !== "groups",
  ),
);

onMounted(() => {
  // `#token=…` is a sign-in link's fragment, not an old anchor: it must not send you to Account.
  const anchor = route.hash.slice(1);
  const home = anchor && !anchor.includes("=") ? tabOf(anchor) : tab.value;
  if (home !== tab.value)
    navigateTo(
      { path: TABS.find((t) => t.id === home)?.path, hash: route.hash },
      { replace: true },
    );
});

/** What each page says beside its name: what needs you there first, else its one useful fact. */
const nav = computed(() =>
  TABS.map((t) => {
    const n = items.value.filter((i) => tabOf(i.anchor) === t.id).length;
    const fact =
      t.id === "plan"
        ? planNote.value
        : t.id === "teams"
          ? String(me.value?.teams?.length || "")
          : "";
    const bad = items.value.some((i) => i.tone === "bad" && tabOf(i.anchor) === t.id);
    return { ...t, needs: n, tone: bad ? "bad" : n ? "warn" : "", note: n ? "" : fact };
  }),
);

const claiming = ref(false);

/** The one line under the heading: what this page holds, said as facts where there are some. */
const summary = computed(() => {
  const m = me.value;
  if (!m) return "";
  const teams = m.teams ?? [];
  switch (tab.value) {
    case "plan":
      if (m.sync === "unlimited" && m.plan !== "solo")
        return "In a paid team, so there's no limit on work.";
      if (m.plan === "solo") return "Solo, with no limit on work.";
      if (m.plan === "lapsed") return "Your Solo plan has lapsed. Nothing has been taken away.";
      if (m.sync === "free") return `Free plan · ${m.guides} of ${m.limit} pieces of work used`;
      return "No plan yet, so new work can't be sent.";
    case "teams":
      // With teams, the template writes the line itself so each name links to its block.
      return teams.length ? "" : "Not in a team yet. A team is the people you send work to.";
    case "connections":
      return `${plural(connectors.value.length, "connected app")} · ${plural(data.value.tokens.length, "API token")}. What acts as you.`;
    case "integrations":
      return "Where work arrives from outside: email, Sentry, PostHog and your own code.";
    default:
      return [m.name || m.display, m.handle ? `@${m.handle}` : "", m.email]
        .filter(Boolean)
        .join(" · ");
  }
});

const myTeams = computed(() => me.value?.teams ?? []);
/** What follows the i-th name in "Acme, Beta and Core". */
const sep = (i: number) =>
  i < myTeams.value.length - 2 ? ", " : i === myTeams.value.length - 2 ? " and " : "";
</script>

<template>
  <HubShell>
    <div class="flex min-w-0 flex-col gap-6">
      <div class="flex flex-col gap-1">
        <h1 class="m-0 text-h2 font-medium tracking-tight">Settings</h1>
        <p v-if="tab === 'teams' && myTeams.length" class="m-0 min-h-5 font-ui text-sm text-muted">
          In <template v-for="(t, i) in myTeams" :key="t.slug"><a :href="`#team-${t.slug}`" class="text-fg">{{ t.name || t.slug }}</a>{{ sep(i) }}</template>. Who is in each, its groups, its channels and its plan.
        </p>
        <p v-else class="m-0 min-h-5 font-ui text-sm text-muted">{{ summary }}</p>
      </div>

      <!-- The hairline is the nav's own inset edge, so the row can scroll sideways on a phone
           without clipping the current tab's bar; it fades at the right to say it continues. -->
      <nav
        class="flex gap-5 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)] max-md:pr-12 max-md:[mask-image:linear-gradient(to_right,#000_calc(100%-3rem),transparent)] md:gap-6"
        aria-label="Settings pages"
      >
        <NuxtLink
          v-for="t in nav"
          :key="t.id"
          :to="t.path"
          class="tab flex shrink-0 items-baseline gap-2 border-b-2 py-2 font-ui text-sm whitespace-nowrap no-underline"
          :class="tab === t.id ? 'border-fg font-medium text-fg' : 'border-transparent text-muted hover:text-fg'"
          :aria-current="tab === t.id ? 'page' : undefined"
        >
          {{ t.label }}
          <span v-if="t.needs" class="size-1.5 shrink-0 self-center rounded-pill" :class="t.tone === 'bad' ? 'bg-danger' : 'bg-warn'" aria-hidden="true" />
          <span v-if="t.needs" class="sr-only">, {{ t.needs }} need{{ t.needs === 1 ? "s" : "" }} you</span>
          <span v-else-if="t.note" class="text-xs text-muted tabular-nums">{{ t.note }}</span>
        </NuxtLink>
      </nav>

      <!-- What is broken on this page, as standing notices: a status dot on a hairline row. -->
      <section v-if="pageItems.length" aria-labelledby="needs-h">
        <h2 id="needs-h" class="sr-only">Needs you</h2>
        <ul class="m-0 list-none p-0">
          <li
            v-for="(item, i) in pageItems"
            :key="i"
            class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-3 font-ui text-sm first:border-t"
          >
            <span class="size-1.5 shrink-0 rounded-pill" :class="item.tone === 'bad' ? 'bg-danger' : 'bg-warn'" aria-hidden="true" />
            <span class="min-w-0 grow basis-64 text-fg">{{ item.text }} <span class="text-muted">· {{ item.where }}</span></span>
            <button class="btn sm" type="button" @click="go(item)">{{ item.action }}</button>
          </li>
        </ul>
      </section>

      <div v-if="tab === 'account'" class="flex flex-col gap-10">
        <HubSettingsSection v-if="needsPassword" id="signin" title="Sign-in" blurb="How you get back into Passalong from another browser.">
          <HubSettingRow label="Password" hint="Made by an invite or the terminal tool, this account has none yet.">
            <template v-if="!claiming">
              <p class="m-0 text-fg">You're only signed in on this browser. Add a password to sign in anywhere else.</p>
              <button class="btn primary sm self-start" type="button" @click="claiming = true">Add a password</button>
            </template>
            <HubClaim v-else bare @cancel="claiming = false" />
          </HubSettingRow>
        </HubSettingsSection>

        <HubSettingsSection id="profile" title="Profile" blurb="What teammates see, and the @name they send work to.">
          <HubIdentity />
        </HubSettingsSection>

        <HubSettingsSection
          id="notifications"
          title="Notifications"
          blurb="When the hub isn't open: something sent to you, handed in, didn't work, sent back, gone quiet, or stuck on you. Set per device."
        >
          <HubPushSettings />
        </HubSettingsSection>
      </div>

      <div v-else-if="tab === 'plan'" class="flex flex-col gap-10">
        <HubSettingsSection id="plan" title="Your plan" blurb="Your own plan, separate from any team you're in. A team's plan is under Teams.">
          <HubSolo />
        </HubSettingsSection>
      </div>

      <div v-else-if="tab === 'teams'" class="flex flex-col gap-10">
        <HubTeamList />
      </div>

      <div v-else-if="tab === 'connections'" class="flex flex-col gap-10">
        <HubSettingsSection
          id="apps"
          title="Connected apps"
          blurb="Assistants that act for you in Passalong. Each has its own access, reaching only Passalong's tools, and you can cut it off here."
        >
          <template #action>
            <button
              class="btn sm"
              :class="connect.open ? '' : 'primary'"
              type="button"
              :aria-expanded="connect.open"
              @click="connect = { ...connect, open: !connect.open }"
            >
              {{ connect.open ? "Close" : "Connect an app" }}
            </button>
          </template>
          <HubConnectors />
        </HubSettingsSection>

        <HubTokens />
      </div>

      <HubIntegrations v-else />
    </div>
  </HubShell>
</template>
