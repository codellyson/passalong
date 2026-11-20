<!-- The landing page: the product shown before it is explained, then how it works, who it works with, and the price. -->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { AGENT_TILES, SOURCE_TILES, type Tile } from "~/utils/landing-logos";

usePage({
  title: "Passalong: your agents handle every request your team sends",
  description:
    "Bugs, emails and alerts land in one place. Your agent takes each one and comes back with proof.",
  image: `${APEX}/og.png`,
  url: `${APEX}/`,
});

const PRICING = {
  solo: 5,
  team: 20,
  seats: 10,
  contact: "contact@passalong.dev",
};

// What a search engine is told, as JSON-LD: a data block, not script, so the CSP is untouched.
const STRUCTURED = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${APEX}/#organization`,
      name: "Passalong",
      url: `${APEX}/`,
      logo: `${APEX}/icon-512.png`,
      email: PRICING.contact,
      sameAs: [
        "https://www.npmjs.com/package/passalong",
        "https://github.com/codellyson/passalong",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${APEX}/#website`,
      name: "Passalong",
      url: `${APEX}/`,
      publisher: { "@id": `${APEX}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${APEX}/#software`,
      name: "Passalong",
      url: `${APEX}/`,
      // The landing's own words (usePage above and the hero), so every listing says one thing.
      description:
        "Bugs, emails and alerts land in one place. Your agent takes each one and comes back with proof. Any agent that speaks MCP can take work. Passalong never runs it for you.",
      applicationCategory: "BusinessApplication",
      operatingSystem: "macOS, Linux, Windows",
      publisher: { "@id": `${APEX}/#organization` },
      offers: [
        {
          "@type": "Offer",
          name: "Try",
          description: "One piece of work, every feature, to try Passalong.",
          price: 0,
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          name: "Solo",
          description: "No limit on one person's own work.",
          price: PRICING.solo,
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          name: "Team",
          description: `Covers all the work sent to a team of up to ${PRICING.seats} people.`,
          price: PRICING.team,
          priceCurrency: "USD",
        },
      ],
    },
  ],
};
useHead({ script: [{ type: "application/ld+json", innerHTML: JSON.stringify(STRUCTURED) }] });

const HERO_AGENTS = AGENT_TILES.filter((t) =>
  ["claude", "openai", "cursor", "gemini"].includes(t.key),
);

const INSTALL = [
  { id: "terminal", label: "Terminal", text: "npm i -g passalong && passalong setup" },
  {
    id: "agent",
    label: "Ask your agent",
    text: "Install Passalong with `npm i -g passalong`, run `passalong setup`, then show me what work is waiting.",
  },
  { id: "connector", label: "ChatGPT or Claude", text: "https://passalong.dev/v1/mcp" },
];
const tab = ref(INSTALL[0]!.id);
const shown = computed(() => INSTALL.find((t) => t.id === tab.value)!);

const copied = ref("");
let reset: ReturnType<typeof setTimeout> | undefined;
async function copy(id: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = id;
    clearTimeout(reset);
    reset = setTimeout(() => (copied.value = ""), 1600);
  } catch {
    copied.value = "";
  }
}

type Entry = { key: string; name: string; tile?: Tile; icon?: "mail" | "phone" | "hook" | "mcp" };
const TILE_SETS: { id: string; label: string; tiles: Entry[] }[] = [
  {
    id: "agents",
    label: "Your agents",
    tiles: [
      ...AGENT_TILES.map((t) => ({ key: t.key, name: t.name, tile: t })),
      { key: "mcp", name: "Any MCP client", icon: "mcp" as const },
    ],
  },
  {
    id: "sources",
    label: "Where work comes from",
    tiles: [
      { key: "mail", name: "Email", icon: "mail" as const },
      ...SOURCE_TILES.map((t) => ({ key: t.key, name: t.name, tile: t })),
      { key: "phone", name: "Your phone", icon: "phone" as const },
      { key: "hook", name: "Any webhook", icon: "hook" as const },
    ],
  },
];
const tileSet = ref(TILE_SETS[0]!.id);
const tiles = computed(() => TILE_SETS.find((s) => s.id === tileSet.value)!.tiles);

