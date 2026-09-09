<!--
  A value too long for its line, shortened to whole units — and openable.

  The native `title` tooltip used to be the only way to see the rest: unstyled, on a delay, and
  unreachable on a touch device. This is a button instead, so the whole value is one tap or one
  Enter away and the row says out loud that it is holding something back.

  It does not look like a button. The meta line is reference material, and a control styled like
  the ones that do things would claim more of the row than "there is more of this" is worth.
-->
<script setup lang="ts">
const props = defineProps<{ value: string | null | undefined; max?: number }>();

const short = computed(() => shorten(props.value, props.max));
const open = ref(false);

// A row rebound to a different guide must not keep the last one's disclosure open.
watch(
  () => props.value,
  () => {
    open.value = false;
  },
);
</script>

<template>
  <span v-if="!short.clipped">{{ short.full }}</span>
  <button
    v-else
    type="button"
    class="unfold"
    :aria-expanded="open"
    @click="open = !open"
  >{{ open ? short.full : short.text }}</button>
</template>
