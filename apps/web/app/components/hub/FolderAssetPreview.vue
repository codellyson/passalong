<script setup lang="ts">
const props = defineProps<{ folder: string; asset: string; type: string; name: string }>();
const { token } = useHub();
const source = ref("");

onMounted(async () => {
  if (!props.type.startsWith("image/")) return;
  try {
    const headers: Record<string, string> = {};
    if (token.value) headers.authorization = `Bearer ${token.value}`;
    const response = await fetch(`/v1/folders/${props.folder}/assets/${props.asset}`, { headers });
    if (response.ok) source.value = URL.createObjectURL(await response.blob());
  } catch {
    // The labelled file row remains useful when a preview cannot be fetched.
  }
});
onUnmounted(() => {
  if (source.value) URL.revokeObjectURL(source.value);
});
</script>

<template>
  <img v-if="source" :src="source" :alt="name" class="h-14 w-14 shrink-0 rounded-2 object-cover" />
  <span v-else class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2 bg-field font-ui text-xs font-medium uppercase text-muted" aria-hidden="true">{{ type.startsWith("image/") ? "IMG" : name.split(".").pop()?.slice(0, 4) || "FILE" }}</span>
</template>
