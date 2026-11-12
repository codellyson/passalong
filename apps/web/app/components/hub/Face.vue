<!--
  A person, as two letters in their own colour (`.avatar`, hue from their name: avatarHue in
  utils/people.ts), so the same person is recognisable down a list before the name is read.
  "You" and "Your agent" are drawn as the signed-in person, since that is who they are. An agent
  works as its person's account, so it wears that person's face; the words beside it say it is an
  agent. Decorative: the name is always written next to it.
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{ name: string; size?: "sm" | "md" }>(), { size: "sm" });
const { data } = useHub();
const label = computed(() =>
  /^you(r agent)?$/i.test(props.name.trim()) ? meName(data.value.me) || props.name : props.name,
);
</script>

<template>
  <span
    class="avatar"
    :class="size === 'sm' ? '!size-5 !text-[0.625rem]' : ''"
    :style="{ '--h': avatarHue(label) }"
    aria-hidden="true"
  >{{ initialsOf(label) }}</span>
</template>