const CARDS = [
  {
    title: "Try one free.",
    line: "One piece of work, every feature.",
    more: "Watch it go from inbox to done, then choose a plan. Inviting people needs a Team plan.",
    cta: { label: "Try it", href: "/hub" },
    glyph: "gift",
  },
  {
    title: "$5 a month.",
    line: "Solo. One person, no limit.",
    more: "Keep as much work as you like, sent by you or your agents, on a team or not.",
    cta: { label: "Choose Solo", href: "/hub/settings/plan" },
    glyph: "tag",
  },
  {
    title: "$20 a month.",
    line: "Team. Up to 10 people.",
    more: "One subscription covers the whole team: one board, and work for a person, a group or anyone's agents.",
    cta: { label: "Choose Team", href: "/hub/settings/teams" },
    glyph: "people",
  },
  {
    title: "Plain markdown.",
    line: "Export everything, any time.",
    more: "Every piece of work is a markdown file, and one command exports all of it. No lock-in.",
    cta: { label: "The work format", href: "/docs/work-format" },
    glyph: "file",
  },
  {
    title: "One agent at a time.",
    line: "Never done twice.",
    more: "Whoever takes work holds it. A second agent reaching for it is told who has it, and stops.",
    glyph: "lock",
  },
  {
    title: "Proof on every hand-in.",
    line: "Not just a promise.",
    more: "A screenshot, or the command it ran and what came back. Not right? Reopen it with a reason.",
    glyph: "check",
  },
];

const row = ref<HTMLElement | null>(null);
const atStart = ref(true);
const atEnd = ref(false);
function onRowScroll() {
  const el = row.value;
  if (!el) return;
  atStart.value = el.scrollLeft < 8;
  atEnd.value = el.scrollLeft + el.clientWidth > el.scrollWidth - 8;
}
function slide(dir: 1 | -1) {
  const el = row.value;
  if (!el) return;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: calm ? "auto" : "smooth" });
}

const FAQ = [
  {
    q: "Does Passalong run my agents?",
    a: "No. Your agents run where they already do. Passalong holds the work and what they need to know.",
  },
  {
    q: "Why not Linear or GitHub Issues?",
    a: "A ticket waits for a person. Here, work is sorted as it arrives and an agent can take it right away.",
  },
  {
    q: "Does everyone need a terminal?",
    a: "No. Teammates write in the hub, forward an email or send a screenshot from their phone.",
  },
  { q: "Am I locked in?", a: "No. Work is plain markdown and you can export all of it any time." },
];

onMounted(() => {
  onRowScroll();
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const video of document.querySelectorAll<HTMLVideoElement>(".v2 video")) {
    video.removeAttribute("autoplay");
    video.pause();
  }
});
onBeforeUnmount(() => clearTimeout(reset));
</script>

