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
/** Named by the deployment, rather than given the role by another admin. See apps/api/src/gifts.ts. */
const canMakeSupers = computed(() => data.value.me?.can_make_supers === true);
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
          Plans given away, and who runs Passalong. Nobody else can see this page. A plan given here
          costs the person nothing and ends on its date.
        </p>
        <!-- Why you can see this, and therefore what you can do on it. The two routes to being an
             admin permit different things, and an operator who cannot tell which one they have
             reads a missing button as a bug. -->
        <p v-if="isSuper" class="mt-3 mb-0 font-ui text-sm text-muted">
          You are here as
          <code class="font-code text-xs text-fg">{{ data.me?.account }}</code
          >{{ data.me?.handle ? ` · @${data.me.handle}` : "" }}.
          {{
            canMakeSupers
              ? "This deployment names your account in ADMIN_ACCOUNTS, so you can add and remove admins as well as give plans."
              : "Another admin gave this account the role, so you can give plans. Adding or removing an admin is only for an account the deployment names in ADMIN_ACCOUNTS."
          }}
        </p>
      </header>

      <HubSkeleton v-if="pending" variant="lines" :rows="3" label="Loading admin" />
      <HubAdmin v-else-if="isSuper" />
    </div>
  </HubShell>
</template>
