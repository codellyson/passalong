<!--
  The top of a public page: the mark, and the ways in.

  One component rather than the same <nav> in every public page, for the same reason AppFoot is:
  a link added to one copy is a link the others never hear about. Not used inside the hub.

  Someone with a session cookie is offered the hub rather than a sign-in they do not need. The page
  is rendered per request and varies on the cookie (nuxt.config.ts), so nobody is shown another
  visitor's version.

  Docs appears only once /docs is published (shared/pages.ts), so a draft is never linked.
-->
<script setup lang="ts">
import { published } from "#shared/pages";
import { hasSession } from "~/utils/session";

const docs = published("/docs");
// Read on the server and carried to the client by useState: these pages never hydrate, so the
// cookie header is the only place the answer can come from.
const signedIn = useState("masthead:signed-in", () =>
  import.meta.server ? hasSession(useRequestHeaders(["cookie"]).cookie) : false,
);
</script>

<template>
  <nav class="masthead">
    <AppBrand />
    <p class="doors">
      <a v-if="docs" class="quiet" href="/docs">Docs</a>
      <AppThemeToggle />
      <!-- One sign-in, not two. The hub *is* the sign-in, so a masthead offering both was the same
           door twice. This is for the returning visitor; the page below is for everyone else. -->
      <a class="btn primary" href="/hub">{{ signedIn ? "Open hub" : "Sign in" }}</a>
    </p>
  </nav>
</template>
