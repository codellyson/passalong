<!--
  The old list page is part of /hub/work now: its search and its `?follows=` filter moved there. Links already out in the world — a search, `?follows=` from a row menu, the free-tier warning —
  land on the same view with their query intact.
-->
<script setup lang="ts">
definePageMeta({
  redirect: (to) => ({ path: "/hub/work", query: to.query }),
});
</script>

<template>
  <div />
</template>
