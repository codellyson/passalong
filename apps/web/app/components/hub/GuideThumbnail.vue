<script setup lang="ts">
const props = defineProps<{
  image?: { url: string; alt: string } | null;
  guide: string;
  title: string;
  /** Hold the image's place when there is none, so titles in a list share one left edge. */
  keepSpace?: boolean;
}>();

const failed = ref(false);
const src = computed(() =>
  /^\/v1\/shots\/[a-z0-9]{6,16}$/.test(props.image?.url || "") ? props.image?.url : "",
);
watch(src, () => {
  failed.value = false;
});
</script>

<template>
  <!-- A fixed box that clips: a percentage height inside a grid cell does not resolve in Safari,
       so the screenshot grew to its own height and ran over the rows around it. -->
  <NuxtLink
    v-if="src && !failed"
    :to="`/hub/g/${guide}`"
    class="block h-24 w-36 shrink-0 overflow-hidden rounded-2 bg-field p-1 shadow-edge"
    :aria-label="`Open ${title || 'guide'} with image`"
  >
    <img
      :src="src"
      :alt="image?.alt || 'Guide image'"
      class="block h-full w-full rounded-1 object-cover object-top"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    >
  </NuxtLink>
  <span v-else-if="keepSpace" class="guide-thumb-empty block h-24 w-36 shrink-0 rounded-2 shadow-edge" aria-hidden="true" />
</template>

<style scoped>
/* No screenshot: a quiet wash in the card's own colours, so the row keeps its shape without
   pretending there is a picture. */
.guide-thumb-empty {
  background: linear-gradient(135deg, var(--field), var(--surface-raised) 70%);
}
</style>
