<!-- How it works as one paragraph: a sentence lights up and its clip plays beside it, driven by scroll on desktop. -->
<script setup lang="ts">
const STEPS = [
  {
    say: "Anything comes in.",
    chip: "Email, Sentry, your phone",
    note: "Forward an email, send a screenshot, or point a webhook at it.",
    clip: "things-come-in",
    label: "Five ways in, each turned into the same piece of work",
  },
  {
    say: "It's sorted to the right person.",
    chip: "Sorted",
    note: "Passalong's agent titles it, sums it up and sends it to who should act.",
    clip: "agent-sorts-it",
    label: "A messy email turned into a titled card, sent to Accounts",
  },
  {
    say: "Your agent reads the product first.",
    chip: "Project docs",
    note: "Each project's documents tell any agent what it needs before it starts.",
    clip: "projects-remember",
    label: "An agent reads the project's documents and writes a line back",
  },
  {
    say: "It comes back done, with proof.",
    chip: "Handed in",
    note: "A screenshot or a passing test. Not right? Reopen it with a reason.",
    clip: "work-done-shown",
    label: "An agent reports, asks a question, and hands in with a screenshot",
  },
];

const root = ref<HTMLElement | null>(null);
const track = ref<HTMLElement | null>(null);
// Pinned: the panel holds still and the page's scroll walks the steps. Only where it fits on screen.
const pinned = ref(false);
const { index, pick, hovering } = useLandingCycle(STEPS.length, 5200, root, pinned);
const step = computed(() => STEPS[index.value]!);
const calm = ref(false);
const within = ref(0);

let frame = 0;
function measure() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const el = track.value;
    if (!pinned.value || !el) return;
    const box = el.getBoundingClientRect();
    const travel = box.height - window.innerHeight;
    const p = Math.min(1, Math.max(0, -box.top / travel));
    const at = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length));
    index.value = at;
    within.value = Math.min(1, p * STEPS.length - at);
  });
}
function choose(i: number) {
  const el = track.value;
  if (!pinned.value || !el) return pick(i);
  const top = el.getBoundingClientRect().top + window.scrollY;
  const travel = el.offsetHeight - window.innerHeight;
  window.scrollTo({
    top: top + travel * ((i + 0.15) / STEPS.length),
    behavior: calm.value ? "auto" : "smooth",
  });
}

let fits: MediaQueryList | undefined;
const onFit = () => {
  pinned.value = !!fits?.matches;
  measure();
};
onMounted(() => {
  calm.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  fits = window.matchMedia("(min-width: 48rem) and (min-height: 40rem)");
  fits.addEventListener("change", onFit);
  window.addEventListener("scroll", measure, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
  onFit();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  fits?.removeEventListener("change", onFit);
  window.removeEventListener("scroll", measure);
  window.removeEventListener("resize", measure);
});
</script>

<template>
  <div ref="track" class="track" :class="{ pinned }">
  <div ref="root" class="story" @pointerenter="hovering = true" @pointerleave="hovering = false">
    <div class="words">
      <h2>How it works.</h2>
      <p class="said">
        <button
          v-for="(s, i) in STEPS"
          :key="s.clip"
          type="button"
          :aria-pressed="i === index"
          :class="{ on: i === index }"
          @click="choose(i)"
        >
          {{ s.say }}
        </button>
      </p>
      <p class="s-chip">{{ step.chip }}</p>
      <p class="s-note">{{ step.note }}</p>
    </div>
    <div class="screen">
      <Transition name="swap" mode="out-in">
        <video
          :key="step.clip"
          :src="`/media/features/${step.clip}.mp4`"
          :poster="`/media/features/${step.clip}.jpg`"
          :autoplay="!calm"
          muted
          loop
          playsinline
          preload="metadata"
          :aria-label="step.label"
        />
      </Transition>
      <span class="progress" aria-hidden="true">
        <i v-for="(s, i) in STEPS" :key="s.clip" :class="{ on: i === index, past: i < index }">
          <b v-if="pinned && i === index" :style="{ width: `${within * 100}%` }" />
        </i>
      </span>
    </div>
  </div>
  </div>
</template>

<style scoped>
/* Tall enough to scroll through four steps while the panel below stays pinned in the middle. */
.track.pinned {
  height: 300vh;
}
.track.pinned .story {
  position: sticky;
  top: max(var(--s-7), calc(50vh - 17rem));
}
.story {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: var(--s-7);
  align-items: center;
  text-align: left;
}
h2 {
  margin: 0 0 var(--s-2);
  font: 600 var(--t-h3) / 1.3 var(--font-sans);
  letter-spacing: 0;
}
.said {
  margin: 0;
  font: 500 clamp(1.5rem, 1rem + 1.6vw, 2.25rem) / 1.25 var(--font-sans);
  letter-spacing: -0.02em;
}
.said button {
  display: inline;
  padding: 0;
  margin-right: 0.25em;
  border: 0;
  background: none;
  font: inherit;
  letter-spacing: inherit;
  text-align: left;
  color: color-mix(in oklab, var(--muted) 45%, var(--bg));
  cursor: pointer;
  transition: color 0.3s ease;
}
.said button:hover {
  color: var(--muted);
}
.said button.on {
  color: var(--fg);
}
.s-chip {
  display: inline-flex;
  margin: var(--s-6) 0 0;
  padding: var(--s-1) var(--s-3);
  border-radius: var(--r-1);
  background: var(--surface);
  font: 500 var(--t-sm) / 1.4 var(--font-sans);
}
.s-note {
  margin: var(--s-2) 0 0;
  max-width: 24rem;
  color: var(--muted);
}
.screen {
  position: relative;
  border-radius: var(--r-3);
  overflow: hidden;
  background: var(--surface);
  box-shadow: 0 0 0 1px var(--line-strong), var(--shadow-2);
  aspect-ratio: 16 / 10;
}
video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.progress {
  position: absolute;
  left: var(--s-4);
  right: var(--s-4);
  bottom: var(--s-3);
  display: flex;
  gap: var(--s-1);
}
.progress i {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgb(0 0 0 / 0.15);
  overflow: hidden;
}
.progress i.past {
  background: var(--coral);
}
.progress i.on::after {
  content: "";
  display: block;
  height: 100%;
  background: var(--coral);
  animation: fill 5.2s linear both;
}
.story:hover .progress i.on::after {
  animation-play-state: paused;
}
/* Pinned, the bar follows the scroll rather than a clock. */
.pinned .progress i.on::after {
  display: none;
}
.progress b {
  display: block;
  height: 100%;
  background: var(--coral);
}
@keyframes fill {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}
.swap-enter-active,
.swap-leave-active {
  transition:
    opacity 0.3s ease,
    filter 0.3s ease;
}
.swap-enter-from,
.swap-leave-to {
  opacity: 0;
  filter: blur(6px);
}
@media (max-width: 48rem) {
  .story {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-5);
  }
}
@media (prefers-reduced-motion: reduce) {
  .progress i.on::after {
    animation: none;
    width: 100%;
  }
  .swap-enter-from,
  .swap-leave-to {
    filter: none;
  }
}
</style>
