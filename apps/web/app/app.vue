<!--
  The outlet, and the one thing that has to be decided before anything renders: which theme.

  Read from the cookie on the server and stamped on `<html>`, so the page arrives in the theme the
  reader chose rather than repainting into it. `data-theme` sets `color-scheme`, and every colour
  token in styles.css is a `light-dark()` pair that reads it.

  The choice travels to the browser in the payload, not by reading the cookie there: it is HttpOnly,
  so in the browser it reads empty, and on a page that hydrates (the hub) the head was re-rendered
  without the attribute — the switch went through, and the page fell back to the system's theme.
  Same state as AppThemeToggle, so the two never disagree.

  No attribute at all is the default and the third state: the operating system decides, which is
  the right answer for everyone who has never asked for anything else.
-->
<script setup lang="ts">
const cookie = useCookie<string | undefined>("theme", { readonly: true });
const theme = useState<string | undefined>("theme:choice", () => cookie.value);
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
