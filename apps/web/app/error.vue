<!--
  Nuxt's error page, for three different people.

  Someone whose guide link broke — usually trimmed or retyped on the way — needs to ask for it
  again. Someone whose invite stopped working needs a fresh invite, and used to be shown this same
  page talking about guide URLs and `passalong list`. Everyone else hit a real error, which is ours.
  None of them is helped by a bare status code or a URL format.
-->
<script setup lang="ts">
import type { NuxtError } from "#app";

const props = defineProps<{ error: NuxtError }>();
const path = useRequestURL().pathname;

const kind = computed(() => {
  if (props.error?.statusMessage === "invite" || path.startsWith("/join/")) return "invite";
  if (props.error?.statusCode !== 404) return "broken";
  if (path.startsWith("/g/")) return "guide";
  return "missing";
});

const COPY = {
  invite: {
    title: "This invite doesn't work any more",
    body: "It may have been used already, or replaced with a new one. Ask the person who sent it for a fresh link.",
  },
  guide: {
    title: "This guide link doesn't work",
    body: "Part of the link may have been cut off when it was copied, or the guide was deleted. Ask whoever sent it for the link again.",
  },
  missing: {
    title: "There's nothing at this address",
    body: "Check the link, or go to your guides.",
  },
  broken: {
    title: "Something went wrong on our side",
    body: "It isn't anything you did. Try again in a moment.",
  },
} as const;

const copyFor = computed(() => COPY[kind.value]);

usePage({
  title: `${copyFor.value.title} · Passalong`,
  description: "",
  noindex: true,
});
</script>

<template>
  <main>
    <header>
      <AppBrand />
      <h1>{{ copyFor.title }}</h1>
    </header>
    <article>
      <p>{{ copyFor.body }}</p>
      <p class="flex flex-wrap gap-3">
        <a v-if="kind === 'broken'" class="btn primary" :href="path">Try again</a>
        <a class="btn" :class="kind === 'broken' ? '' : 'primary'" href="/hub">Go to your guides</a>
        <a class="btn" href="/">Passalong home</a>
      </p>
    </article>
  </main>
</template>