<template>
  <main class="wide v2">
    <AppMasthead />

    <header class="top">
      <h1>
        What if your agents
        <span class="stack" role="img" aria-label="Claude Code, Codex, Cursor and Gemini CLI">
          <span v-for="t in HERO_AGENTS" :key="t.key" class="pw">
            <LandingTile class="plate" :tile="t" />
            <span class="name" aria-hidden="true">{{ t.name }}</span>
          </span>
        </span>
        handled every request your team sent?
      </h1>
      <p class="top-line">
        Bugs, emails and alerts land in one place. Your agent takes each one and comes back with proof.
      </p>
      <LandingCommand class="hero-cmd" />
    </header>

    <LandingStage />

    <section class="how" aria-label="How it works">
      <LandingStory />
    </section>

    <section class="screens" aria-labelledby="screens-h">
      <LandingScreens />
    </section>

    <section class="different" aria-labelledby="vs-h">
      <LandingVersus />
    </section>

    <section class="fits" aria-labelledby="agents-h">
      <h2 id="agents-h">Works with the agent<br /><em>you already use.</em></h2>
      <p class="sub">Any agent that speaks MCP can take work. Passalong never runs it for you.</p>
      <div class="tabs" role="tablist" aria-label="Show">
        <button
          v-for="s in TILE_SETS"
          :key="s.id"
          type="button"
          role="tab"
          :aria-selected="tileSet === s.id"
          :class="{ on: tileSet === s.id }"
          @click="tileSet = s.id"
        >
          {{ s.label }}
        </button>
      </div>
      <ul :key="tileSet" class="tiles" role="tabpanel">
        <li v-for="t in tiles" :key="t.key">
          <LandingTile v-if="t.tile" class="big" :tile="t.tile" tilt />
          <LandingTile v-else class="big" tilt>
            <svg v-if="t.icon === 'mail'" viewBox="0 0 24 24" class="line" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
            <svg v-else-if="t.icon === 'phone'" viewBox="0 0 24 24" class="line" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></svg>
            <svg v-else-if="t.icon === 'hook'" viewBox="0 0 24 24" class="line" aria-hidden="true"><path d="M8 7 3 12l5 5M16 7l5 5-5 5" /></svg>
            <span v-else class="word" aria-hidden="true">MCP</span>
          </LandingTile>
          <span>{{ t.name }}</span>
        </li>
      </ul>
    </section>

    <section class="plans" aria-labelledby="plans-h">
      <div class="plans-head">
        <h2 id="plans-h">Simple price.<br /><em>Everything in it.</em></h2>
        <p>
          <b>Try one piece of work free.</b> Then Solo is $5 a month, and <b>Team is $20</b> for up to 10 people. No per-seat
          maths, nothing sold separately.
        </p>
      </div>
      <div ref="row" class="row" @scroll.passive="onRowScroll">
        <LandingFlipCard v-for="c in CARDS" :key="c.title" :title="c.title" :line="c.line" :more="c.more" :cta="c.cta">
          <template #glyph>
            <svg v-if="c.glyph === 'gift'" viewBox="0 0 32 32"><rect x="5" y="12" width="22" height="15" rx="2" /><path d="M3.5 8.5h25v3.5h-25zM16 8.5V27M16 8.5c-2-4.5-7-5-7-1.5 0 2 4 1.5 7 1.5Zm0 0c2-4.5 7-5 7-1.5 0 2-4 1.5-7 1.5Z" /></svg>
            <svg v-else-if="c.glyph === 'tag'" viewBox="0 0 32 32"><path d="M4.5 6.6a2.1 2.1 0 0 1 2.1-2.1h8.3c.6 0 1.1.2 1.5.6l10.5 10.5a2.1 2.1 0 0 1 0 3l-8.4 8.4a2.1 2.1 0 0 1-3 0L5.1 16.5a2.1 2.1 0 0 1-.6-1.5Z" /><circle cx="10.4" cy="10.4" r="2" /></svg>
            <svg v-else-if="c.glyph === 'people'" viewBox="0 0 32 32"><circle cx="12" cy="11" r="4.5" /><path d="M3.5 26c.8-5 4.2-7.5 8.5-7.5s7.7 2.5 8.5 7.5" /><circle cx="22.5" cy="12" r="3.5" /><path d="M22 18.5c3.6 0 6 2 6.5 6" /></svg>
            <svg v-else-if="c.glyph === 'file'" viewBox="0 0 32 32"><path d="M8 4h11l6 6v18H8z" /><path d="M19 4v6h6M12 17h9M12 22h6" /></svg>
            <svg v-else-if="c.glyph === 'lock'" viewBox="0 0 32 32"><rect x="6" y="14" width="20" height="14" rx="3" /><path d="M11 14V10a5 5 0 0 1 10 0v4M16 20v3" /></svg>
            <svg v-else viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" /><path d="m10.5 16.5 3.8 3.8 7.2-8" /></svg>
          </template>
        </LandingFlipCard>
      </div>
      <p class="arrows">
        <button type="button" aria-label="Previous" :disabled="atStart" @click="slide(-1)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg>
        </button>
        <button type="button" aria-label="Next" :disabled="atEnd" @click="slide(1)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" /></svg>
        </button>
      </p>
    </section>

    <section class="install" aria-labelledby="install-h">
      <h2 id="install-h">Start in a minute.</h2>
      <div class="tabs" role="tablist" aria-label="How to install">
        <button
          v-for="t in INSTALL"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="tab === t.id"
          :class="{ on: tab === t.id }"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </div>
      <div class="well" role="tabpanel">
        <code>{{ shown.text }}</code>
        <button type="button" class="btn sm" @click="copy(shown.id, shown.text)">
          {{ copied === shown.id ? "Copied" : "Copy" }}
        </button>
      </div>
      <p class="sub"><a href="/connect">All the ways to connect</a></p>
    </section>

    <section class="qa" aria-labelledby="faq-h">
      <h2 id="faq-h">Questions</h2>
      <details v-for="f in FAQ" :key="f.q">
        <summary>{{ f.q }}</summary>
        <p>{{ f.a }}</p>
      </details>
    </section>

    <section class="end">
      <h2>Hand it off.<br /><em>Get it back done.</em></h2>
      <LandingCommand class="end-cmd" />
    </section>

    <AppFoot />
  </main>
