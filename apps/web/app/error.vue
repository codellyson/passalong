<!--
  Ported from apps/api/public/404.html, which the Worker hands back through its ASSETS binding for
  unmatched routes. Here it is Nuxt's error page, so it covers a 500 too — but the copy leads with
  the case that actually happens: a share link whose key did not survive the trip.
-->
<script setup lang="ts">
import type { NuxtError } from "#app";

const props = defineProps<{ error: NuxtError }>();
const notFound = computed(() => props.error?.statusCode === 404);

usePage({
  title: notFound.value ? "Not found · Passalong" : "Something went wrong · Passalong",
  description: "",
  noindex: true,
});
</script>

<template>
  <main>
    <header>
      <AppBrand />
      <h1>{{ notFound ? "Nothing here." : "Something went wrong." }}</h1>
      <div class="meta"><span>{{ error?.statusCode }}</span></div>
    </header>
    <article v-if="notFound">
      <p>
        There is no guide at this address. Share links look like <code>/g/&lt;id&gt;/&lt;key&gt;</code>
        and are only as good as the key: if it was retyped or trimmed, ask for the link again.
      </p>
      <p>If the guide was yours, <code>passalong list</code> shows what is synced.</p>
    </article>
    <article v-else>
      <p>That is on us, not on you. Try again in a moment.</p>
    </article>
    <footer><a href="/">Back to Passalong</a></footer>
  </main>
</template>
