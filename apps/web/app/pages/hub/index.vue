<!--
  Home: the hub's overview. The four counts from the Work page, each opening its tab there; how
  Passalong works; and the activity feed. The lists themselves are /hub/work.

  `/hub` was the Work page, so links carrying a work query (`?tab=`, `?q=`, `?follows=`,
  `?done=1`) are still out in the world. They go on to /hub/work with that query. `?verified=` and
  `?forgot=` are the shell's and stay here.
-->
<script setup lang="ts">
// Inline: definePageMeta is lifted out of this script and cannot see its variables.
definePageMeta({
  middleware: (to) => {
    if (["tab", "q", "follows", "done"].some((k) => k in to.query))
      return navigateTo({ path: "/hub/work", query: to.query }, { replace: true });
  },
});

usePage({
  title: "Home · Passalong",
  description: "What needs you, who is working on what, and how Passalong works.",
  noindex: true,
});

const { updating, scopeChanging } = useHub();
const none = ref("");
const { unavailable, waiting, first, hasTeams, needsCount, workingCount, openCount, doneCount } =
  useWorkLists(none, none);

const stats = computed(() => [
  { label: "Needs you", count: needsCount.value, tab: "needs", hint: "Reviews and replies" },
  { label: "Being worked on", count: workingCount.value, tab: "working", hint: "Held by people or agents" },
  { label: "Open", count: openCount.value, tab: "open", hint: "Ready and waiting" },
  { label: "Done", count: doneCount.value, tab: "done", hint: "Completed work" },
]);
</script>

<template>
  <HubShell :heading="first ? 'Get started' : ''">
    <HubFirstRun v-if="first" />

    <div v-else class="flex flex-col gap-6">
      <h1 class="m-0 flex flex-wrap items-center gap-2 text-h2">
        Home<template v-if="hasTeams"> in <HubScopes /></template>
        <span v-if="updating || scopeChanging" role="status" class="font-ui text-sm font-normal text-muted">Updating…</span>
      </h1>

      <!-- A failed list draws no counts rather than zeroes: the shell's banner offers Try again. -->
      <nav v-if="!unavailable" aria-label="Work overview" class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <NuxtLink
          v-for="s in stats"
          :key="s.tab"
          :to="{ path: '/hub/work', query: { tab: s.tab } }"
          class="flex flex-col gap-1 rounded-3 bg-raised px-4 py-3 text-fg no-underline shadow-edge transition-transform active:scale-[0.96]"
        >
          <span class="font-ui text-xs font-semibold uppercase tracking-widest text-muted">{{ s.label }}</span>
          <span class="font-ui text-2xl font-semibold tabular-nums">{{ waiting ? "—" : s.count }}</span>
          <span class="font-ui text-xs text-muted">{{ s.hint }}</span>
        </NuxtLink>
      </nav>

      <HubFeatureMap open />

      <HubActivity />
    </div>
  </HubShell>
</template>
