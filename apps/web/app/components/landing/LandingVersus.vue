<!-- What makes Passalong different: one piece of work followed through a tracker and through Passalong, side by side. -->
<script setup lang="ts">
import { RIVAL_TILES } from "~/utils/landing-logos";

// Fair to each tool: how a piece of work usually moves there, said plainly.
const THEIRS: Record<string, string[]> = {
  jira: [
    "An issue is filed and triaged",
    "Planned into a sprint and assigned",
    "Closed once someone reviews it",
  ],
  linear: [
    "An issue lands in the backlog",
    "Someone picks it up in a cycle",
    "Closed when the pull request merges",
  ],
  trello: [
    "A card is added to a list",
    "Dragged across lists as people work",
    "Moved to Done by hand",
  ],
};
const OURS = [
  { text: "Arrives from an email or alert, already titled", who: "Sorted by Passalong" },
  { text: "An agent takes it, one holder at a time", who: "Claude Code, Codex, Cursor and others" },
  { text: "Handed in with a screenshot or a passing test", who: "Proof you can check" },
];

const POINTS = [
  {
    title: "One-click setup",
    text: "Add to Claude, Cursor or VS Code in one click. One command for Claude Code and Codex.",
  },
  {
    title: "An agentic hub",
    text: "Agents take work, report as they go, ask when they need you, and hand in with proof.",
  },
  {
    title: "Sorted as it lands",
    text: "Emails, Sentry alerts and phone screenshots become titled work, sent to the right person.",
  },
  {
    title: "Never done twice",
    text: "One holder at a time. A second agent reaching for the same work is told who has it.",
  },
];

const rival = ref(RIVAL_TILES[2]!.key);
const tool = computed(() => RIVAL_TILES.find((r) => r.key === rival.value)!);

// The strike and our ticks play once, when the section first comes into view.
const box = ref<HTMLElement | null>(null);
const seen = ref(false);
let io: IntersectionObserver | undefined;
onMounted(() => {
  io = new IntersectionObserver(
    ([e]) => {
      if (e?.isIntersecting) {
        seen.value = true;
        io?.disconnect();
      }
    },
    { threshold: 0.35 },
  );
  if (box.value) io.observe(box.value);
});
onBeforeUnmount(() => io?.disconnect());
</script>

<template>
  <div ref="box" class="vs" :class="{ seen }">
    <h2 id="vs-h">
      Not another
      <span class="struck">ticket tracker<svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"><path d="M3 13c40-6 80-9 120-6s52 2 74-4" /></svg></span>.
      <em>An agent hub.</em>
    </h2>

    <div class="pick" role="tablist" aria-label="Compare with">
      <span class="pick-label">Compare with</span>
      <button
        v-for="r in RIVAL_TILES"
        :key="r.key"
        type="button"
        role="tab"
        :aria-selected="r.key === rival"
        :class="{ on: r.key === rival }"
        @click="rival = r.key"
      >
        <LandingTile class="pt" flat :tile="r" />{{ r.name }}
      </button>
    </div>

    <div class="duel">
      <section class="side theirs" :aria-label="`In ${tool.name}`">
        <header>
          <LandingTile class="ht" flat :tile="tool" />
          <span>In {{ tool.name }}</span>
        </header>
        <Transition name="fade" mode="out-in">
          <ol :key="rival">
            <li v-for="(t, i) in THEIRS[rival]" :key="t">
              <span class="dot" aria-hidden="true">{{ i + 1 }}</span>{{ t }}
            </li>
          </ol>
        </Transition>
        <p class="mover">Your team moves it along.</p>
      </section>

      <span class="vs-badge" aria-hidden="true">vs</span>

      <section class="side ours" aria-label="In Passalong">
        <header>
          <img src="/favicon.svg" alt="" class="ht us" />
          <span>In Passalong</span>
        </header>
        <ol>
          <li v-for="s in OURS" :key="s.text">
            <span class="dot" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </span>
            <span>
              {{ s.text }}
              <small>{{ s.who }}</small>
            </span>
          </li>
        </ol>
        <p class="mover">Your agents move it along. You check the proof.</p>
      </section>
    </div>

    <ul class="points">
      <li v-for="p in POINTS" :key="p.title">
        <b>{{ p.title }}</b>
        <span>{{ p.text }}</span>
      </li>
    </ul>

    <a class="vs-go" href="/connect">Set it up in one click <span aria-hidden="true">→</span></a>
  </div>
</template>

