<!--
  Tasks are part of /hub now: one page for all work, whatever its kind (docs/V2.md §11). Links
  already out in the world land on the same view with their query intact.
-->
<script setup lang="ts">
definePageMeta({
  redirect: (to) => ({ path: "/hub", query: to.query }),
});
</script>

<template>
  <div />
</template>
