<!--
  What a team's plan is, and the two things its owner can do about it.

  No card form and no pricing table. Bachs hands back a hosted page, which is the whole
  reason this product never sees a card number — so the control here is a button that leaves, and
  the screen it leaves for is theirs.

  The test-mode badge is not decoration. It is read off the configured key rather than from a
  setting beside it, because the failure this prevents — weeks of cheerful test payments that were
  never real — is silent from in here, and the only moment anyone would notice is the one where
  they look at this screen.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { TeamDetail } from "~/types/hub";

/**
 * Named by slug rather than handed a team, because the plan section lists every team you are in and
 * the hub only holds the details of the one currently in scope. Fetching its own is what lets this
 * appear without anybody first selecting a scope chip — the section is called "Plan", and somebody
 * arriving to pay for a team should not have to find it by narrowing the page first.
 */
const props = defineProps<{ slug: string }>();

const { api, json, error, signedIn } = useHub();

const busy = ref(false);

/** Which providers this deployment can take money with. It changes with a deploy, not a click. */
const { data: modesData } = useQuery({
  queryKey: hubKeys.billing,
  queryFn: () => api<{ mode: string }>("/v1/billing"),
  enabled: signedIn,
  staleTime: Number.POSITIVE_INFINITY,
});

/** Shared with the team list and the write form, so each team is fetched once. */
const { data: teamData, isPending: loadingTeam } = useQuery({
  queryKey: computed(() => hubKeys.team(props.slug)),
  queryFn: async () =>
    (await api<TeamDetail>(`/v1/teams/${encodeURIComponent(props.slug)}`)) as TeamDetail,
  enabled: signedIn,
});
const team = computed(() => teamData.value ?? null);

const available = computed(() => !!modesData.value?.mode && modesData.value.mode !== "unset");
/** A sandbox key makes this a test deployment; say so once, loudly. */
const testing = computed(() => modesData.value?.mode === "test");
/** The Team product is flat: this many people, one price. Bigger teams are set up by hand. */
const TEAM_SEATS = 10;

const owner = computed(() => team.value?.role === "owner");
/** When a cancelled plan stops. Said, or a cancelled plan looks like it renews. */
const ends = computed(() => day(team.value?.plan_ends));
const members = computed(() => team.value?.members.length ?? 0);
/** Who to ask, by name, when you are not the one who can change the plan. */
const ownerName = computed(() => {
  const o = team.value?.members.find((m) => m.role === "owner");
  return o ? o.display || personName(o.name, o.handle) : "";
});

interface PlanCopy {
  label: string;
  says: string;
}

const FREE: PlanCopy = {
  label: "Free",
  says: "Each member has the free plan's limit on work.",
};

const PLANS: Record<string, PlanCopy> = {
  free: FREE,
  team: {
    label: "Team",
    says: "Everyone in the team can send as much work as they like.",
  },
  lapsed: {
    label: "Read-only",
    says: "The plan has lapsed. Everything in the team can still be read and answered; new work and new members have to wait until it's renewed.",
  },
};
const plan = computed<PlanCopy>(() => (team.value ? (PLANS[team.value.plan] ?? FREE) : FREE));

/** Leave for a hosted page: Bachs's checkout, or its billing page for a plan already paid for. */
async function go(path: string, body: Record<string, string> = {}) {
  busy.value = true;
  try {
    const out = await api<{ url: string }>(path, json("POST", body));
    // Their page, not ours. Same tab: coming back is what the success URL is for, and a popup is
    // the thing a browser is most likely to swallow.
    if (out?.url) location.href = out.url;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="team" class="flex flex-col">
    <HubSettingRow label="Plan">
      <p class="m-0 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span class="font-medium text-fg">{{ plan.label }}</span>
        <span v-if="testing" class="rounded-1 border border-warn px-1.5 font-ui text-xs font-medium text-warn">Test mode · no real money is charged</span>
      </p>
      <p class="m-0 max-w-[44rem] text-muted">{{ plan.says }}</p>
    </HubSettingRow>

    <HubSettingRow label="Seats" hint="Counted when somebody joins.">
      <p v-if="team.plan === 'team' && team.seats" class="m-0 text-fg tabular-nums">{{ members }} of {{ team.seats }} used</p>
      <p v-else class="m-0 text-fg tabular-nums">
        {{ members }} {{ members === 1 ? "person" : "people" }}
        <span class="text-muted">· the Team plan covers up to {{ TEAM_SEATS }}</span>
      </p>
    </HubSettingRow>

    <HubSettingRow v-if="team.plan === 'team' && ends" label="Ends on">
      <p class="m-0 text-fg tabular-nums">{{ ends }}</p>
      <p class="m-0 max-w-[44rem] text-muted">
        It was cancelled, so it won't renew. After that the team is read-only until it subscribes
        again<template v-if="owner">; to keep it, open Manage billing</template>.
      </p>
    </HubSettingRow>

    <HubSettingRow label="Billing">
      <p v-if="!available" class="m-0 text-muted">Paid plans aren't available yet. Check back later.</p>
      <template v-else-if="owner">
        <div v-if="team.plan === 'team' && team.subscribed" class="flex flex-wrap items-center gap-3">
          <button class="btn primary sm" type="button" :disabled="busy" @click="go('/v1/billing/portal', { team: props.slug })">Manage billing</button>
          <span class="text-muted">Card, invoices and cancelling.</span>
        </div>
        <p v-else-if="members > TEAM_SEATS" class="m-0 max-w-[44rem] text-muted">
          The Team plan covers {{ TEAM_SEATS }} people and {{ team.name }} has {{ members }}. Write to
          <a href="mailto:support@kreativekorna.com">support@kreativekorna.com</a> and we'll set it up.
        </p>
        <div v-else class="flex flex-wrap items-center gap-3">
          <button class="btn primary sm" type="button" :disabled="busy" @click="go(`/v1/teams/${encodeURIComponent(props.slug)}/subscribe`)">
            {{ team.plan === "lapsed" ? "Renew the Team plan" : "Subscribe to Team" }}
          </button>
          <span class="text-muted tabular-nums">$20 a month for up to {{ TEAM_SEATS }} people.</span>
        </div>
      </template>
      <!-- Owner-only, and absent rather than disabled for everyone else, with who can say. -->
      <p v-else class="m-0 text-muted">
        Only {{ ownerName || `${team.name}'s owner` }} can change {{ team.name }}'s plan. Ask them if
        it needs changing.
      </p>
    </HubSettingRow>
  </div>
  <HubSkeleton v-else-if="loadingTeam" variant="lines" :rows="2" label="Loading the team's plan" />
</template>
