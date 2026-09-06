<!--
  One guide, read-only. Ported from `renderGuide()` in apps/api/src/render.ts.

  No editor, by design: the markdown is edited in whatever tools the author already uses and
  re-shared. The page runs no script at all — its route rule is `noScripts` and its CSP names no
  `script-src`, which is what makes rendering someone else's markdown safe. Nothing here may
  become interactive without giving that up.

  Which is why the rail on the left is a list of links and the views are three URLs. `position:
  sticky` keeps it in view with no scroll handler, but nothing can highlight the section you are
  currently looking at — that needs a scroll listener, and this page will never have one. The
  colour in the contents is what kind of section it is, not where you are.
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
const outline = computed(() => guide.value?.outline || []);

// Frontmatter is hand-editable, and `Meta`'s index signature says as much: any field may come
// back as a scalar or a list. `parseMeta` already normalises the two list fields, but nothing
// stops someone writing `tags: migrations`, so the page copes rather than assuming.
type Field = string | string[] | undefined;
const str = (v: Field) => (Array.isArray(v) ? v.join(", ") : v || "");
const list = (v: Field) => (Array.isArray(v) ? v : v ? [v] : []);

const created = computed(() => str(meta.value?.created).slice(0, 10));

/** The four facts worth a label. Anything empty drops out rather than printing a blank column. */
const facts = computed(() =>
  [
    { label: "id", value: guide.value?.id, mono: true },
    { label: "from", value: str(meta.value?.author), mono: false },
    { label: "out of", value: str(meta.value?.source_context), mono: true },
    { label: "assumes", value: list(meta.value?.stack_assumptions).join(" · "), mono: false },
    { label: "shared", value: created.value, mono: false },
  ].filter((f) => f.value),
);

const views = computed(() => [
  { label: "Full guide", href: url.value, on: view.value !== "verify" },
  {
    label: "Verify — the short cut",
    href: `${url.value}?view=verify`,
    on: view.value === "verify",
  },
  { label: "Markdown source", href: `${url.value}.md`, on: false },
]);

const rail = "font-ui text-xs font-semibold tracking-widest text-muted uppercase";

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
  <main v-if="guide" class="max-w-[64rem] md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10">
    <!-- Sticky with no script: the rail scrolls with the document until it reaches the top and
         then stays. On a narrow screen it is just the top of the page. -->
    <aside class="md:sticky md:top-8 md:self-start md:py-8">
      <AppBrand />

      <nav v-if="outline.length" class="mt-6">
        <p :class="rail">Contents</p>
        <ul class="m-0 mt-2 list-none p-0">
          <li v-for="h in outline" :key="h.id" :class="h.level === 3 ? 'pl-3' : ''">
            <a
              :href="`#${h.id}`"
              class="block py-0.5 font-ui text-sm no-underline hover:text-accent"
              :class="{
                'text-muted': !h.kind,
                'text-fg': h.kind && h.kind !== 'verification' && h.kind !== 'gotchas',
                'text-ok': h.kind === 'verification',
                'text-warn': h.kind === 'gotchas',
              }"
            >{{ h.text }}</a>
          </li>
        </ul>
      </nav>

      <nav class="mt-6">
        <p :class="rail">Views</p>
        <ul class="m-0 mt-2 list-none p-0">
          <li v-for="v in views" :key="v.label">
            <a
              :href="v.href"
              :aria-current="v.on ? 'page' : undefined"
              class="block border-l-2 py-0.5 pl-2 font-ui text-sm no-underline"
              :class="v.on ? 'border-l-accent font-semibold text-fg' : 'border-l-transparent text-muted hover:text-fg'"
            >{{ v.label }}</a>
          </li>
        </ul>
      </nav>
    </aside>

    <div class="min-w-0 md:py-8">
      <header class="mb-6 border-b-0 pb-0">
        <h1 class="mt-0">{{ str(meta?.title) || guide.id }}</h1>

        <p v-if="guide.pulls" class="mt-2 mb-0 font-ui text-sm text-muted">
          pulled {{ guide.pulls }}×
        </p>

        <!-- Labelled, because the difference between the repo it came out of and the stack it
             assumes is not something a reader should have to infer from two grey strings. -->
        <dl
          class="mt-4 mb-0 grid gap-x-6 gap-y-3 border-t border-b border-line py-3 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]"
        >
          <div v-for="f in facts" :key="f.label">
            <dt :class="rail">{{ f.label }}</dt>
            <dd
              class="m-0 mt-0.5 text-sm text-fg"
              :class="f.mono ? 'font-code' : 'font-ui'"
            >{{ f.value }}</dd>
          </div>
        </dl>

        <div v-if="list(meta?.tags).length" class="mt-3 flex flex-wrap gap-2">
          <span v-for="t in list(meta?.tags)" :key="t" class="tag">#{{ t }}</span>
        </div>
      </header>

      <!-- eslint-disable-next-line vue/no-v-html -- see server/utils/guide-html.ts: the CSP is what
           makes this safe, and it is checked by scripts/probe.sh against a deployed response. -->
      <article class="prose" v-html="guide.html" />

      <div v-if="view === 'verify'" class="pull">
        <b class="block font-ui text-sm text-fg">Checked it?</b>
        <p class="mt-1 mb-0 font-ui text-sm text-muted">
          Say so where it was handed to you: <a href="/hub">your hub</a>, or
          <code>passalong done {{ guide.id }}</code>.
        </p>
      </div>
      <div v-else class="pull">
        <b class="block font-ui text-sm text-fg">Pull this into your context</b>
        <p class="mt-1 mb-0 font-ui text-sm text-muted">
          Select the line — a guide page runs no script, so there is no copy button.
        </p>
        <code class="line">passalong pull {{ url }}</code>
        <p class="mt-2 mb-0 font-ui text-sm text-muted">
          Or append <code>.md</code> to this URL for the markdown source.
        </p>
      </div>

      <footer>
        Read-only. Edit the markdown in your own tools and <code>passalong share</code> again.
      </footer>
    </div>
  </main>
</template>
