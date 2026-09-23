<!--
  Running Passalong: the platform owner's page, and the only one in the product that is not about
  somebody's guides.

  It was a band inside Settings, which was the wrong room. Settings is what a customer keeps about
  themselves — their profile, their plan, their teams, their tokens — and comping another account
  is not a setting of theirs; it is the business being run. Sitting next to a team's own owner and
  member roles, it also read as one more of those, which it is not.

  So it is its own address. Reached from the account menu, by a super and nobody else: every route
  it calls answers 404 to anyone without the role (apps/api/src/gifts.ts), and a customer who types
  /admin is sent back to their work rather than shown a door they cannot open.
-->
<script setup lang="ts">
usePage({
  title: "Admin · Passalong",
  description: "Plans given away, and who runs Passalong.",
  noindex: true,
});

const { data, loading } = useHub();
const isSuper = computed(() => data.value.me?.role === "super");
/** `loading` is per endpoint; this page waits on exactly one of them. */
const pending = computed(() => loading.value.me);

// Sent away rather than refused: somebody who is not a super has no business knowing the page is
// here, and the server would refuse every call this page makes anyway. Only once the account has
// actually arrived — redirecting while it is still on its way would bounce the operator on a slow
// first paint, and `loading` being an object meant an earlier version of this never fired at all.
watchEffect(() => {
  if (!pending.value && data.value.me && !isSuper.value) navigateTo("/hub");
});
</script>

<template>
  <HubShell>
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header v-if="isSuper || pending">
        <h1 class="m-0">Admin</h1>
        <p class="mt-2 mb-0 font-ui text-sm text-muted">
          Plans given away, and who runs Passalong. Nobody else can see this page, and a plan given
          here costs the person nothing — it is not a subscription, and each one ends on its date.
        </p>
      </header>

      <HubSkeleton v-if="pending" variant="lines" :rows="3" label="Loading admin" />
      <HubAdmin v-else-if="isSuper" />
    </div>
  </HubShell>
</template>
