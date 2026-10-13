<script setup lang="ts">
const steps = [
  {
    number: "01",
    title: "Capture",
    detail: "Turn a session into a task, bug report, or handoff.",
    surface: "CLI · MCP · API",
    icon: "M4 3.5h5l3 3v6H4z M9 3.5v3h3 M6.5 9h3 M6.5 11h3",
  },
  {
    number: "02",
    title: "Route",
    detail: "Send it to a person, a group, a team, or the task queue.",
    surface: "People · teams · queue",
    icon: "M8 8a2.25 2.25 0 1 0 0-4.5A2.25 2.25 0 0 0 8 8z M3.5 12.5c.5-2 2-3 4.5-3s4 1 4.5 3 M12 5.5h1.5v3H12 M12 7h-2",
  },
  {
    number: "03",
    title: "Work together",
    detail: "Take it, share progress, ask questions, and attach files.",
    surface: "People · agents · thread",
    icon: "M3.5 4.5h9v6h-5l-2.5 2v-2h-1.5z M6 7h4 M6 8.75h2.5",
  },
  {
    number: "04",
    title: "Review with proof",
    detail: "Hand in checks and evidence. Approve it or ask for changes.",
    surface: "Checks · evidence · review",
    icon: "M8 2.75l4.5 1.75v3.25c0 2.4-1.5 4.4-4.5 5.5-3-1.1-4.5-3.1-4.5-5.5V4.5z M5.75 8l1.5 1.5 3-3",
  },
];

const support = [
  { title: "Project context", detail: "Folders, documents, and files", to: "/hub/folders", action: "Open folders" },
  { title: "Team coordination", detail: "Assignments and announcements", to: "/hub/settings", action: "Team settings" },
  { title: "Stay in the loop", detail: "Live activity and notifications", to: "/hub/log", action: "View activities" },
];
</script>

<template>
  <section class="rounded-3 bg-surface p-4 shadow-edge sm:p-5" aria-labelledby="feature-map-title">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div>
        <p class="m-0 font-ui text-xs font-semibold uppercase tracking-widest text-accent">Passalong at a glance</p>
        <h2 id="feature-map-title" class="mt-1 mb-0 text-lg font-medium tracking-tight">From first prompt to verified work</h2>
      </div>
      <p class="m-0 font-ui text-sm text-muted">One shared workflow for people and agents.</p>
    </div>

    <ol class="feature-flow mt-4 mb-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">
      <li v-for="step in steps" :key="step.number" class="relative min-w-0 rounded-2 bg-raised p-4 shadow-edge">
        <div class="flex items-center gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-2 bg-accent-soft text-accent" aria-hidden="true">
            <svg viewBox="0 0 16 16" class="size-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path :d="step.icon" />
            </svg>
          </span>
          <div class="min-w-0">
            <span class="font-ui text-xs font-semibold tabular-nums text-muted">{{ step.number }}</span>
            <h3 class="m-0 font-ui text-sm font-semibold text-fg">{{ step.title }}</h3>
          </div>
        </div>
        <p class="mt-3 mb-2 min-h-10 text-sm leading-snug text-muted">{{ step.detail }}</p>
        <p class="m-0 font-ui text-xs font-medium text-fg">{{ step.surface }}</p>
      </li>
    </ol>

    <div class="mt-3 grid grid-cols-1 gap-2 border-t border-line pt-3 sm:grid-cols-3">
      <NuxtLink v-for="item in support" :key="item.title" :to="item.to" class="group flex min-w-0 items-center justify-between gap-3 rounded-2 px-3 py-2 no-underline transition-colors hover:bg-raised">
        <span class="min-w-0">
          <span class="block font-ui text-sm font-semibold text-fg">{{ item.title }}</span>
          <span class="block font-ui text-xs text-muted">{{ item.detail }}</span>
        </span>
        <span class="shrink-0 font-ui text-xs font-medium text-accent group-hover:underline">{{ item.action }} <span aria-hidden="true">↗</span></span>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
@media (min-width: 1280px) {
  .feature-flow > li:not(:last-child)::after {
    position: absolute;
    top: 1.95rem;
    right: -0.8rem;
    z-index: 1;
    width: 1rem;
    border-top: 1px solid var(--line);
    content: "";
  }
}
</style>
