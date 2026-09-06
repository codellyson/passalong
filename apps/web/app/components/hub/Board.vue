<!--
  The board: two lanes, not five boxes. What is waiting on you sits above what is waiting on
  someone else, because those are two different people opening the same screen for two different
  reasons — and the old grid gave them the same weight, the same size and the same colour.
-->
<script setup lang="ts">
const { data } = useHub();
</script>

<template>
  <div v-if="data.board">
    <HubWaiting />
    <HubHandoffs />
  </div>
</template>
