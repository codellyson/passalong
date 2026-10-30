<!--
  One piece of work, read-only, as whoever holds the link reads it.

  No editor, by design: the document is written by whoever made the work and changed through the
  hub or an agent. The page runs no script at all — its route rule is `noScripts` and its CSP names
  no `script-src`, which is what makes rendering someone else's markdown safe. Nothing here may
  become interactive without giving that up.

  Which is why the rail on the left is a list of links. `position: sticky` keeps it in view with no
  scroll handler, but nothing can highlight the section you are currently looking at — that needs a
  scroll listener, and this page will never have one. The document is rendered as it was written:
  no heading means anything to the page, so none is coloured, reordered or moved.
-->
<script setup lang="ts">
const route = useRoute();
const id = computed(() => String(route.params.id));
const key = computed(() => String(route.params.key));

/**
 * The document alone, for the hub's page about this work, which frames it. The hub draws the title,
 * where the work has got to and every way to answer it beside the frame, so here the rail, the
 * heading and the answer box would each be said twice. Still this page, with this page's headers
 * and no script: the frame is how the hub shows the document without rendering it itself.
 *
 * Nothing in the frame may navigate the frame. A link that did would load a page without this flag,
 * and the full page — rail and title — would come back squeezed into the hub's column. So every
 * link opens a tab of its own (the frame's sandbox lets exactly that out), and the lists of work
 * this is tied to give way to the hub's "Tied to", which leads to the hub's page for each.
 */
const embed = computed(() => route.query.embed === "1");

if (embed.value) useHead({ base: { target: "_blank" } });

const { data: work } = await useFetch(
  () => `/api/guide/${encodeURIComponent(id.value)}/${encodeURIComponent(key.value)}`,
);
if (!work.value) throw createError({ statusCode: 404, statusMessage: "no such work" });

/** Share links are built from the host that served them, so each serving host stays consistent. */
const url = computed(() => `${useRequestURL().origin}/g/${id.value}/${work.value?.shareKey}`);
const meta = computed(() => work.value?.meta);
const outline = computed(() => work.value?.outline || []);

// Frontmatter is hand-editable, and `Meta`'s index signature says as much: any field may come back
// as a scalar or a list. `parseMeta` already normalises the list fields, but nothing stops someone
// writing `tags: migrations`, so the page copes rather than assuming.
type Field = string | string[] | undefined;
const str = (v: Field) => (Array.isArray(v) ? v.join(", ") : v || "");
const list = (v: Field) => (Array.isArray(v) ? v : v ? [v] : []);

/**
 * The facts worth a label. Anything empty drops out rather than printing a blank column. `assumes`
 * is a sentence where the rest are a word or two, so long values take a row to themselves.
 */
const facts = computed(() =>
  [
    { label: "from", value: str(meta.value?.author) },
    { label: "sent", value: str(meta.value?.created).slice(0, 10) },
    { label: "project", value: str(meta.value?.source_context) },
    { label: "repo", value: str(meta.value?.target_context) },
    { label: "waits on", value: list(meta.value?.blocked_by).join(" · ") },
    { label: "assumes", value: list(meta.value?.stack_assumptions).join(" · ") },
  ]
    .filter((f) => f.value)
    .map((f) => ({ ...f, wide: f.value.length > 40 })),
);

/**
 * Where taking it leads. This page runs no script, so it cannot hold a form: the button is a link
 * to the work in the hub, which signs the visitor in if needed and offers I'll do this there.
 */
const inHub = computed(() => `/hub/g/${encodeURIComponent(id.value)}`);
const author = computed(() => str(meta.value?.author) || "whoever sent it");
/** Work made from this one, oldest first, and the work this came from. */
const children = computed(() => work.value?.children ?? []);
const parent = computed(() => work.value?.parent ?? null);

const rail = "font-ui text-xs font-semibold tracking-widest text-muted uppercase";

usePage({
  title: str(meta.value?.title) || id.value,
  description: work.value?.description || "",
  url: url.value,
  // Work travels as a pasted link — in Slack, in a DM, into an agent. The unfurl card is the first
  // thing anyone sees of it, so it is rendered per piece of work rather than left blank.
  image: `${url.value}/og.png`,
  noindex: true,
  type: "article",
});
</script>

