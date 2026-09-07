<!-- `BRAND` from apps/api/src/render.ts. A plain <a>, not a <NuxtLink>: every page that shows it
     may be served without script, so a router-driven link would be dead on arrival.

     `to` because the mark means different things in different places. On the landing, a guide page
     or the signed-out screen it is the product's front door. Inside the hub it is the way back to
     your own board — sending someone who is signed in out to the marketing page is the one thing
     it should not do. -->
<script setup lang="ts">
withDefaults(defineProps<{ to?: string }>(), { to: "/" });
</script>

<template>
  <a class="brand" :href="to"><img src="/favicon.svg" alt="" />Passalong</a>
</template>
