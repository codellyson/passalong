<!--
  A shared project, read-only, the way a piece of work's share link is: anyone holding /p/:id/:key can read
  the project it was made for and every project inside it, with no account. Like a work page it runs
  no script (`noScripts` on /p/**), so moving around is links — `?in=` for a project inside, `?doc=`
  for a document — and the server draws each view. Files are downloaded, never shown inline.
  Linked work is left out on purpose: they have share links of their own, and a project's link
  must not hand them out.
-->
<script setup lang="ts">
const route = useRoute();
const id = computed(() => String(route.params.id));
const key = computed(() => String(route.params.key));
const inside = computed(() => (typeof route.query.in === "string" ? route.query.in : ""));
const doc = computed(() => (typeof route.query.doc === "string" ? route.query.doc : ""));

const { data } = await useFetch(
  () => `/api/project/${encodeURIComponent(id.value)}/${encodeURIComponent(key.value)}`,
  { query: { in: inside, doc } },
);
if (!data.value) throw createError({ statusCode: 404, statusMessage: "no such project" });

const base = computed(() => `/p/${id.value}/${key.value}`);
/** A link to a project within the share, the root itself without the `in`. */
const projectLink = (project: string) =>
  project === id.value ? base.value : `${base.value}?in=${project}`;
const docLink = (document: string) =>
  `${base.value}?${data.value?.project.id === id.value ? "" : `in=${data.value?.project.id}&`}doc=${document}`;
const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const rail = "font-ui text-xs font-semibold tracking-widest text-muted uppercase";

usePage({
  title: data.value.project.title,
  description: data.value.project.description || "A shared Passalong project.",
  noindex: true,
});
</script>

<template>
  <main v-if="data" class="max-w-[64rem] md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10">
    <nav class="mb-8 flex flex-col gap-6 font-ui text-sm md:sticky md:top-6 md:self-start" aria-label="In this project">
      <div v-if="data.children.length" class="flex flex-col gap-1">
        <p :class="rail" class="m-0 mb-1">Projects</p>
        <a v-for="child in data.children" :key="child.id" :href="projectLink(child.id)" class="no-underline hover:underline">{{ child.title }}</a>
      </div>
      <div v-if="data.documents.length" class="flex flex-col gap-1">
        <p :class="rail" class="m-0 mb-1">Documents</p>
        <a
          v-for="d in data.documents"
          :key="d.id"
          :href="docLink(d.id)"
          class="no-underline hover:underline"
          :class="d.id === data.document?.id ? 'font-medium text-fg' : 'text-muted'"
          :aria-current="d.id === data.document?.id ? 'page' : undefined"
        >{{ d.name }}</a>
      </div>
      <div v-if="data.files.length" class="flex flex-col gap-1">
        <p :class="rail" class="m-0 mb-1">Files</p>
        <a v-for="f in data.files" :key="f.id" :href="`${base}/files/${f.id}`" class="no-underline hover:underline" download>
          {{ f.name }} <span class="text-xs text-muted">· {{ size(f.bytes) }}</span>
        </a>
      </div>
    </nav>

    <div class="min-w-0">
      <p class="m-0 mb-2 font-ui text-xs text-muted">Shared project</p>
      <nav v-if="data.crumbs.length > 1" class="mb-2 flex flex-wrap items-center gap-2 font-ui text-sm" aria-label="Project path">
        <template v-for="(crumb, index) in data.crumbs" :key="crumb.id">
          <span v-if="index" class="text-muted" aria-hidden="true">/</span>
          <span v-if="index === data.crumbs.length - 1" class="font-medium">{{ crumb.title }}</span>
          <a v-else :href="projectLink(crumb.id)" class="text-muted no-underline hover:underline">{{ crumb.title }}</a>
        </template>
      </nav>
      <h1 class="m-0">{{ data.project.title }}</h1>
      <p v-if="data.project.description" class="m-0 mt-2 text-muted">{{ data.project.description }}</p>

      <section v-if="data.document" class="mt-8 border-t border-line pt-8" aria-label="Document">
        <h2 v-if="!data.document.html.trimStart().startsWith('<h1')" class="m-0 mb-6">{{ data.document.name }}</h2>
        <!-- Sanitised by renderProjectMarkdown on the server before it reaches v-html. -->
        <article class="prose" v-html="data.document.html" />
      </section>
      <p v-else-if="!data.children.length && !data.files.length" class="mt-8 text-muted">Nothing here yet.</p>
    </div>
  </main>
</template>
