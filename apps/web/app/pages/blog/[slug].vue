<!--
  One blog post: the title and date, then the body in the reading face guides use.

  The body is rendered on the server from our own markdown (server/utils/blog.ts), under the same
  no-script policy as every public page. A draft renders at its address for review, noindex.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";

const route = useRoute();
const slug = computed(() => String(route.params.slug));
const { data: post } = await useFetch(() => `/api/blog/${encodeURIComponent(slug.value)}`);
if (!post.value) throw createError({ statusCode: 404, statusMessage: "no such post" });

usePage({
  title: `${post.value.title} · Passalong`,
  description: post.value.description,
  url: `${APEX}/blog/${post.value.slug}`,
  image: `${APEX}/og.png`,
  noindex: post.value.draft,
  type: "article",
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
  <main v-if="post" class="wide landing">
    <AppMasthead />

    <div class="mx-auto w-full max-w-[42rem] pt-12">
      <p class="m-0 font-ui text-sm text-muted">
        <NuxtLink to="/blog" class="text-muted">Blog</NuxtLink>
        · {{ long(post.date) }} · {{ post.minutes }} min read
        <template v-if="post.author"> · {{ post.author }}</template>
      </p>
      <p v-if="post.draft" class="mt-3 mb-0 inline-block rounded-pill bg-warn-soft px-3 py-1 font-ui text-xs text-warn">
        Draft — not listed, not indexed
      </p>
      <h1 class="mt-4 mb-4 text-[clamp(2rem,1.4rem+2.6vw,3rem)] leading-[1.08]">{{ post.title }}</h1>
      <p v-if="post.description" class="lede !mx-0 !mb-10 text-left">{{ post.description }}</p>
      <!-- eslint-disable-next-line vue/no-v-html -- our own markdown, rendered on the server, on a
           page whose policy runs no script -->
      <article class="prose" v-html="post.html" />
      <p class="mt-12 border-t border-line pt-6 font-ui text-sm">
        <NuxtLink to="/blog">← All posts</NuxtLink>
      </p>
    </div>

    <AppFoot />
  </main>
</template>