</template>

<style scoped>
.top,
section {
  text-align: center;
}
h1,
h2 {
  font-family: var(--font-serif);
  font-weight: 500;
  letter-spacing: -0.02em;
  text-wrap: balance;
  margin: 0;
}
h2 em {
  color: var(--accent);
}

.top {
  margin: 0;
  border: 0;
  padding: var(--s-8) 0 var(--s-5);
}
h1 {
  max-width: 15ch;
  margin-inline: auto;
  font-size: var(--t-display);
  line-height: 1.06;
}
/* Moonjar's inline logo, as one overlapping cluster instead of a rotating name. */
.stack {
  display: inline-flex;
  vertical-align: -0.06em;
  margin: 0 0.06em;
}
.stack .plate {
  width: 0.82em;
  border-radius: 24%;
  box-shadow:
    0 0 0 0.045em var(--bg),
    inset 0 1px 0 rgb(255 255 255 / 0.5),
    0 0.04em 0.08em rgb(0 0 0 / 0.18),
    0 0.12em 0.3em -0.08em rgb(0 0 0 / 0.35);
  transition: translate 0.35s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.pw {
  position: relative;
  display: inline-flex;
  transition: translate 0.35s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.pw + .pw {
  margin-left: -0.2em;
}
.stack:hover .pw:nth-child(2) {
  translate: 0.1em 0;
}
.stack:hover .pw:nth-child(3) {
  translate: 0.2em 0;
}
.stack:hover .pw:nth-child(4) {
  translate: 0.3em 0;
}
/* Pointing at one lifts it and names it. */
.pw:hover {
  z-index: 2;
}
.pw:hover .plate {
  translate: 0 -0.08em;
}
.name {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 0.5rem);
  padding: 0.375rem 0.625rem;
  border-radius: 0.5rem;
  background: var(--fg);
  color: var(--bg);
  font: 500 0.8125rem / 1 var(--font-sans);
  letter-spacing: 0;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  translate: -50% 4px;
  transition:
    opacity 0.15s ease,
    translate 0.2s var(--ease-out);
}
.name::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 100%;
  translate: -50% 0;
  border: 0.3125rem solid transparent;
  border-top-color: var(--fg);
}
.pw:hover .name {
  opacity: 1;
  translate: -50% 0;
}
.top-line {
  margin: var(--s-5) auto 0;
  max-width: 34rem;
  font-size: var(--t-lede);
  color: var(--muted);
}
.hero-cmd {
  margin-top: var(--s-6);
}
.end-cmd {
  margin-top: var(--s-6);
}

section {
  margin-top: var(--s-9);
}
h2 {
  font-size: var(--t-section);
  line-height: 1.08;
}
.sub {
  margin: var(--s-4) auto 0;
  max-width: 34rem;
  color: var(--muted);
}

.tabs {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--s-1);
  margin-top: var(--s-6);
  padding: var(--s-1);
  border-radius: var(--r-pill);
  background: var(--surface);
}
.tabs button {
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
.tabs button.on {
  background: var(--bg);
  color: var(--fg);
  box-shadow: var(--shadow-1);
}

/* The slide-in starts 24px to the right; clip it so it never widens the page. */
.fits {
  overflow-x: clip;
}
.tiles {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--s-6) var(--s-4);
  margin: var(--s-7) auto 0;
  padding: 0;
  max-width: 60rem;
  list-style: none;
}
/* Raycast's tab switch: each tile slides in a beat after the one before it. */
.tiles li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-2);
  width: 6.25rem;
  font-size: var(--t-sm);
  color: var(--muted);
  animation: slide-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.tiles li:nth-child(2) { animation-delay: 40ms; }
