<!--
  The hub's places on a phone, docked along the bottom as in a phone app: Needs you, Projects, the
  box, Work and Support, each a thumb's reach away. Solid ink like the rail it stands in for; the
  current place is coral, with a 2px coral bar along its top edge. Everything else the rail holds
  (Go to id, each project, Settings, you) stays in the drawer behind the top bar's menu.
-->
<script setup lang="ts">
const { needsQ } = useHub();
const route = useRoute();

const waiting = computed(() => needsQ.data.value?.rows.length ?? 0);
type Tab = {
  to: string;
  label: string;
  icon: "inbox" | "project" | "plus" | "board" | "support";
  on: boolean;
  count?: number;
  box?: boolean;
};
const tabs = computed<Tab[]>(() => {
  const p = route.path;
  return [
    { to: "/hub", label: "Needs you", icon: "inbox", on: p === "/hub", count: waiting.value },
    { to: "/hub/projects", label: "Projects", icon: "project", on: p.startsWith("/hub/projects") },
    { to: "/hub/new", label: "New", icon: "plus", on: p === "/hub/new", box: true },
    {
      to: "/hub/work",
      label: "Work",
      icon: "board",
      on: p === "/hub/work" || p.startsWith("/hub/w/"),
    },
    { to: "/hub/support", label: "Support", icon: "support", on: p.startsWith("/hub/support") },
  ];
});
</script>

<template>
  <nav
    aria-label="Places"
    class="fixed inset-x-0 bottom-0 z-30 border-t border-rail-line bg-rail pb-[env(safe-area-inset-bottom)] md:hidden"
  >
    <ul class="m-0 grid h-14 list-none grid-cols-5 p-0">
      <li v-for="t in tabs" :key="t.to" class="m-0">
        <NuxtLink
          :to="t.to"
          :aria-current="t.on ? 'page' : undefined"
          class="relative flex h-full flex-col items-center justify-center gap-0.5 font-ui text-xs no-underline"
          :class="t.on ? 'font-medium text-coral' : 'text-on-rail-muted'"
        >
          <span v-if="t.on" class="absolute inset-x-4 top-0 h-[2px] bg-coral" aria-hidden="true" />
          <!-- One 28px holder for every mark, so the labels share a line; the box's is filled. -->
          <span
            class="grid size-7 place-items-center rounded-1"
            :class="t.box ? 'bg-accent text-accent-fg' : ''"
          >
            <AppIcon :name="t.icon" />
          </span>
          <span>{{ t.label }}</span>
          <span
            v-if="t.count"
            class="absolute top-1 left-[calc(50%+0.5rem)] min-w-4 rounded-1 bg-on-rail px-1 text-center text-xs leading-4 font-medium text-rail tabular-nums"
          >
            {{ t.count }}<span class="sr-only"> waiting</span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
