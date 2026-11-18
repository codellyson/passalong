<!-- The hero's product stage: the board, with notifications breaking out over its edges, one stage lit at a time. -->
<script setup lang="ts">
import { AGENT_TILES, SOURCE_TILES } from "~/utils/landing-logos";

const TILES = [...AGENT_TILES, ...SOURCE_TILES];
const tile = (key: string) => TILES.find((t) => t.key === key);

type Note = { stage: number; icon: string; title: string; line: string; at: string; when: string };

const STAGES = ["Comes in", "Taken", "Done"];
const NOTES: Note[] = [
  {
    stage: 0,
    icon: "sentry",
    title: "New alert from Sentry",
    line: "500 on /checkout, 12 times",
    at: "l1",
    when: "now",
  },
  {
    stage: 0,
    icon: "mail",
    title: "Ada forwarded an email",
    line: "Invoice PDF is blank",
    at: "r1",
    when: "1m",
  },
  {
    stage: 0,
    icon: "phone",
    title: "Screenshot from a phone",
    line: "Export button does nothing",
    at: "l3",
    when: "2m",
  },
  {
    stage: 1,
    icon: "claude",
    title: "Claude Code took it",
    line: "Payments webhook failing",
    at: "r2",
    when: "now",
  },
  {
    stage: 1,
    icon: "openai",
    title: "Codex asked you",
    line: "Which logo goes on the invoice?",
    at: "l2",
    when: "1m",
  },
  {
    stage: 1,
    icon: "gemini",
    title: "Gemini CLI read the docs",
    line: "Web app README, v5",
    at: "r3",
    when: "3m",
  },
  {
    stage: 2,
    icon: "check",
    title: "Handed in with a screenshot",
    line: "Menu no longer covers the logo",
    at: "l4",
    when: "now",
  },
  {
    stage: 2,
    icon: "check",
    title: "Tests passed",
    line: "Dark mode on settings",
    at: "r4",
    when: "4m",
  },
];

// Each note's place within its stage, so a stage's notes arrive one after another.
const ORDER = NOTES.map((n) => NOTES.filter((m) => m.stage === n.stage).indexOf(n));

const root = ref<HTMLElement | null>(null);
const { index, pick, hovering } = useLandingCycle(STAGES.length, 3200, root);
</script>

<template>
  <div ref="root" class="stage" @pointerenter="hovering = true" @pointerleave="hovering = false">
    <div class="center">
      <LandingBoard :focus="index" />
    </div>

    <div class="now" role="tablist" aria-label="Show a stage">
      <button
        v-for="(s, i) in STAGES"
        :key="s"
        type="button"
        role="tab"
        :aria-selected="i === index"
        :class="{ on: i === index }"
        @click="pick(i)"
      >
        {{ s }}
      </button>
    </div>

    <ul class="n-list" aria-label="What happens on the board">
      <li v-for="(n, k) in NOTES" :key="n.title" :class="[n.at, `d${ORDER[k]}`, { on: n.stage === index }]">
        <LandingTile v-if="tile(n.icon)" class="ic" :tile="tile(n.icon)" />
        <LandingTile v-else class="ic" :class="n.icon">
          <svg v-if="n.icon === 'mail'" viewBox="0 0 24 24" class="line"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
          <svg v-else-if="n.icon === 'phone'" viewBox="0 0 24 24" class="line"><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></svg>
          <svg v-else viewBox="0 0 24 24" class="line"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </LandingTile>
        <span class="txt"><b>{{ n.title }}</b>{{ n.line }}</span>
        <span class="when">{{ n.when }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  padding: var(--s-5) 0 var(--s-6);
}
.center {
  position: relative;
  z-index: 1;
  width: 100%;
  min-width: 0;
  max-width: 48rem;
  margin: 0 auto;
}

.n-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
/* Notifications that break out over the board's edges, as Flighty's do around its phone. */
.n-list li {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  width: 17rem;
  padding: var(--s-3);
  border-radius: 1rem;
  background: color-mix(in oklab, var(--bg) 82%, transparent);
  backdrop-filter: blur(16px) saturate(1.4);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    0 0 0 1px var(--line),
    0 18px 40px -16px light-dark(rgb(40 30 20 / 0.35), rgb(0 0 0 / 0.75));
  text-align: left;
  font-size: var(--t-xs);
  line-height: 1.35;
  color: var(--muted);
  /* Only the lit stage's notes are drawn; the rest are gone, not faded on top of the board. */
  opacity: 0;
  visibility: hidden;
  transform: translateY(10px) scale(0.97);
  transition:
    opacity 0.35s var(--ease-out),
    transform 0.5s cubic-bezier(0.34, 1.3, 0.64, 1),
    visibility 0s linear 0.35s;
  animation: bob 6s ease-in-out infinite alternate;
}
.n-list li.on {
  opacity: 1;
  visibility: visible;
  transform: none;
  transition:
    opacity 0.35s var(--ease-out),
    transform 0.5s cubic-bezier(0.34, 1.3, 0.64, 1),
    visibility 0s;
}
.n-list li.on.d1 {
  transition-delay: 0.12s;
}
.n-list li.on.d2 {
  transition-delay: 0.24s;
}
.n-list li:nth-child(2n) {
  animation-duration: 7s;
  animation-delay: -2s;
}
.n-list li:nth-child(3n) {
  animation-duration: 8s;
  animation-delay: -4s;
}
@keyframes bob {
  to {
    translate: 0 -6px;
  }
}
.txt {
  flex: 1;
  min-width: 0;
}
.txt b {
  display: block;
  color: var(--fg);
  font-weight: 600;
}
.when {
  align-self: flex-start;
  font-size: 0.6875rem;
  color: var(--muted);
}
.n-list .ic {
  flex: none;
  width: 2.25rem;
}
.n-list .ic.check {
  background: linear-gradient(160deg, #4fb35c, #2f8a3c);
  color: #fff;
}
svg.line {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Outside the board's edges and below its column titles, so no note covers a heading. */
.l1 { left: -6%; top: 26%; }
.l2 { left: -5%; top: 42%; }
.l3 { left: -4%; top: 64%; }
.l4 { left: -5%; top: 70%; }
.r1 { right: -6%; top: 27%; }
.r2 { right: -5%; top: 34%; }
.r3 { right: -4%; top: 66%; }
.r4 { right: -6%; top: 46%; }

.now {
  display: none;
}

/* Below a laptop the board takes the width and the lit stage's notes stack under it. */
@media (max-width: 76rem) {
  .stage {
    display: flex;
    flex-direction: column;
  }
  .now {
    display: flex;
    align-self: center;
    gap: 0.25rem;
    margin: var(--s-5) 0 0;
    padding: 0.25rem;
    border-radius: var(--r-pill);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .now button {
    height: 2.25rem;
    padding: 0 var(--s-4);
    border: 0;
    border-radius: var(--r-pill);
    background: none;
    color: var(--muted);
    font: 500 var(--t-sm) / 1 var(--font-sans);
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
  }
  .now button:focus:not(:focus-visible) {
    outline: none;
  }
  .now button.on {
    background: var(--bg);
    color: var(--fg);
    box-shadow: 0 0 0 1px var(--line-strong);
  }
  .n-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: var(--s-3);
    margin-top: var(--s-3);
  }
  .n-list li {
    position: static;
    width: auto;
    animation: none;
    transform: none;
  }
  .n-list li:not(.on) {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .n-list li,
  .n-list li.on {
    animation: none;
    transform: none;
    transition: opacity 0.2s linear;
  }
}
</style>
