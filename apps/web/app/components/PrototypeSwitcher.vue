<!--
  PROTOTYPE — the floating bar that flips between UI variants via `?variant=`. Development only:
  it renders nothing in a production build, so a stray merge cannot ship it.
-->
<script setup lang="ts">
const props = defineProps<{ variants: { key: string; name: string }[] }>();
const route = useRoute();
const router = useRouter();
const dev = import.meta.dev;

const current = computed(() => {
  const k = String(route.query.variant || props.variants[0]?.key || "");
  return props.variants.find((v) => v.key === k) ?? props.variants[0];
});
function go(step: number) {
  const i = props.variants.findIndex((v) => v.key === current.value?.key);
  const next = props.variants[(i + step + props.variants.length) % props.variants.length];
  if (next) router.replace({ query: { ...route.query, variant: next.key } });
}
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.("input, textarea, [contenteditable]")) return;
  if (e.key === "ArrowLeft") go(-1);
  if (e.key === "ArrowRight") go(1);
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div
    v-if="dev && current"
    class="fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-pill bg-[#111] px-2 py-1.5 font-ui text-sm text-white shadow-[0_8px_30px_rgb(0_0_0/0.35)] ring-1 ring-white/15"
  >
    <button type="button" class="size-8 cursor-pointer rounded-pill border-0 bg-transparent text-white hover:bg-white/10" aria-label="Previous variant" @click="go(-1)">←</button>
    <span class="px-2 whitespace-nowrap"><b class="text-[#f2805d]">{{ current.key }}</b> {{ current.name }}</span>
    <button type="button" class="size-8 cursor-pointer rounded-pill border-0 bg-transparent text-white hover:bg-white/10" aria-label="Next variant" @click="go(1)">→</button>
  </div>
</template>
