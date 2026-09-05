<!--
  One guide, read-only. Ported from `renderGuide()` in apps/api/src/render.ts.

  No editor, by design: the markdown is edited in whatever tools the author already uses and
  re-shared. The page runs no script at all — its route rule is `noScripts` and its CSP names no
  `script-src`, which is what makes rendering someone else's markdown safe. Nothing here may
  become interactive without giving that up.
-->
<script setup lang="ts">
const route = useRoute();
const id = computed(() => String(route.params.id));
const key = computed(() => String(route.params.key));
const view = computed(() => (route.query.view === "verify" ? "verify" : "guide"));

const { data: guide } = await useFetch(
  () => `/api/guide/${encodeURIComponent(id.value)}/${encodeURIComponent(key.value)}`,
  { query: { view } },
);
if (!guide.value) throw createError({ statusCode: 404, statusMessage: "no such guide" });

/** Share links are built from the host that served them, so each serving host stays consistent. */
const url = computed(() => `${useRequestURL().origin}/g/${id.value}/${guide.value?.shareKey}`);
const meta = computed(() => guide.value?.meta);

// Frontmatter is hand-editable, and `Meta`'s index signature says as much: any field may come
// back as a scalar or a list. `parseMeta` already normalises the two list fields, but nothing
// stops someone writing `tags: migrations`, so the page copes rather than assuming.
type Field = string | string[] | undefined;
const str = (v: Field) => (Array.isArray(v) ? v.join(", ") : v || "");
const list = (v: Field) => (Array.isArray(v) ? v : v ? [v] : []);

const created = computed(() => str(meta.value?.created).slice(0, 10));

usePage({
  title: str(meta.value?.title) || id.value,
  description: guide.value?.description || "",
  url: url.value,
  // A guide travels as a pasted link — in Slack, in a DM, into an agent. The unfurl card is the
  // first thing anyone sees of it, so it is rendered per guide rather than left blank. The image
  // itself is still served by apps/api (`workers-og` is wasm), so it only resolves once the two
  // halves share a host again at the cutover.
  image: `${url.value}/og.png`,
  noindex: true,
});
</script>

<template>
  <main v-if="guide">
    <header>
      <AppBrand />
      <h1>{{ str(meta?.title) || guide.id }}</h1>
      <div class="meta">
        <span>id <b>{{ guide.id }}</b></span>
        <span class="status">{{ str(meta?.status) }}</span>
        <span v-if="meta?.source_context">from <b>{{ str(meta.source_context) }}</b></span>
        <span v-if="meta?.author">by <b>{{ str(meta.author) }}</b></span>
        <span v-if="created">{{ created }}</span>
        <span v-if="list(meta?.stack_assumptions).length">
          assumes <b>{{ list(meta?.stack_assumptions).join(", ") }}</b>
        </span>
        <span v-for="t in list(meta?.tags)" :key="t" class="tag">#{{ t }}</span>
      </div>
    </header>

    <!-- Links, not a toggle: this page runs no script, so switching views is a navigation. -->
    <nav class="views">
      <a :class="{ on: view !== 'verify' }" :aria-current="view !== 'verify' ? 'page' : undefined" :href="url">
        Full guide
      </a>
      <a :class="{ on: view === 'verify' }" :aria-current="view === 'verify' ? 'page' : undefined" :href="`${url}?view=verify`">
        Verify
      </a>
    </nav>

    <!-- eslint-disable-next-line vue/no-v-html -- see server/utils/guide-html.ts: the CSP is what
         makes this safe, and it is checked by scripts/probe.sh against a deployed response. -->
    <article class="prose" v-html="guide.html" />

    <div v-if="view === 'verify'" class="pull">
      Checked it? Say so where it was handed to you: <a href="/hub">your hub</a> — or
      <code>passalong done {{ guide.id }}</code>.
    </div>
    <div v-else class="pull">
      Pull this into your context:<br />
      <code>passalong pull {{ url }}</code><br />
      or paste the link to an agent with the Passalong MCP server.
    </div>

    <footer>
      Read-only. Edit the markdown in your own tools and <code>passalong share</code> again.
    </footer>
  </main>
</template>
