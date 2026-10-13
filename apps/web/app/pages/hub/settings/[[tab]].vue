<!--
  Settings: who you are, what you pay for, who you work with, and what else can act as you.

  Four pages, one topic each: Account (the default), Plan, Teams and Connections. It used to be one
  long scroll of ten sections, and it was overwhelming: the section you came for was buried among
  the ones you did not. The sidebar is now the four pages, each carrying its own state ("2 need
  you", "1 failing"), and each page opens with the "Needs you" items that belong to it.

  Old links still land: `/hub/settings#plan` is forwarded to the page holding `#plan`.
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

const TABS = [
  { id: "account", label: "Account", path: "/hub/settings" },
  { id: "plan", label: "Plan", path: "/hub/settings/plan" },
  { id: "teams", label: "Teams", path: "/hub/settings/teams" },
  { id: "connections", label: "Connections", path: "/hub/settings/connections" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Which page each section is on, so an old `#anchor` link and a "Needs you" item find it. */
function tabOf(anchor: string): Tab {
  if (anchor === "plan") return "plan";
  if (anchor.startsWith("team-") || anchor === "new-team") return "teams";
  if (["apps", "tokens", "alerts"].includes(anchor)) return "connections";
  return "account";
}

const route = useRoute();
const tab = computed<Tab>(() => TABS.find((t) => t.id === route.params.tab)?.id ?? "account");
const pageItems = computed(() => items.value.filter((i) => tabOf(i.anchor) === tab.value));

onMounted(() => {
  const anchor = route.hash.slice(1);
  const home = anchor ? tabOf(anchor) : tab.value;
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
          : t.id === "connections" && failingApps.value
            ? `${failingApps.value} failing`
            : "";
    return {
      ...t,
      note: n ? `${n} need${n === 1 ? "s" : ""} you` : fact,
      tone: n || (t.id === "connections" && failingApps.value) ? "bad" : "",
    };
  }),
);

const claiming = ref(false);
const band = "flex flex-col";
const bandLabel = "m-0 mb-2 font-ui text-xs font-semibold tracking-widest text-muted uppercase";
const sec = "flex scroll-mt-20 flex-col gap-4 py-5";
const secHead = "flex flex-wrap items-baseline gap-x-3 gap-y-1";
const title = "m-0 font-ui text-lg font-semibold text-fg";
// Its own line under the title. A max-width here let the flex row fit it beside the title instead,
// since wrapping is decided by the width an item asks for.
const blurb = "m-0 w-full basis-full font-ui text-sm text-muted";
const noteTone: Record<string, string> = {
  bad: "text-danger",
  warn: "text-warn",
  "": "text-muted",
};
</script>

<template>
  <HubShell>
    <div class="grid gap-8 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-12">
      <nav class="flex flex-col gap-4 md:sticky md:top-20 md:self-start" aria-label="Settings pages">
        <h1 class="m-0">Settings</h1>
        <div class="flex gap-2 overflow-x-auto pb-1 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0">
          <NuxtLink
            v-for="t in nav"
            :key="t.id"
            :to="t.path"
            class="flex shrink-0 items-baseline justify-between gap-2 rounded-1 border border-line px-2.5 py-1.5 font-ui text-sm whitespace-nowrap text-fg no-underline hover:bg-surface md:border-transparent"
            :class="tab === t.id ? 'bg-surface font-medium md:shadow-[inset_2px_0_0_var(--accent)]' : ''"
            :aria-current="tab === t.id ? 'page' : undefined"
          >
            {{ t.label }}
            <small v-if="t.note" class="text-xs font-normal" :class="noteTone[t.tone]">{{ t.note }}</small>
          </NuxtLink>
        </div>
      </nav>

      <div class="flex min-w-0 flex-col">
        <section v-if="pageItems.length" class="mb-8 rounded-2 bg-raised shadow-edge" aria-labelledby="needs-h">
          <!-- A div, not <header>: the global header rule's padding and margin outrank utilities. -->
          <div class="flex items-baseline gap-2 border-b border-line px-4 py-3">
            <h2 id="needs-h" class="m-0 font-ui text-base font-semibold text-fg">Needs you</h2>
            <span class="font-ui text-sm text-muted">{{ plural(pageItems.length, "thing") }}, most urgent first</span>
          </div>
          <ul class="m-0 list-none p-0">
            <li
              v-for="(item, i) in pageItems"
              :key="i"
              class="grid grid-cols-[0.5rem_1fr_auto] items-center gap-3 border-b border-line px-4 py-2.5 font-ui text-sm last:border-b-0"
            >
              <span class="size-2 rounded-pill" :class="item.tone === 'bad' ? 'bg-danger' : 'bg-warn'" aria-hidden="true" />
              <span class="text-fg">{{ item.text }} <span class="text-muted">· {{ item.where }}</span></span>
              <button class="linkish font-medium whitespace-nowrap" type="button" @click="go(item)">{{ item.action }}</button>
            </li>
          </ul>
        </section>

        <div v-if="tab === 'account'" :class="band">
          <h2 :class="bandLabel">Account</h2>

          <section v-if="needsPassword" id="signin" :class="sec" aria-labelledby="signin-h">
            <div :class="secHead">
              <h3 id="signin-h" :class="title">Sign-in</h3>
              <p :class="blurb">How you get back into Passalong from another browser.</p>
            </div>
            <div class="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2 bg-warn-soft px-4 py-3">
              <p class="m-0 grow basis-72 font-ui text-sm text-fg">
                <b>This account has no password.</b> It was made before we asked for one, or by the
                terminal tool. Add one to sign in from another browser.
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

          <section id="notifications" :class="sec" aria-labelledby="notifications-h">
            <div :class="secHead">
              <h3 id="notifications-h" :class="title">Notifications</h3>
              <p :class="blurb">
                When the hub isn't open: something sent to you, handed in, didn't work, sent back, gone
                quiet, or stuck on you. Per device.
              </p>
            </div>
            <HubPushSettings />
          </section>

          <section id="cleanup" :class="sec" aria-labelledby="cleanup-h">
            <div :class="secHead">
              <h3 id="cleanup-h" :class="title">Clean-up</h3>
              <p :class="blurb">What Passalong removes by itself, and when.</p>
            </div>
            <HubRetention />
          </section>
        </div>

        <div v-else-if="tab === 'plan'" :class="band">
          <h2 :class="bandLabel">Plan</h2>
          <section id="plan" :class="sec" aria-labelledby="plan-h">
            <div :class="secHead">
              <h3 id="plan-h" :class="title">Your plan</h3>
              <p :class="blurb">Your own plan, separate from any team you're in. A team's plan is on its card below.</p>
            </div>
            <HubSolo />
          </section>
        </div>

        <div v-else-if="tab === 'teams'" :class="band">
          <h2 :class="bandLabel">Teams</h2>
          <section :class="sec" aria-label="Your teams">
            <HubTeamList />
          </section>
        </div>

        <div v-else :class="band">
          <h2 :class="bandLabel">Connections</h2>

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

          <section id="alerts" :class="sec" aria-labelledby="alerts-h">
            <div :class="secHead">
              <h3 id="alerts-h" :class="title">Alerts by email</h3>
              <p :class="blurb">
                An address for your error alerts. Each alert becomes a Draft task; mark it Ready and an
                agent can take it.
              </p>
            </div>
            <HubAlertInbox />
          </section>
        </div>
      </div>
    </div>
  </HubShell>
</template>
