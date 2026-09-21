<!--
  Every team you are in, each as one card: its people, its groups, its channels and its plan.

  The plan used to be its own section above the teams, so changing seats and seeing who fills them
  were two places on the page. They are tabs of the same team now. Groups and channels are owners
  only — a channel is a credential for a room — and their tabs say what needs attention, so a
  failing webhook or a group nobody is in is visible before the tab is opened.

  One call per team, in parallel, under the same keys the plan block and the write form use.
-->
<script setup lang="ts">
import { useQueries } from "@tanstack/vue-query";
import type { TeamDetail } from "~/types/hub";

const { data, api, json, scope, createTeam, signedIn } = useHub();
const router = useRouter();
const { teamTab } = useSettingsUi();
const extras = useTeamExtras();

const teams = computed(() => data.value.me?.teams || []);

// Same reason as the token name: a `prompt()` throws where dialogs are blocked.
const naming = ref(false);
const name = ref("");
const field = ref<HTMLInputElement | null>(null);

async function ask() {
  naming.value = true;
  name.value = "";
  await nextTick();
  field.value?.focus();
}

async function make() {
  if (!name.value.trim()) return;
  await createTeam(name.value);
  naming.value = false;
  name.value = "";
}

const detailQueries = useQueries({
  queries: computed(() =>
    teams.value.map((t) => ({
      queryKey: hubKeys.team(t.slug),
      queryFn: async () =>
        (await api<TeamDetail>(`/v1/teams/${encodeURIComponent(t.slug)}`)) as TeamDetail,
      enabled: signedIn.value,
    })),
  ),
});
const details = computed(
  () => detailQueries.value.map((q) => q.data).filter(Boolean) as TeamDetail[],
);
const loadingDetails = computed(() => detailQueries.value.some((q) => q.isPending));

const extrasFor = (slug: string) => extras.value.find((e) => e.slug === slug);

interface Tab {
  id: string;
  label: string;
  note: string;
  tone: "" | "warn" | "bad";
}

function tabsFor(t: TeamDetail): Tab[] {
  const tabs: Tab[] = [{ id: "people", label: "People", note: String(t.members.length), tone: "" }];
  if (t.role === "owner") {
    const x = extrasFor(t.slug);
    const empty = x?.groups.filter((g) => !g.members.length).length ?? 0;
    const failing = x?.channels.filter((c) => c.failures).length ?? 0;
    tabs.push({
      id: "groups",
      label: "Groups",
      note: empty ? `${empty} empty` : String(x?.groups.length ?? ""),
      tone: empty ? "warn" : "",
    });
    tabs.push({
      id: "channels",
      label: "Channels",
      note: failing ? `${failing} failing` : String(x?.channels.length ?? ""),
      tone: failing ? "bad" : "",
    });
  }
  const seats =
    t.plan === "team" && t.seats
      ? `${t.members.length} of ${t.seats} seats`
      : t.plan === "lapsed"
        ? "lapsed"
        : "free";
  tabs.push({ id: "plan", label: "Plan", note: seats, tone: t.plan === "lapsed" ? "warn" : "" });
  return tabs;
}

const current = (t: TeamDetail) => {
  const want = teamTab.value[t.slug] || "people";
  return tabsFor(t).some((x) => x.id === want) ? want : "people";
};
const pick = (slug: string, id: string) => {
  teamTab.value = { ...teamTab.value, [slug]: id };
};

function arrowTabs(e: KeyboardEvent, t: TeamDetail) {
  const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
  if (!step) return;
  const tabs = tabsFor(t);
  const i = tabs.findIndex((x) => x.id === current(t));
  const next = tabs[(i + step + tabs.length) % tabs.length]!;
  pick(t.slug, next.id);
  nextTick(() => document.getElementById(`tab-${t.slug}-${next.id}`)?.focus());
}

/** One click: mint a link and put it on the clipboard. Nobody wants to read it. */
async function invite(t: TeamDetail, el: EventTarget | null) {
  const made = await api<{ url: string }>(
    `/v1/teams/${encodeURIComponent(t.slug)}/invites`,
    json("POST"),
  );
  if (made) copy(made.url, el);
}

function guides(t: TeamDetail) {
  scope.value = t.slug;
  router.push("/hub");
}