.tiles li:nth-child(3) { animation-delay: 80ms; }
.tiles li:nth-child(4) { animation-delay: 120ms; }
.tiles li:nth-child(5) { animation-delay: 160ms; }
.tiles li:nth-child(6) { animation-delay: 200ms; }
.tiles li:nth-child(7) { animation-delay: 240ms; }
@keyframes slide-in {
  from {
    opacity: 0;
    translate: 24px 0;
    filter: blur(4px);
  }
}
.tiles .big {
  width: 5.5rem;
}
.tiles li:hover .big {
  translate: 0 -4px;
}
.word {
  position: relative;
  z-index: 1;
  font: 700 var(--t-sm) / 1 var(--font-mono);
  color: var(--fg);
}
svg.line {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.plans {
  text-align: left;
}
.plans-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--s-6);
  align-items: start;
}
.plans-head p {
  margin: var(--s-2) 0 0;
  font-size: var(--t-lede);
  line-height: 1.5;
  color: var(--muted);
}
.plans-head b {
  color: var(--fg);
  font-weight: 600;
}
/* Droppy's row: cards in a line you scroll sideways, with room for the hover lift. */
.row {
  --bleed: var(--s-5);
  display: flex;
  gap: var(--s-4);
  margin: var(--s-6) calc(var(--bleed) * -1) 0;
  padding: var(--s-3) var(--bleed) var(--s-4);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: var(--bleed);
  scrollbar-width: none;
}
.row::-webkit-scrollbar {
  display: none;
}
.arrows {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-2);
  margin: var(--s-2) 0 0;
}
.arrows button {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--fg);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    opacity 0.2s ease;
}
.arrows button:hover:not(:disabled) {
  background: var(--line-strong);
}
.arrows button:active:not(:disabled) {
  scale: 0.96;
}
.arrows button:disabled {
  opacity: 0.35;
  cursor: default;
}
.arrows svg {
  width: 1.125rem;
  height: 1.125rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.install {
  max-width: 44rem;
  margin-inline: auto;
}
.well {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  margin-top: var(--s-4);
  padding: var(--s-5);
  border-radius: var(--r-3);
  background: light-dark(#1d1c1a, #0f0e0d);
  text-align: left;
}
.well code {
  flex: 1;
  background: none;
  padding: 0;
  color: #f4efe9;
  font: var(--t-sm) / 1.6 var(--font-mono);
  overflow-wrap: anywhere;
}
.well .btn {
  color: #f4efe9;
  border-color: rgb(255 255 255 / 0.2);
}
.well .btn:hover {
  background: rgb(255 255 255 / 0.08);
}

.qa {
  max-width: 40rem;
  margin-inline: auto;
  text-align: left;
}
.qa h2 {
  text-align: center;
  margin-bottom: var(--s-6);
}
details {
  border-bottom: 1px solid var(--line);
}
summary {
  padding: var(--s-4) 0;
  font-weight: 500;
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
  gap: var(--s-4);
}
summary::-webkit-details-marker {
  display: none;
}
summary::after {
  content: "+";
  color: var(--muted);
  transition: rotate var(--motion) var(--ease-out);
}
details[open] summary::after {
  rotate: 45deg;
}
details p {
  margin: 0 0 var(--s-4);
  color: var(--muted);
}

.end {
  padding-bottom: var(--s-8);
}
.end .btn {
  margin-top: var(--s-6);
}

@media (max-width: 48rem) {
  .plans-head {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
  /* The page gutter is 16px here, so the row bleeds by the same. */
  .row {
    --bleed: var(--s-4);
  }
  .install .tabs {
    justify-content: flex-start;
    flex-wrap: nowrap;
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .install .tabs button {
    white-space: nowrap;
    flex: none;
  }
  .well {
    flex-direction: column;
    align-items: stretch;
  }
  .well .btn {
    align-self: flex-end;
  }
  .tiles li {
    width: 4.5rem;
  }
  .tiles .big {
    width: 3.75rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .tiles li {
    animation: none;
  }
  .tiles li:hover .big,
  .stack:hover .plate {
    translate: none;
  }
}
</style>
