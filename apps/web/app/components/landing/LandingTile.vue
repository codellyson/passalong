<!-- A glossy app-icon tile for a real logo, with a light sheen that follows the pointer when `tilt` is on. -->
<script setup lang="ts">
import type { Tile } from "~/utils/landing-logos";

const props = defineProps<{ tile?: Tile; tilt?: boolean; flat?: boolean }>();
const el = ref<HTMLElement | null>(null);
let calm = true;
let frame = 0;

onMounted(() => {
  calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
});
onBeforeUnmount(() => cancelAnimationFrame(frame));

// Custom properties set through the CSSOM, which the page's style policy allows where a style attribute is not.
function move(e: PointerEvent) {
  if (!props.tilt || calm || e.pointerType !== "mouse" || !el.value) return;
  const r = el.value.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const s = el.value?.style;
    s?.setProperty("--rx", `${(0.5 - y) * 22}deg`);
    s?.setProperty("--ry", `${(x - 0.5) * 22}deg`);
    s?.setProperty("--mx", `${x * 100}%`);
    s?.setProperty("--my", `${y * 100}%`);
  });
}
function leave() {
  cancelAnimationFrame(frame);
  const s = el.value?.style;
  for (const p of ["--rx", "--ry", "--mx", "--my"]) s?.removeProperty(p);
}
</script>

<template>
  <span
    ref="el"
    class="tile"
    :class="[tile ? `t-${tile.key}` : 't-plain', { full: tile?.full, tilt, flat }]"
    @pointermove="move"
    @pointerleave="leave"
  >
    <img v-if="tile?.img" :src="tile.img" alt="" draggable="false" />
    <svg v-else-if="tile?.d" viewBox="0 0 24 24" aria-hidden="true"><path :d="tile.d" /></svg>
    <slot v-else />
  </span>
</template>

<style scoped>
.tile {
  --rx: 0deg;
  --ry: 0deg;
  --mx: 30%;
  --my: 0%;
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 4.5rem;
  aspect-ratio: 1;
  border-radius: 23%;
  overflow: hidden;
  isolation: isolate;
  color: var(--fg);
  background: var(--surface-raised);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.55),
    inset 0 -2px 4px rgb(0 0 0 / 0.14),
    0 0 0 0.5px rgb(0 0 0 / 0.12),
    0 1px 2px rgb(0 0 0 / 0.12),
    0 10px 20px -8px rgb(0 0 0 / 0.35),
    0 24px 44px -20px rgb(0 0 0 / 0.35);
  transform: perspective(500px) rotateX(var(--rx)) rotateY(var(--ry));
  transition:
    transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    translate 0.3s var(--ease-out);
  user-select: none;
}
.tilt:hover {
  transition: transform 0.12s linear;
}
/* The sheen: a soft light from above that slides with the pointer, and a glassy top half. */
.tile::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    radial-gradient(120% 90% at var(--mx) var(--my), rgb(255 255 255 / 0.4), transparent 55%),
    linear-gradient(180deg, rgb(255 255 255 / 0.22), rgb(255 255 255 / 0) 48%, rgb(0 0 0 / 0.06));
  mix-blend-mode: soft-light;
}
img,
svg {
  position: relative;
  z-index: 1;
  width: 58%;
  height: 58%;
  object-fit: contain;
  filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.18));
}
svg {
  width: 52%;
  height: 52%;
  fill: currentColor;
}
.full img {
  width: 100%;
  height: 100%;
  filter: none;
}
:slotted(svg) {
  width: 46%;
  height: 46%;
}

.t-plain {
  background: linear-gradient(180deg, var(--bg), var(--surface));
}
.t-claude {
  background: #f4f1ea;
}
.t-openai {
  background: #fff;
  color: #0d0d0d;
}
.t-cursor {
  background: #f7f7f4;
}
.t-gemini,
.t-vscode {
  background: #fff;
}
.t-copilot {
  background: linear-gradient(160deg, #2b3138, #0d1117);
  color: #fff;
}
.t-jira,
.t-trello {
  background: #0052cc;
  color: #fff;
}
.t-linear {
  background: #5e6ad2;
  color: #fff;
}
.t-windsurf {
  background: #f9f3e9;
}
.t-zed {
  background: linear-gradient(160deg, #2f6df0, #084ccf);
  color: #fff;
}
.t-sentry {
  background: linear-gradient(160deg, #4b3f78, #362d59);
  color: #fff;
}
.t-github {
  background: linear-gradient(160deg, #343434, #181717);
  color: #fff;
}
/* Flat: the logo on its own colour and a hairline, nothing lit. */
.flat {
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
  transform: none;
}
.flat::after {
  display: none;
}
.flat img,
.flat svg {
  filter: none;
}
@media (prefers-reduced-motion: reduce) {
  .tile {
    transform: none;
  }
}
</style>
