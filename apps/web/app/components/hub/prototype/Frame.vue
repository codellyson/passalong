<!--
  PROTOTYPE — hub guide page variants. Delete with the prototype.

  The share page, framed and grown to its own height, so the guide flows with the page instead of
  scrolling inside a box. Same-origin, so the hub can read the framed document's height; the frame
  still runs no script of its own (sandbox without allow-scripts). The parent only measures.
-->
<script setup lang="ts">
const props = defineProps<{ src: string; title: string }>();
const el = ref<HTMLIFrameElement | null>(null);
const height = ref(600);
let watcher: ResizeObserver | null = null;

// The body's own height, not the root's scroll height: the root is at least as tall as the frame,
// so measuring it could only ever grow the frame and never shrink it to a short guide.
function fit() {
  const doc = el.value?.contentDocument;
  if (!doc?.body) return;
  const measure = () => {
    height.value = Math.max(120, Math.ceil(doc.body.getBoundingClientRect().height));
  };
  measure();
  watcher?.disconnect();
  watcher = new ResizeObserver(measure);
  watcher.observe(doc.body);
}

onBeforeUnmount(() => watcher?.disconnect());
watch(
  () => props.src,
  () => (height.value = 600),
);
</script>

<template>
  <iframe
    ref="el"
    :src="src"
    :title="title"
    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    referrerpolicy="no-referrer"
    scrolling="no"
    class="block w-full border-0 bg-transparent"
    :style="{ height: `${height}px` }"
    @load="fit"
  />
</template>
