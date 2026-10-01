<!--
  The top of a public page: the mark, and the ways in.

  One component rather than the same <nav> in every public page, for the same reason AppFoot is:
  a link added to one copy is a link the others never hear about. Not used inside the hub.

  Docs appears only once /docs is published (shared/pages.ts), so a draft is never linked.
-->
<script setup lang="ts">
import { published } from "#shared/pages";

const docs = published("/docs");
</script>

<template>
  <nav class="masthead">
    <AppBrand />
    <p class="doors">
      <a v-if="docs" class="quiet" href="/docs">Docs</a>
      <AppThemeToggle />
      <!-- One sign-in, not two. The hub *is* the sign-in, so a masthead offering both was the same
           door twice. This is for the returning visitor; the page below is for everyone else. -->
      <a class="btn primary" href="/hub">Sign in</a>
    </p>
  </nav>
</template>
