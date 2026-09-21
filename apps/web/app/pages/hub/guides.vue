<!--
  The list of every guide is part of /hub now: its search and its follow-up filter moved there with
  it. Links already out in the world — a search, `?follows=` from a row menu, the free-tier warning —
  land on the same view with their query intact.
-->
<script setup lang="ts">
definePageMeta({
  redirect: (to) => ({ path: "/hub", query: to.query }),
});
</script>

<template>
  <div />
</template>
