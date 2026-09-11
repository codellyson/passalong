<!--
  This account's own plan, which is a different fact from what it may sync.

  A member of a paid team publishes without a ceiling and is still on `free` themselves — so this
  block says what *you* are paying for, and the sentence under it says why that may not be what is
  currently lifting your ceiling. Without that distinction somebody on a teammate's seat would be
  shown "Free" beside an unlimited hub and reasonably conclude one of the two was lying.
-->
<script setup lang="ts">
const { data, api, json, error } = useHub();

const modes = ref<{ stripe: string; paystack: string } | null>(null);
const busy = ref(false);

onMounted(async () => {
  modes.value = await api<{ stripe: string; paystack: string }>("/v1/billing").catch(() => null);
});

const available = computed(() =>
  (["stripe", "paystack"] as const).filter((p) => modes.value?.[p] && modes.value[p] !== "unset"),
);
const testing = computed(() => available.value.some((p) => modes.value?.[p] === "test"));

const plan = computed(() => data.value.me?.plan ?? "free");
/** Why the ceiling is what it is, which is not always this plan. */
const sync = computed(() => data.value.me?.sync ?? "free");
const onATeamSeat = computed(() => sync.value === "unlimited" && plan.value !== "solo");

const COPY: Record<string, { label: string; tone: string }> = {
  free: { label: "Free", tone: "bg-surface text-muted" },
  solo: { label: "Solo", tone: "bg-ok-soft text-ok" },
  lapsed: { label: "Lapsed", tone: "bg-warn-soft text-warn" },
};
const badge = computed(() => COPY[plan.value] ?? COPY.free);

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
        class="rounded-pill bg-warn-soft px-2 py-0.5 font-code text-xs font-semibold text-warn"
      >test mode — no real money moves</span>
    </div>

    <p v-if="plan === 'solo'" class="m-0 font-ui text-sm text-muted">
      Your guides sync across your machines with no ceiling, and you have an MCP endpoint of your
      own.
    </p>
    <p v-else-if="plan === 'lapsed'" class="m-0 font-ui text-sm text-muted">
      Your Solo subscription lapsed. Nothing has been taken away — every guide you have synced is
      still there and still yours to export; what stops is adding new ones beyond your ceiling.
    </p>
    <!-- The case that would otherwise read as a contradiction: Free on the badge, no limit in the
         footer. Saying which one is doing the lifting is the whole point of showing both. -->
    <p v-else-if="onATeamSeat" class="m-0 font-ui text-sm text-muted">
      You are on a seat in a paid team, so your guides already sync without a ceiling. Solo is for
      when that is no longer true.
    </p>
    <!-- Careful with the tense: an account reaches this state by a plan lapsing as well as by
         arriving without one, so it may well have guides already synced. Saying "nothing is synced"
         would be false for exactly the person most likely to be reading it. -->
    <p v-else-if="sync === 'none'" class="m-0 font-ui text-sm text-muted">
      New guides will not sync until this account is on a plan. What is already synced stays, and
      everything local still works — <code>passalong share</code> writes to this machine with or
      without one.
    </p>
    <p v-else class="m-0 font-ui text-sm text-muted">
      You are on the free ceiling: {{ data.me?.limit }} synced guides. Solo removes it.
    </p>

    <p v-if="!available.length" class="m-0 font-ui text-sm text-muted">
      No payment provider is configured on this deployment, so there is nothing to subscribe to yet.
    </p>
    <div v-else-if="plan !== 'solo'" class="flex flex-wrap gap-2">
      <button
        v-for="p in available"
        :key="p"
        class="btn primary"
        :disabled="busy"
        @click="subscribe(p)"
      >
        {{ plan === "lapsed" ? "Renew" : "Subscribe" }} with {{ p }}
      </button>
    </div>
  </div>
</template>
