<!-- A card that turns over to its details, as Droppy's pricing row does. The hidden face is inert. -->
<script setup lang="ts">
defineProps<{ title: string; line: string; more: string; cta?: { label: string; href: string } }>();

const flipped = ref(false);
const front = ref<HTMLElement | null>(null);
const back = ref<HTMLElement | null>(null);
const id = useId();

// The whole back turns the card over again, except its link, which goes where it says.
function backClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest("a")) return;
  turn(false);
}
function turn(to: boolean) {
  flipped.value = to;
  // Focus follows the face that turned toward the reader, after the turn has started.
  nextTick(() =>
    (to ? back.value : front.value)
      ?.querySelector<HTMLElement>("a, button")
      ?.focus({ preventScroll: true }),
  );
}
</script>

<template>
  <article class="flip" :class="{ flipped }">
    <div class="inner">
      <div ref="front" class="face front" :inert="flipped" :aria-hidden="flipped" @click="turn(true)">
        <span class="glyph"><slot name="glyph" /></span>
        <h3>{{ title }}</h3>
        <p>{{ line }}</p>
        <button type="button" class="plus" :aria-label="`More about ${title}`" :aria-controls="id" :aria-expanded="flipped" @click.stop="turn(true)" />
      </div>
      <div :id="id" ref="back" class="face back" :inert="!flipped" :aria-hidden="!flipped" @click="backClick">
        <p class="title">{{ title }}</p>
        <p class="more">{{ more }}</p>
        <a v-if="cta" class="go" :href="cta.href">{{ cta.label }}</a>
        <button type="button" class="plus close" aria-label="Close" @click.stop="turn(false)" />
      </div>
    </div>
  </article>
</template>

<style scoped>
.flip {
  flex: none;
  width: 16.5rem;
  perspective: 1600px;
  scroll-snap-align: start;
  transition: translate 0.42s var(--ease-out);
}
.flip:hover {
  translate: 0 -4px;
}
.inner {
  display: grid;
  min-height: 18rem;
  transform-style: preserve-3d;
  transition: transform 0.72s cubic-bezier(0.45, 0, 0.2, 1);
}
.flipped .inner {
  transform: rotateY(180deg);
}
.face {
  grid-area: 1 / 1;
  position: relative;
  display: flex;
  flex-direction: column;
  padding: var(--s-5) var(--s-5) calc(var(--s-5) + 2.25rem + var(--s-4));
  border-radius: var(--r-3);
  background: var(--surface-raised);
  box-shadow: 0 0 0 1px var(--line);
  backface-visibility: hidden;
  text-align: left;
}
.back {
  transform: rotateY(180deg);
}
.face {
  cursor: pointer;
  user-select: none;
}
/* Pointing anywhere on the card lights its button, so the whole card reads as one control. */
.face:hover .plus {
  background: color-mix(in oklab, var(--fg) 14%, transparent);
}
.glyph {
  display: block;
  width: 2rem;
  height: 2rem;
  margin-bottom: var(--s-5);
  color: var(--fg);
}
.glyph :slotted(svg) {
  width: 100%;
  height: 100%;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
h3,
.title {
  margin: 0;
  font: 600 1.375rem / 1.2 var(--font-sans);
  letter-spacing: -0.015em;
  color: var(--fg);
}
.front p {
  margin: var(--s-2) 0 0;
  color: var(--muted);
}
.more {
  margin: var(--s-2) 0 0;
  color: var(--muted);
  text-wrap: pretty;
}
.go {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  height: 2.125rem;
  margin-top: var(--s-4);
  padding: 0 var(--s-4);
  border-radius: var(--r-pill);
  background: var(--fg);
  color: var(--bg);
  font: 600 var(--t-sm) / 1 var(--font-sans);
  text-decoration: none;
}
.go:active {
  scale: 0.96;
}
.plus {
  position: absolute;
  right: var(--s-5);
  bottom: var(--s-5);
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 0;
  border-radius: var(--r-pill);
  background: color-mix(in oklab, var(--fg) 8%, transparent);
  color: var(--fg);
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.plus:hover {
  background: color-mix(in oklab, var(--fg) 14%, transparent);
}
.plus::before,
.plus::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.875rem;
  height: 1.5px;
  border-radius: 1px;
  background: currentColor;
  translate: -50% -50%;
}
.plus::after {
  rotate: 90deg;
}
.close::before {
  rotate: 45deg;
}
.close::after {
  rotate: -45deg;
}
@media (prefers-reduced-motion: reduce) {
  .inner {
    transition-duration: 0.01s;
  }
  .flip:hover {
    translate: none;
  }
}
</style>
