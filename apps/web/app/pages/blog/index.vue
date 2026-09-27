<!--
  The blog: what we are building and why, newest first.

  Posts are markdown files in content/blog (see server/utils/blog.ts). Script-free like the landing
  and docs: its route rule is `noScripts` with the strict policy. While /blog is a draft in
  shared/pages.ts it renders but is noindex and linked from nowhere.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/blog");
const { data } = await useFetch("/api/blog");
const posts = computed(() => data.value?.posts ?? []);

usePage({
  title: "Passalong blog",
  description:
    "What we are building, and why: handing work between AI coding agents and the people who send it.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});
useHead({
  link: [
    {
      rel: "alternate",
      type: "application/rss+xml",
      title: "Passalong blog",
      href: "/blog/rss.xml",
    },
  ],
});

const long = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <p class="eyebrow">Blog</p>
      <h1>What we're building, <span class="turn">and why.</span></h1>
      <p class="lede">
        Notes on handing work between AI coding agents — and on the people who send it and check
        what comes back.
      </p>
    </header>

    <section class="mx-auto flex w-full max-w-[46rem] flex-col gap-3" aria-label="Posts">
      <NuxtLink
        v-for="p in posts"
        :key="p.slug"
        :to="`/blog/${p.slug}`"
        class="flex flex-col gap-2 rounded-3 bg-raised px-6 py-5 text-fg no-underline transition-transform hover:-translate-y-0.5"
      >
        <span class="font-ui text-xs tracking-widest text-muted uppercase">
          {{ long(p.date) }} · {{ p.minutes }} min read
        </span>
        <span class="text-h2 leading-snug">{{ p.title }}</span>
        <span v-if="p.description" class="font-ui text-base text-muted">{{ p.description }}</span>
      </NuxtLink>
      <p v-if="!posts.length" class="m-0 text-center font-ui text-muted">The first post is on its way.</p>
    </section>

    <AppFoot />
  </main>
</template>