<template>
  <div v-if="work">
    <main
      class="guide-page"
      :class="embed ? 'max-w-[46rem] pt-6' : 'max-w-[64rem] md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10'"
    >
      <!-- Sticky with no script: the rail scrolls with the document until it reaches the top and
           then stays. Below `md` the grid collapses and the lists run horizontally instead, so the
           title stays near the top of the screen. -->
      <aside
        v-if="!embed"
        class="border-b border-line pt-6 pb-4 md:sticky md:top-8 md:self-start md:border-b-0 md:py-8"
      >
        <AppBrand />

        <!-- This page runs no script and cannot tell who is signed in, so the way back is always
             drawn: the hub signs a visitor in if needed, and says so if the work is not theirs. -->
        <a
          :href="inHub"
          class="mt-3 block font-ui text-sm text-muted no-underline hover:text-accent"
        >Open in your hub →</a>

        <nav v-if="outline.length" class="mt-4 md:mt-6">
          <p :class="rail">Contents</p>
          <ul class="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 md:block">
            <li v-for="h in outline" :key="h.id" :class="h.level === 3 ? 'md:pl-3' : ''">
              <a
                :href="`#${h.id}`"
                class="block py-0.5 font-ui text-sm text-muted no-underline hover:text-accent"
              >{{ h.text }}</a>
            </li>
          </ul>
        </nav>

        <nav class="mt-4 md:mt-6">
          <p :class="rail">For agents</p>
          <a :href="`${url}.md`" class="mt-2 block py-0.5 font-ui text-sm text-muted no-underline hover:text-fg">
            Markdown
          </a>
        </nav>
      </aside>

      <div class="min-w-0" :class="embed ? '' : 'md:py-8'">
        <header class="mb-6 border-b-0 pb-0">
          <h1 v-if="!embed" class="mt-0">{{ str(meta?.title) || "Untitled" }}</h1>

          <p v-if="parent && !embed" class="mt-2 mb-0 font-ui text-sm text-muted">
            Came from <a :href="parent.url">{{ parent.title || "earlier work" }}</a>.
          </p>

          <!-- Framed in the hub, Progress already says who opened it and when. -->
          <p v-if="work.pulls && !embed" class="mt-2 mb-0 font-ui text-sm text-muted">
            Opened {{ work.pulls === 1 ? "once" : `${work.pulls} times` }}
          </p>

          <!-- Labelled, because the difference between the project it came out of and the stack it
               assumes is not something a reader should have to infer from two grey strings. -->
          <dl
            v-if="facts.length"
            class="mb-0 grid gap-x-6 gap-y-3 border-b border-line py-3 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]"
            :class="embed ? 'mt-0 pt-0' : 'mt-4 border-t'"
          >
            <div v-for="f in facts" :key="f.label" :class="f.wide ? '[grid-column:1/-1]' : ''">
              <dt :class="rail">{{ f.label }}</dt>
              <dd class="m-0 mt-0.5 font-ui text-sm text-fg">{{ f.value }}</dd>
            </div>
          </dl>

          <div v-if="list(meta?.tags).length" class="mt-3 flex flex-wrap gap-2">
            <span v-for="t in list(meta?.tags)" :key="t" class="tag">#{{ t }}</span>
          </div>
        </header>

        <!-- eslint-disable-next-line vue/no-v-html -- see server/utils/guide-html.ts: the CSP is what
             makes this safe, and it is checked by scripts/probe.sh against a deployed response. -->
        <article class="prose" v-html="work.html" />

        <section v-if="children.length && !embed" class="mt-8 font-ui text-sm" aria-labelledby="from-this">
          <p id="from-this" :class="rail">Work from this · {{ children.length }}</p>
          <ul class="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            <li v-for="c in children" :key="c.id">
              <a :href="c.url">{{ c.title || "Untitled" }}</a>
              <span class="text-muted"> · {{ c.created.slice(0, 10) }}</span>
            </li>
          </ul>
        </section>

        <!-- The answer, on the page the link opened. Every control here is a plain link or a
             <details>, because this page runs no script: the buttons lead into the hub, which signs
             the visitor in if they need it and asks the question there. -->
        <div v-if="!embed" class="pull">
          <!-- A draft reaches nobody until somebody marks it Ready, and that is done in the hub: this
               page runs no script, so it can only say where. -->
          <p v-if="str(meta?.status) === 'draft'" class="mt-0 mb-3 font-ui text-sm text-muted">
            <b class="text-fg">This is a draft.</b> Nobody can take it until it is marked Ready.
            <a :href="inHub">Mark it Ready in the hub</a>
          </p>
          <b class="block font-ui text-base text-fg">Is this yours to do?</b>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">
            Take it in the hub: {{ author }} sees you have it, and nobody else can take it while you
            do. You'll be asked to sign in if you aren't.
          </p>
          <p class="mt-3 mb-0 flex flex-wrap items-center gap-2">
            <a class="btn primary" :href="inHub">I'll do this</a>
          </p>

          <details class="mt-4">
            <summary class="cursor-pointer font-ui text-sm text-muted">For agents and terminals</summary>
            <p class="mt-2 mb-0 font-ui text-sm text-muted">Take it in a session with:</p>
            <code class="line">passalong take {{ id }}</code>
            <p class="mt-2 mb-0 font-ui text-sm text-muted">
              Or give an agent the <a :href="`${url}.md`">markdown version</a>.
            </p>
          </details>
        </div>
      </div>
    </main>
  </div>
</template>
