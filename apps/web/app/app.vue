<!--
  The outlet, and the one thing that has to be decided before anything renders: which theme.

  Read from the cookie on the server and stamped on `<html>`, so the page arrives in the theme the
  reader chose rather than repainting into it. Nothing here reads it back on the client — the pages
  that carry the switch run no script — and nothing needs to: `data-theme` sets `color-scheme`, and
  every colour token in styles.css is a `light-dark()` pair that reads it.

  No attribute at all is the default and the third state: the operating system decides, which is
  the right answer for everyone who has never asked for anything else.
-->
<script setup lang="ts">
const theme = useCookie<"light" | "dark" | undefined>("theme", { readonly: true });
useHead({
  htmlAttrs: {
    "data-theme": computed(() =>
      theme.value === "light" || theme.value === "dark" ? theme.value : undefined,
    ),
  },
});
</script>

<template>
  <NuxtPage />
</template>
