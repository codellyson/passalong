<!-- A one-shot burst of confetti from the centre of its box, each time `fire` changes. Skipped for reduced motion. -->
<script setup lang="ts">
const props = defineProps<{ fire: number }>();
const box = ref<HTMLElement | null>(null);
const COLORS = ["#f2805d", "#f7c948", "#7fcf6a", "#6aa6f2", "#c58af2", "#f4efe9"];

watch(
  () => props.fire,
  () => {
    const el = box.value;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (let i = 0; i < 46; i++) {
      const bit = document.createElement("i");
      const angle = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 170;
      // Positions go through the CSSOM: the page's style policy refuses style attributes, not this.
      const s = bit.style;
      s.setProperty("--x", `${Math.cos(angle) * dist}px`);
      s.setProperty("--y", `${Math.sin(angle) * dist - 60}px`);
      s.setProperty("--r", `${Math.random() * 720 - 360}deg`);
      s.setProperty("--d", `${700 + Math.random() * 700}ms`);
      s.background = COLORS[i % COLORS.length]!;
      if (i % 3 === 0) s.borderRadius = "50%";
      el.appendChild(bit);
      bit.addEventListener("animationend", () => bit.remove(), { once: true });
    }
  },
);
</script>

<template>
  <span ref="box" class="confetti" aria-hidden="true" />
</template>

<style scoped>
.confetti {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 5;
}
.confetti :deep(i) {
  position: absolute;
  width: 8px;
  height: 12px;
  border-radius: 2px;
  animation: burst var(--d) cubic-bezier(0.15, 0.8, 0.3, 1) forwards;
}
@keyframes burst {
  0% {
    translate: 0 0;
    rotate: 0deg;
    opacity: 1;
    scale: 0.6;
  }
  70% {
    opacity: 1;
  }
  100% {
    translate: var(--x) calc(var(--y) + 120px);
    rotate: var(--r);
    opacity: 0;
    scale: 1;
  }
}
</style>
