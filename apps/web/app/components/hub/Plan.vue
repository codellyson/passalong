<!--
  What a team's plan is, and the two things its owner can do about it.

  No card form and no pricing table. Both providers hand back a hosted page, which is the whole
  reason this product never sees a card number — so the control here is a button that leaves, and
  the screen it leaves for is theirs.

  The test-mode badge is not decoration. It is read off the configured key rather than from a
  setting beside it, because the failure this prevents — weeks of cheerful test payments that were
  never real — is silent from in here, and the only moment anyone would notice is the one where
  they look at this screen.
-->
<script setup lang="ts">
import type { TeamDetail } from "~/types/hub";

/**
 * Named by slug rather than handed a team, because the plan section lists every team you are in and
 * the hub only holds the details of the one currently in scope. Fetching its own is what lets this
 * appear without anybody first selecting a scope chip — the section is called "Plan", and somebody
 * arriving to pay for a team should not have to find it by narrowing the page first.
 */
const props = defineProps<{ slug: string }>();

const { api, json, load, error } = useHub();

const team = ref<TeamDetail | null>(null);
const modes = ref<{ stripe: string; paystack: string } | null>(null);
const seats = ref("1");
const busy = ref(false);

/** Which providers this deployment can take money with, and the team this block is about. */
onMounted(async () => {
  const [m, t] = await Promise.all([
    api<{ stripe: string; paystack: string }>("/v1/billing").catch(() => null),
    api<TeamDetail>(`/v1/teams/${encodeURIComponent(props.slug)}`).catch(() => null),
  ]);
  modes.value = m;
  team.value = t;
  if (t) seats.value = String(t.seats || t.members.length || 1);
});

const available = computed(() =>
  (["stripe", "paystack"] as const).filter((p) => modes.value?.[p] && modes.value[p] !== "unset"),
);
/** Any configured key in test mode makes this a test deployment; say so once, loudly. */
const testing = computed(() => available.value.some((p) => modes.value?.[p] === "test"));

const owner = computed(() => team.value?.role === "owner");
const members = computed(() => team.value?.members.length ?? 0);

interface PlanCopy {
  label: string;
  tone: string;
  says: string;
}

const FREE: PlanCopy = {
  label: "Free",
  tone: "bg-surface text-muted",
  says: "Each member keeps their own ceiling on synced guides.",
};

const PLANS: Record<string, PlanCopy> = {
  free: FREE,
  team: {
    label: "Paid",
    tone: "bg-ok-soft text-ok",
    says: "Every member publishes without a ceiling, including members who never paid.",
  },
  lapsed: {
    label: "Read-only",
    tone: "bg-warn-soft text-warn",
    says: "The subscription lapsed. Everything in the team can still be read, pulled and answered; what stops is handing over anything new and anyone new joining.",
  },
};
const plan = computed<PlanCopy>(() => (team.value ? (PLANS[team.value.plan] ?? FREE) : FREE));

async function subscribe(provider: string) {
  busy.value = true;
  try {
    const out = await api<{ url: string }>(
      `/v1/teams/${encodeURIComponent(props.slug)}/subscribe`,
      json("POST", { provider, seats: Number(seats.value) || 1 }),
    );
    // Their page, not ours. Same tab: coming back is what the success URL is for, and a popup is
    // the thing a browser is most likely to swallow.
    if (out?.url) location.href = out.url;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function changeSeats() {
  busy.value = true;
  try {
    await api(
      `/v1/teams/${encodeURIComponent(props.slug)}/seats`,
      json("PATCH", { seats: Number(seats.value) || 1 }),
    );
    // The seat count this shows is the one the provider confirmed, so the page waits for the
    // webhook rather than displaying the number that was asked for.
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="team" class="flex flex-col gap-4">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <b class="font-ui text-sm font-semibold text-fg">{{ team.name }}</b>
      <span
        class="rounded-pill px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
        :class="plan.tone"
      >{{ plan.label }}</span>
      <span v-if="team.plan === 'team'" class="font-code text-sm text-muted">
        {{ members }} of {{ team.seats }} seats used
      </span>
      <span
        v-if="testing"
        class="rounded-pill bg-warn-soft px-2 py-0.5 font-code text-xs font-semibold text-warn"
      >test mode — no real money moves</span>
    </div>

    <p class="m-0 font-ui text-sm text-muted">{{ plan.says }}</p>

    <p v-if="!available.length" class="m-0 font-ui text-sm text-muted">
      No payment provider is configured on this deployment, so there is nothing to subscribe to yet.
    </p>

    <template v-else-if="owner">
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label class="mb-2 block font-ui text-sm font-medium text-fg" for="plan-seats">Seats</label>
          <input
            id="plan-seats"
            v-model="seats"
            class="w-24"
            type="number"
            min="1"
            inputmode="numeric"
          />
        </div>
        <template v-if="team.plan === 'team'">
          <button class="btn primary" :disabled="busy" @click="changeSeats">Change seats</button>
        </template>
        <template v-else>
          <button
            v-for="p in available"
            :key="p"
            class="btn primary"
            :disabled="busy"
            @click="subscribe(p)"
          >
            {{ team.plan === "lapsed" ? "Renew" : "Subscribe" }} with {{ p }}
          </button>
        </template>
      </div>
      <!-- Said before the refusal, because the refusal happens after a round trip and the number
           that causes it is already on screen. -->
      <p class="m-0 font-ui text-sm text-muted">
        A seat for everyone in the team: {{ members }} today. Dropping below that needs someone to
        leave first.
      </p>
    </template>

    <p v-else class="m-0 font-ui text-sm text-muted">
      Only {{ team.name }}'s owner can change its plan.
    </p>
  </div>
</template>