const initials = (label: string) =>
  label
    .replace(/^@/, "")
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
</script>

<template>
  <div class="flex flex-col gap-4">
    <HubSkeleton v-if="loadingDetails && !details.length" variant="lines" :rows="3" label="Loading your teams" />

    <article
      v-for="t in details"
      :id="`team-${t.slug}`"
      :key="t.slug"
      class="scroll-mt-6 rounded-2 bg-raised shadow-edge"
    >
      <!-- A div, not <header>: the global header rule adds its own padding and margin, and it
           outranks utility classes — it put a gap above the tabs. -->
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div class="min-w-0">
          <h3 class="m-0 font-ui text-base font-semibold text-fg">{{ t.name || t.slug }}</h3>
          <p class="m-0 font-ui text-sm text-muted">
            {{ t.role === "owner" ? "You own it" : "You're a member" }} · {{ plural(t.members.length, "person").replace("persons", "people") }} ·
            {{ plural(t.guides, "guide") }}
          </p>
        </div>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <button class="btn sm" @click="invite(t, $event.currentTarget)">
            <AppIcon name="copy" /><span data-label>Copy invite link</span>
          </button>
          <button class="btn sm" @click="guides(t)">See its guides</button>
        </div>
      </div>

      <div class="flex gap-1 overflow-x-auto border-b border-line px-3" role="tablist" :aria-label="t.name || t.slug" @keydown="arrowTabs($event, t)">
        <button
          v-for="tab in tabsFor(t)"
          :id="`tab-${t.slug}-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="current(t) === tab.id"
          :aria-controls="`panel-${t.slug}-${tab.id}`"
          :tabindex="current(t) === tab.id ? 0 : -1"
          class="-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-2.5 py-2.5 font-ui text-sm whitespace-nowrap"
          :class="current(t) === tab.id ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg'"
          @click="pick(t.slug, tab.id)"
        >
          {{ tab.label }}
          <small
            v-if="tab.note"
            class="ml-1 text-xs"
            :class="tab.tone === 'bad' ? 'text-danger' : tab.tone === 'warn' ? 'text-warn' : 'text-muted'"
          >{{ tab.note }}</small>
        </button>
      </div>

      <div :id="`panel-${t.slug}-${current(t)}`" role="tabpanel" :aria-labelledby="`tab-${t.slug}-${current(t)}`" class="px-4 pt-2 pb-4">
        <ul v-if="current(t) === 'people'" class="m-0 flex list-none flex-col p-0">
          <li
            v-for="m in t.members"
            :key="m.handle || m.joined"
            class="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
          >
            <span class="grid size-7 shrink-0 place-items-center rounded-pill border border-line bg-surface font-ui text-xs font-semibold text-muted" aria-hidden="true">
              {{ initials(m.display || personName(m.name, m.handle)) }}
            </span>
            <span class="min-w-0 grow font-ui text-sm text-fg">
              {{ m.display || personName(m.name, m.handle) }}
              <span class="block text-xs text-muted">
                {{ m.handle ? `@${m.handle}` : "no @name yet" }} · {{ m.role }} · joined {{ rel(m.joined) }}
              </span>
            </span>
          </li>
        </ul>
        <HubTeamGroups v-else-if="current(t) === 'groups'" :team="t" />
        <HubTeamChannel v-else-if="current(t) === 'channels'" :team="t" />
        <div v-else class="pt-2"><HubPlan :slug="t.slug" /></div>
      </div>
    </article>

    <p v-if="!teams.length" class="m-0 font-ui text-sm text-muted">
      No team yet. A team is the people you send guides to.
    </p>

    <form v-if="naming" id="new-team" class="flex flex-wrap items-end gap-3" @submit.prevent="make">
      <div class="grow basis-64">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="team-name">Name your team</label>
        <input id="team-name" ref="field" v-model="name" class="w-full" placeholder="Name it after the people, e.g. Checkout squad" required>
      </div>
      <button class="btn primary" type="submit" :disabled="!name.trim()">Create team</button>
      <button class="btn" type="button" @click="naming = false">Cancel</button>
    </form>
    <button v-else id="new-team" class="btn sm self-start" @click="ask"><AppIcon name="plus" />New team</button>
  </div>
</template>
