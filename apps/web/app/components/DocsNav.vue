<!-- The docs tab bar, shared by every /docs page. -->
<script setup lang="ts">
const route = useRoute();
const TABS = [
  { href: "/docs", label: "Overview" },
  { href: "/connect", label: "Connect" },
  { href: "/docs/work-format", label: "Work format" },
  { href: "/docs/cli", label: "CLI" },
  { href: "/docs/integrations", label: "Integrations" },
];
</script>

<template>
  <nav class="docs-nav" aria-label="Docs">
    <a
      v-for="t in TABS"
      :key="t.href"
      :href="t.href"
      :class="{ here: route.path === t.href }"
      :aria-current="route.path === t.href ? 'page' : undefined"
    >
      {{ t.label }}
    </a>
  </nav>
</template>

<style scoped>
.docs-nav {
  display: flex;
  gap: 0.25rem;
  width: fit-content;
  max-width: 100%;
  margin: var(--s-5) auto 0;
  padding: 0.25rem;
  border-radius: var(--r-pill);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  overflow-x: auto;
  scrollbar-width: none;
}
.docs-nav a {
  flex: none;
  padding: var(--s-2) var(--s-4);
  border-radius: var(--r-pill);
  color: var(--muted);
  font: 500 var(--t-sm) / 1 var(--font-sans);
  text-decoration: none;
  white-space: nowrap;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}
.docs-nav a:hover {
  color: var(--fg);
}
.docs-nav a.here {
  background: var(--bg);
  color: var(--fg);
  box-shadow: 0 0 0 1px var(--line-strong);
}
</style>

<style>
/* Docs pages take the new homepage's serif headline; the other prose pages keep theirs. */
main.docs .hero h1 {
  font-family: var(--font-serif);
  font-weight: 500;
  letter-spacing: -0.02em;
}
main.docs .hero .turn {
  font-style: italic;
}
</style>
