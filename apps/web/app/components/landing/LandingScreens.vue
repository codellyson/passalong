<!-- The real hub, not a mock-up: screens from the staging demo team, one tab each. -->
<script setup lang="ts">
const SCREENS = [
  {
    id: "board",
    tab: "Board",
    says: "One board for your team and its agents.",
    w: 2000,
    h: 1000,
    alt: "The Passalong board: work Ready under the team's groups, two pieces In progress held by Rui's agent, one of them waiting on an answer, and finished work in Done.",
  },
  {
    id: "project",
    tab: "Documents",
    says: "Every agent starts with what your team knows.",
    w: 1400,
    h: 840,
    alt: "A project's page: its README and documents, which an agent reads before it starts.",
  },
  {
    id: "ask",
    tab: "Asks",
    says: "It asks you when it needs an answer.",
    w: 1400,
    h: 840,
    alt: "A piece of work held by Rui's agent, with its question waiting for a reply.",
  },
  {
    id: "proof",
    tab: "Proof",
    says: "It hands in with proof.",
    w: 1400,
    h: 840,
    alt: "Finished work, with the agent's note and the passing test it handed in with.",
  },
];

const on = ref(0);
const tabs = ref<HTMLButtonElement[]>([]);
function step(e: KeyboardEvent) {
  const by = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
  if (!by) return;
  e.preventDefault();
  on.value = (on.value + by + SCREENS.length) % SCREENS.length;
  tabs.value[on.value]?.focus();
}
</script>

<template>
  <h2 id="screens-h">Not a mock-up.<br /><em>The real hub.</em></h2>
  <div class="scr-tabs" role="tablist" aria-label="Screens" @keydown="step">
    <button
      v-for="(s, i) in SCREENS"
      :id="`scr-tab-${s.id}`"
      ref="tabs"
      :key="s.id"
      type="button"
      role="tab"
      aria-controls="scr-panel"
      :aria-selected="on === i"
      :tabindex="on === i ? 0 : -1"
      :class="{ on: on === i }"
      @click="on = i"
    >
      {{ s.tab }}
    </button>
  </div>
  <p class="scr-says" aria-live="polite">{{ SCREENS[on]?.says }}</p>
  <div id="scr-panel" class="scr-frame" role="tabpanel" :aria-labelledby="`scr-tab-${SCREENS[on]?.id}`">
    <figure v-for="(s, i) in SCREENS" :key="s.id" class="scr-pane" :class="{ on: on === i }" :aria-hidden="on !== i">
      <img class="on-light" :src="`/media/${s.id}-light.jpg`" :width="s.w" :height="s.h" :alt="s.alt" :loading="i ? 'lazy' : undefined" />
      <img class="on-dark" :src="`/media/${s.id}-dark.jpg`" :width="s.w" :height="s.h" :alt="s.alt" loading="lazy" />
    </figure>
  </div>
</template>

<style scoped>
h2 {
  margin: 0;
  font: 500 var(--t-section) / 1.08 var(--font-serif);
  letter-spacing: -0.02em;
  text-wrap: balance;
}
h2 em {
  color: var(--accent);
}
.scr-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--s-1);
  margin-top: var(--s-6);
  padding: var(--s-1);
  border-radius: var(--r-pill);
  background: var(--surface);
}
.scr-tabs button {
  padding: var(--s-2) var(--s-4);
  border: 0;
  border-radius: var(--r-pill);
  background: none;
  color: var(--muted);
  font: 500 var(--t-sm) / 1 var(--font-sans);
  cursor: pointer;
  transition:
    background-color var(--motion) ease,
    color var(--motion) ease;
}
.scr-tabs button.on {
  background: var(--bg);
  color: var(--fg);
  box-shadow: var(--shadow-1);
}
.scr-says {
  margin: var(--s-4) auto 0;
  color: var(--muted);
}
/* Every screen sits in one cell, so the frame is the tallest one's height and never jumps. Its
   ground is the hub's own, so a shorter screen reads as the page carrying on. */
.scr-frame {
  display: grid;
  max-width: 64rem;
  margin: var(--s-6) auto 0;
  border-radius: 1.25rem;
  background: #fff;
  box-shadow:
    0 0 0 1px var(--line),
    0 24px 48px -24px rgb(0 0 0 / 0.25);
  overflow: hidden;
}
.scr-pane {
  grid-area: 1 / 1;
  margin: 0;
  opacity: 0;
  translate: 0 6px;
}
/* Only the incoming screen fades: two full screens crossfading read as mud. */
.scr-pane.on {
  opacity: 1;
  translate: 0 0;
  transition:
    opacity 0.3s ease,
    translate 0.3s var(--ease-out);
}
.scr-pane img {
  width: 100%;
  height: auto;
  mask-image: linear-gradient(to bottom, #000 78%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .scr-pane {
    translate: none;
    transition: none;
  }
}
</style>

<style>
/* Unscoped because the theme lives on <html>: the masthead's toggle sets data-theme, which a
   media query alone cannot see. */
.scr-frame img {
  display: block;
}
.scr-frame .on-dark {
  display: none;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .scr-frame {
    background: rgb(24 25 20);
  }
  :root:not([data-theme="light"]) .scr-frame .on-light {
    display: none;
  }
  :root:not([data-theme="light"]) .scr-frame .on-dark {
    display: block;
  }
}
:root[data-theme="dark"] .scr-frame {
  background: rgb(24 25 20);
}
:root[data-theme="dark"] .scr-frame .on-light {
  display: none;
}
:root[data-theme="dark"] .scr-frame .on-dark {
  display: block;
}
</style>
