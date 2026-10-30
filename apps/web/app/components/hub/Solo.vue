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
  queryFn: () => api<{ mode: string }>("/v1/billing"),
  enabled: signedIn,
  staleTime: Number.POSITIVE_INFINITY,
});
const available = computed(() => !!modesData.value?.mode && modesData.value.mode !== "unset");
const testing = computed(() => modesData.value?.mode === "test");

const plan = computed(() => data.value.me?.plan ?? "free");
/**
 * When a given plan stops (apps/api/src/gifts.ts). Said plainly rather than left to be discovered
 * on the day it ends: somebody who thinks they bought this would find out by being refused.
 */
const until = computed(() => day(data.value.me?.plan_until));
/** When a bought plan that was cancelled stops. Said, or a cancelled plan looks like it renews. */
const ends = computed(() => day(data.value.me?.plan_ends));
/** Why the ceiling is what it is, which is not always this plan. */
const sync = computed(() => data.value.me?.sync ?? "free");
const onATeamSeat = computed(() => sync.value === "unlimited" && plan.value !== "solo");

const LABEL: Record<string, string> = { free: "Free", solo: "Solo", lapsed: "Payment lapsed" };
const label = computed(() => LABEL[plan.value] ?? "Free");
const used = computed(() => data.value.me?.guides ?? 0);
const limit = computed(() => data.value.me?.limit ?? 0);
/** Paid for by a subscription, rather than given: only then is there a billing page to open. */
const paying = computed(() => plan.value === "solo" && !until.value);

/** Leave for a hosted page: Bachs's checkout, or its billing page for a plan already paid for. */
async function go(path: string) {
  busy.value = true;
  try {
    const out = await api<{ url: string }>(path, json("POST", {}));
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
  <div class="flex flex-col">
    <HubSettingRow label="Plan">
      <p class="m-0 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span class="font-medium text-fg">{{ label }}</span>
        <!-- Read off the key, never a setting beside it: a sandbox key takes no real money. -->
        <span v-if="testing" class="rounded-1 border border-warn px-1.5 font-ui text-xs font-medium text-warn">Test mode · no real money is charged</span>
      </p>
      <p v-if="plan === 'solo'" class="m-0 max-w-[44rem] text-muted">
        You can keep as much work as you like, on every device you use, and connect your own
        assistants to them.
      </p>
      <p v-else-if="plan === 'lapsed'" class="m-0 max-w-[44rem] text-muted">
        Nothing has been taken away: all your work is still here and still yours. New work past the
        free limit has to wait until you renew.
      </p>
      <!-- The case that would otherwise read as a contradiction: Free here, no limit anywhere else.
           Saying which one is doing the lifting is the whole point of showing both. -->
      <p v-else-if="onATeamSeat" class="m-0 max-w-[44rem] text-muted">
        You're in a paid team, so you can already keep as much work as you like. Solo is for when
        you're not.
      </p>
      <!-- Careful with the tense: an account reaches this state by a plan lapsing as well as by
           arriving without one, so it may well have work already synced. -->
      <p v-else-if="sync === 'none'" class="m-0 max-w-[44rem] text-muted">
        New work can't be sent until you're on a plan. Work you already have stays where it is.
      </p>
      <p v-else class="m-0 text-muted">Solo removes the limit on work.</p>
    </HubSettingRow>

    <HubSettingRow v-if="plan !== 'solo' && !onATeamSeat && sync === 'free'" label="Work" hint="Archived work takes up no room.">
      <p class="m-0 flex max-w-sm justify-between text-muted tabular-nums">
        <span><b class="font-medium text-fg">{{ used }}</b> of {{ limit }} pieces of work</span>
        <span>{{ Math.max(0, limit - used) }} left</span>
      </p>
      <!-- A bar, because "18 of 25" is a distance to a wall and reads faster as one. -->
      <div
        class="h-1 max-w-sm overflow-hidden rounded-1 bg-line"
        role="meter"
        :aria-valuenow="used"
        aria-valuemin="0"
        :aria-valuemax="limit"
        aria-label="Work used"
      >
        <div
          class="h-full"
          :class="used >= limit ? 'bg-danger' : used >= limit * 0.8 ? 'bg-warn' : 'bg-fg'"
          :style="{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }"
        />
      </div>
    </HubSettingRow>

    <!-- When it stops, said plainly rather than left to be discovered on the day it ends. -->
    <HubSettingRow v-if="until" label="Given until">
      <p class="m-0 text-fg tabular-nums">{{ until }}</p>
      <p class="m-0 max-w-[44rem] text-muted">
        It was given to you and lapses then. Nothing is taken away; new work past the free limit waits
        until you subscribe.
      </p>
    </HubSettingRow>
    <HubSettingRow v-else-if="ends" label="Ends on">
      <p class="m-0 text-fg tabular-nums">{{ ends }}</p>
      <p class="m-0 max-w-[44rem] text-muted">
        You cancelled it, so it won't renew. Nothing is taken away then, and new work past the free
        limit waits until you subscribe again. To keep it, open Manage billing.
      </p>
    </HubSettingRow>

    <HubSettingRow label="Billing" hint="Paid through Bachs, on its own page: Passalong never sees your card.">
      <p v-if="!available" class="m-0 text-muted">Paid plans aren't available yet. Check back later.</p>
      <div v-else-if="paying" class="flex flex-wrap items-center gap-3">
        <button class="btn primary sm" type="button" :disabled="busy" @click="go('/v1/billing/portal')">Manage billing</button>
        <span class="text-muted">Card, invoices and cancelling.</span>
      </div>
      <!-- A gift is still a plan you do not own: the button stays, so it can be bought before the
           gift runs out rather than after it has. -->
      <div v-else class="flex flex-wrap items-center gap-3">
        <button class="btn primary sm" type="button" :disabled="busy" @click="go('/v1/subscribe')">
          {{ plan === "lapsed" ? "Renew Solo" : "Subscribe to Solo" }}
        </button>
        <span class="text-muted tabular-nums">$5 a month.</span>
      </div>
    </HubSettingRow>
  </div>
</template>
