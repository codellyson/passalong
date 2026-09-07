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

// An account with nothing on its board is not looking at a board. Guides are only created by
// `share()`, so the empty hub cannot explain itself — it hands over the two things that lead
// somewhere instead, and takes the heading with it.
const first = computed(() => Boolean(data.value.me) && data.value.guides.length === 0);
const claimed = computed(() => Boolean(data.value.me?.handle));

const heading = computed(() =>
  first.value ? `${claimed.value ? "One step" : "Two steps"} to a working board` : "Your transfers",
);

const standing = computed(() =>
  claimed.value
    ? "Nothing is on your board yet."
    : "Nothing is on your board yet, and nothing can be addressed to you until you have a handle.",
);
</script>

<template>
  <HubShell :heading="heading">
    <template v-if="first" #sub>{{ standing }}</template>

    <!-- A token-only account cannot sign in from any other browser. That is true whether or not
         the board is empty, so it sits above whichever of the two this page is showing. -->
    <HubClaim />

    <HubFirstRun v-if="first" />

    <template v-else>
      <HubBoard />
      <HubActivity />
    </template>

  </HubShell>
</template>
