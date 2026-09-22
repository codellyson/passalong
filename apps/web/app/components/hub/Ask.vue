<!--
  One sentence to paste into your agent, and the button that copies it. It stands where a form
  used to: the agent writes the guide, the hub never asks a person to. See app/utils/asks.ts.
-->
<script setup lang="ts">
defineProps<{ text: string }>();
</script>

<template>
  <span class="flex max-w-full min-w-0 items-center gap-2">
    <code class="command min-w-0 truncate">{{ text }}</code>
    <button class="btn shrink-0" type="button" @click="copy(text, $event.currentTarget)">
      <AppIcon name="copy" /><span data-label>Copy</span>
    </button>
  </span>
</template>
