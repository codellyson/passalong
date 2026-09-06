<!--
  The board. What is waiting on you, what you handed over, and what has happened since — and
  nothing else: no credentials, no team administration, no list of every guide you have ever
  synced. The brief's own account of this screen is that it is a glance, opened next to a terminal
  and closed again, and the four panels that used to sit under it were the reason it could not be.
-->
<script setup lang="ts">
usePage({
  title: "Passalong hub",
  description: "Your synced transfer guides.",
  noindex: true,
});

const { data } = useHub();

const teams = computed(() => data.value.me?.teams || []);
</script>

<template>
  <HubShell>
    <!-- Two states that stop the product working stay on the board rather than moving to settings:
         without a handle nothing can be addressed to you, and a token-only account cannot sign in
         from anywhere else. Both are answered here and then never seen again. -->
    <HubClaim />
    <HubIdentity />

    <HubBoard />
    <HubActivity />

    <!-- An account with no team has an empty hub by design: guides are only created by `share()`,
         and the hub has no editor. So the empty state hands over the two things that actually lead
         somewhere rather than dead-ending. -->
    <div v-if="data.me && data.guides.length === 0" class="empty">
      <p>Nothing synced yet. After your next finished piece of work:</p>
      <pre><code>passalong share</code></pre>
      <p>or say <em>“pass this along”</em> to Claude Code.</p>
      <template v-if="!teams.length">
        <p>Waiting on someone else's work instead? Paste the invite link they sent you:</p>
        <HubInvitePaste label="invite link" />
      </template>
    </div>
  </HubShell>
</template>
