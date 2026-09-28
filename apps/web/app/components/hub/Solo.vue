<!--
  This account's own plan, which is a different fact from what it may sync.

  A member of a paid team publishes without a ceiling and is still on `free` themselves — so this
  block says what *you* are paying for, and the sentence under it says why that may not be what is
  currently lifting your ceiling. Without that distinction somebody on a teammate's seat would be
  shown "Free" beside an unlimited hub and reasonably conclude one of the two was lying.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";

const { data, api, json, error, signedIn } = useHub();

const busy = ref(false);

/** Shared with each team's plan block: one fetch, and it only changes with a deploy. */
const { data: modesData } = useQuery({
  queryKey: hubKeys.billing,
  queryFn: () => api<{ stripe: string; paystack: string }>("/v1/billing"),
  enabled: signedIn,
  staleTime: Number.POSITIVE_INFINITY,
});
const modes = computed(() => modesData.value ?? null);

const available = computed(() =>
  (["stripe", "paystack"] as const).filter((p) => modes.value?.[p] && modes.value[p] !== "unset"),
);
const testing = computed(() => available.value.some((p) => modes.value?.[p] === "test"));

const plan = computed(() => data.value.me?.plan ?? "free");
/**
 * When a given plan stops (apps/api/src/gifts.ts). Said plainly rather than left to be discovered
 * on the day it ends: somebody who thinks they bought this would find out by being refused.
 */
const until = computed(() => day(data.value.me?.plan_until));
/** Why the ceiling is what it is, which is not always this plan. */
const sync = computed(() => data.value.me?.sync ?? "free");
const onATeamSeat = computed(() => sync.value === "unlimited" && plan.value !== "solo");

const COPY: Record<string, { label: string; tone: string }> = {
  free: { label: "Free", tone: "bg-surface text-muted" },
  solo: { label: "Solo", tone: "bg-ok-soft text-ok" },
  lapsed: { label: "Payment lapsed", tone: "bg-warn-soft text-warn" },
};
const badge = computed(() => COPY[plan.value] ?? COPY.free);
/** The provider as its own brand writes it, not the id this app stores it under. */
const PROVIDER: Record<string, string> = { stripe: "Stripe", paystack: "Paystack" };

async function subscribe(provider: string) {
  busy.value = true;
  try {
    const out = await api<{ url: string }>("/v1/subscribe", json("POST", { provider }));
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
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <span
        class="rounded-pill px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
        :class="badge?.tone"
      >{{ badge?.label }}</span>
      <span
        v-if="testing"
        class="rounded-pill bg-warn-soft px-2 py-0.5 font-ui text-xs font-semibold text-warn"
      >Test mode: no real money is charged</span>
    </div>

    <p v-if="plan === 'solo'" class="m-0 font-ui text-sm text-muted">
      You can keep as many guides as you like, on every device you use, and connect your own
      assistants to them.<template v-if="until">
        {{ " " }}This one was given to you and runs until {{ until }}, after which it lapses —
        nothing is taken away, and new guides past the free limit wait until you subscribe.
      </template>
    </p>
    <p v-else-if="plan === 'lapsed'" class="m-0 font-ui text-sm text-muted">
      Your Solo plan has lapsed. Nothing has been taken away: every guide is still here and still
      yours. New guides past the free limit have to wait until you renew.
    </p>
    <!-- The case that would otherwise read as a contradiction: Free on the badge, no limit in the
         footer. Saying which one is doing the lifting is the whole point of showing both. -->
    <p v-else-if="onATeamSeat" class="m-0 font-ui text-sm text-muted">
      You're in a paid team, so you can already keep as many guides as you like. Solo is for when
      you're not.
    </p>
    <!-- Careful with the tense: an account reaches this state by a plan lapsing as well as by
         arriving without one, so it may well have guides already synced. Saying "nothing is synced"
         would be false for exactly the person most likely to be reading it. -->
    <p v-else-if="sync === 'none'" class="m-0 font-ui text-sm text-muted">
      New guides can't be sent until you're on a plan. Guides you already have stay where they are.
    </p>
    <div v-else class="flex max-w-md flex-col gap-2">
      <div class="flex justify-between font-ui text-sm text-muted tabular-nums">
        <span><b class="font-semibold text-fg">{{ data.me?.guides }}</b> of {{ data.me?.limit }} guides</span>
        <span>{{ Math.max(0, (data.me?.limit ?? 0) - (data.me?.guides ?? 0)) }} left</span>
      </div>
      <!-- A bar, because "18 of 25" is a distance to a wall and reads faster as one. -->
      <div
        class="h-1.5 overflow-hidden rounded-pill bg-line"
        role="meter"
        :aria-valuenow="data.me?.guides"
        aria-valuemin="0"
        :aria-valuemax="data.me?.limit"
        aria-label="Guides used"
      >
        <div
          class="h-full rounded-pill"
          :class="
            (data.me?.guides ?? 0) >= (data.me?.limit ?? 1)
              ? 'bg-danger'
              : (data.me?.guides ?? 0) >= (data.me?.limit ?? 1) * 0.8
                ? 'bg-warn'
                : 'bg-accent'
          "
          :style="{ width: `${Math.min(100, ((data.me?.guides ?? 0) / Math.max(1, data.me?.limit ?? 1)) * 100)}%` }"
        />
      </div>
      <p class="m-0 font-ui text-sm text-muted">You're on the free plan. Solo removes the limit.</p>
    </div>

    <p v-if="!available.length" class="m-0 font-ui text-sm text-muted">
      Paid plans aren't available yet. Check back later.
    </p>
    <!-- A gift is still a plan you do not own: the button stays, so it can be bought before the
         gift runs out rather than after it has. -->
    <div v-else-if="plan !== 'solo' || until" class="flex flex-wrap gap-2">
      <button
        v-for="p in available"
        :key="p"
        class="btn primary"
        :disabled="busy"
        @click="subscribe(p)"
      >
        {{ plan === "lapsed" ? "Renew" : "Subscribe" }} with {{ PROVIDER[p] || p }}
      </button>
    </div>
  </div>
</template>
