<!--
  One /learn page: a long-lived guide to a topic, rather than a dated post. The body is our own
  markdown from content/learn, rendered on the server by the blog's reader, under the same
  no-script policy as every public page.

  Whether it is indexed is decided in one place, shared/pages.ts: a page not listed there as
  published renders for review, noindex and unlinked, whatever its frontmatter says.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { published } from "#shared/pages";

const route = useRoute();
const slug = computed(() => String(route.params.slug));
const { data: page } = await useFetch(() => `/api/learn/${encodeURIComponent(slug.value)}`);
if (!page.value) throw createError({ statusCode: 404, statusMessage: "no such page" });

const path = `/learn/${page.value.slug}`;
const url = `${APEX}${path}`;
const draft = !published(path);

usePage({
  title: `${page.value.title} · Passalong`,
  description: page.value.description,
  url,
  image: `${APEX}/og.png`,
  noindex: draft,
  type: "article",
});

// For search engines only: no browser runs it, and no CSP governs it (see server/plugins/csp.ts).
if (!draft) {
  useHead({
    script: [
      {
        type: "application/ld+json",
        innerHTML: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "TechArticle",
              "@id": `${url}#article`,
              headline: page.value.title,
              description: page.value.description,
              url,
              mainEntityOfPage: url,
              dateModified: page.value.date,
              image: `${APEX}/og.png`,
              author: { "@id": `${APEX}/#organization` },
              publisher: { "@id": `${APEX}/#organization` },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Passalong", item: `${APEX}/` },
                { "@type": "ListItem", position: 2, name: page.value.title, item: url },
              ],
            },
          ],
        }),
      },
    ],
  });
}

const long = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
</script>

<template>
  <main v-if="page" class="wide landing">
    <AppMasthead />

    <div class="mx-auto w-full max-w-[42rem] pt-12">
      <p class="m-0 font-ui text-sm text-muted">
        Updated {{ long(page.date) }} · {{ page.minutes }} min read
      </p>
      <p v-if="draft" class="mt-3 mb-0 inline-block rounded-pill bg-warn-soft px-3 py-1 font-ui text-xs text-warn">
        Draft — not listed, not indexed
      </p>
      <h1 class="mt-4 mb-4 text-[clamp(2rem,1.4rem+2.6vw,3rem)] leading-[1.08]">{{ page.title }}</h1>
      <p v-if="page.description" class="lede !mx-0 !mb-10 text-left">{{ page.description }}</p>
      <!-- eslint-disable-next-line vue/no-v-html -- our own markdown, rendered on the server, on a
           page whose policy runs no script -->
      <article class="prose" v-html="page.html" />
    </div>

    <AppFoot />
  </main>
</template>
