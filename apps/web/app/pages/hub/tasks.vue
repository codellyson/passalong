<!--
  Tasks are part of /hub/work now: one page for all work. Links
  already out in the world land on the same view with their query intact.
-->
<script setup lang="ts">
definePageMeta({
  redirect: (to) => ({ path: "/hub/work", query: to.query }),
});
</script>

<template>
  <div />
</template>
