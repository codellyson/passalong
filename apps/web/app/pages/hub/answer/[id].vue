<!--
  Where the buttons on a share page used to lead, to say whether you were taking it and how it
  went. All work is now taken and finished the same way, on its own page in the hub, so this only
  forwards there — links already sent in mail and chat keep working.
-->
<script setup lang="ts">
const route = useRoute();
await navigateTo(`/hub/g/${encodeURIComponent(String(route.params.id))}`, { replace: true });
</script>

<template>
  <div />
</template>
