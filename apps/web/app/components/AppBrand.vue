<!-- `BRAND` from apps/api/src/render.ts. A plain <a>, not a <NuxtLink>: every page that shows it
     may be served without script, so a router-driven link would be dead on arrival. -->
<template>
  <a class="brand" href="/"><img src="/favicon.svg" alt="" />Passalong</a>
</template>