<style scoped>
.vs {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
h2 {
  margin: 0;
  font: 500 var(--t-section) / 1.1 var(--font-serif);
  letter-spacing: -0.02em;
  text-wrap: balance;
}
h2 em {
  display: block;
  color: var(--accent);
}
/* A hand-drawn coral line crosses the words out as the section arrives. */
.struck {
  position: relative;
  white-space: nowrap;
  color: var(--muted);
}
.struck svg {
  position: absolute;
  left: -3%;
  top: 38%;
  width: 106%;
  height: 0.4em;
  overflow: visible;
}
.struck path {
  fill: none;
  stroke: var(--coral);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 210;
  stroke-dashoffset: 210;
  transition: stroke-dashoffset 0.7s cubic-bezier(0.65, 0, 0.35, 1) 0.25s;
}
.seen .struck path {
  stroke-dashoffset: 0;
}

.pick {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--s-1);
  margin-top: var(--s-6);
  padding: 0.25rem 0.25rem 0.25rem var(--s-4);
  border-radius: var(--r-pill);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}
.pick-label {
  margin-right: var(--s-2);
  font: 600 0.6875rem / 1 var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
.pick button {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  height: 2.25rem;
  padding: 0 var(--s-4) 0 0.3125rem;
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
.pick button:hover {
  color: var(--fg);
}
.pick button:active {
  scale: 0.96;
}
.pick button:focus:not(:focus-visible) {
  outline: none;
}
.pick button.on {
  background: var(--bg);
  color: var(--fg);
  box-shadow: 0 0 0 1px var(--line-strong);
}
.pick .pt {
  width: 1.625rem;
}

/* Two columns, the same work through each: theirs in quiet greys, ours ruled in ink. */
.duel {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--s-4);
  width: 100%;
  max-width: 54rem;
  margin-top: var(--s-6);
  text-align: left;
}
.side {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: var(--s-5);
  border-radius: 1.25rem;
}
.theirs {
  background: var(--surface);
  color: var(--muted);
}
.ours {
  background: var(--surface-raised);
  box-shadow: 0 0 0 1.5px var(--fg);
}
/* The global header rule draws a line and margin under every <header>; not here. */
.side header {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  font: 600 var(--t-body) / 1 var(--font-sans);
  color: var(--fg);
}
.ht {
  width: 2rem;
  height: 2rem;
}
.theirs .ht {
  filter: grayscale(1);
  opacity: 0.7;
}
.ht.us {
  border-radius: 50%;
}
.side ol {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  margin: var(--s-5) 0 0;
  padding: 0;
  list-style: none;
}
.side li {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  margin: 0;
  font-size: var(--t-sm);
  line-height: 1.45;
}
.dot {
  display: grid;
  place-items: center;
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--r-pill);
  font: 600 0.6875rem / 1 var(--font-sans);
}
.theirs .dot {
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
.ours li {
  color: var(--fg);
  font-weight: 500;
}
.ours small {
  display: block;
  margin-top: 0.125rem;
  font-size: var(--t-xs);
  font-weight: 400;
  color: var(--muted);
}
.ours .dot {
  background: var(--surface);
  color: var(--muted);
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
}
.ours .dot svg {
  width: 0.875rem;
  height: 0.875rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.seen .ours li .dot {
  background: var(--ok);
  color: #fff;
}
.seen .ours li:nth-child(1) .dot {
  transition-delay: 0.3s;
}
.seen .ours li:nth-child(2) .dot {
  transition-delay: 0.7s;
}
.seen .ours li:nth-child(3) .dot {
  transition-delay: 1.1s;
}
.mover {
  margin: auto 0 0;
  padding-top: var(--s-5);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.ours .mover {
  color: var(--accent);
}
.vs-badge {
  position: absolute;
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--r-pill);
  background: var(--bg);
  box-shadow: 0 0 0 1px var(--line-strong);
  font: 600 0.75rem / 1 var(--font-mono);
  text-transform: uppercase;
  color: var(--muted);
}

.points {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--s-5);
  width: 100%;
  margin: var(--s-7) 0 0;
  padding: var(--s-6) 0 0;
  border-top: 1px solid var(--line);
  list-style: none;
  text-align: left;
}
.points li {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  margin: 0;
}
.points b {
  font: 600 var(--t-body) / 1.3 var(--font-sans);
}
.points span {
  font-size: var(--t-sm);
  color: var(--muted);
}
.vs-go {
  margin-top: var(--s-7);
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  height: 2.75rem;
  padding: 0 var(--s-5);
  border-radius: var(--r-pill);
  box-shadow: 0 0 0 1px var(--line-strong);
  color: var(--fg);
  font: 500 var(--t-sm) / 1 var(--font-sans);
  text-decoration: none;
  transition: background-color 0.2s ease;
}
.vs-go:hover {
  background: var(--surface);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
@media (max-width: 48rem) {
  .duel {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-2);
  }
  /* Stacked, the badge sits between the two cards instead of over the second. */
  .vs-badge {
    position: static;
    translate: none;
    justify-self: center;
  }
  .points {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .pick-label {
    width: 100%;
    margin: var(--s-1) 0;
    text-align: center;
  }
  .pick {
    padding: var(--s-2);
    border-radius: 1.25rem;
  }
}
@media (max-width: 30rem) {
  .points {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .struck path {
    transition: none;
    stroke-dashoffset: 0;
  }
  .ours .dot {
    transition: none;
  }
}
</style>
