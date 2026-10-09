<script setup lang="ts">
const props = defineProps<{
  image?: { url: string; alt: string } | null;
  guide: string;
  title: string;
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
  <NuxtLink
    v-if="src && !failed"
    :to="`/hub/g/${guide}`"
    class="grid h-24 w-36 shrink-0 place-items-center rounded-2 bg-field p-1 shadow-edge"
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
</template>
