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

/**
 * The facts worth a label. Anything empty drops out rather than printing a blank column.
 *
 * `out of` and `assumes` are sentences where the rest are a word or two, so they are marked wide
 * and take a row to themselves. Sharing the strip's 9rem columns equally turned either of them
 * into a twenty-line ribbon that set the height of the whole block and pushed the guide below the
 * fold. They come last so the reading order is the placement order.
 */
const facts = computed(() =>
  [
    { label: "id", value: guide.value?.id, mono: true },
    { label: "from", value: str(meta.value?.author), mono: false },
    { label: "shared", value: created.value, mono: false },
    { label: "out of", value: str(meta.value?.source_context), mono: true },
    // A task's own two facts: the repo an agent has to be in to take it, and what it waits for.
    { label: "for", value: str(meta.value?.target_context), mono: true },
    { label: "waits on", value: list(meta.value?.blocked_by).join(" · "), mono: true },
    { label: "assumes", value: list(meta.value?.stack_assumptions).join(" · "), mono: false },
  ]
    .filter((f) => f.value)
    .map((f) => ({ ...f, wide: (f.value ?? "").length > 40 })),
);

/** "Problem, Verification and Gotchas" — a list a sentence can contain. */
const sentence = (names: string[]) =>
  names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/**
 * A bug report is read by someone who is going to fix it, not by someone repeating finished work,
 * so the page's closing move is different. `passalong pull` is still how an agent fetches one and
 * still belongs here — it just stops being the headline on a page a tester opens to check what
 * they filed.
 */
const isBug = computed(() => str(meta.value?.kind) === "bug");

/**
 * A task is work nobody has done yet, and the page says so before anyone mistakes Goal and
 * Acceptance for a record of something finished. It does not say where the task is in its queue:
 * that is its author's board, and a claim names hosts and worktree paths a share link should not
 * hand to whoever holds it.
 */
const isTask = computed(() => str(meta.value?.kind) === "task");

const cut = computed(() => guide.value?.cut);
const rest = computed(() => guide.value?.rest);

/** The rail in two groups: what this view put first, and what it moved below. */
const contents = computed(() => outline.value.filter((h) => !h.then));
const then = computed(() => outline.value.filter((h) => h.then));

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
         then stays.

         On a narrow screen the grid collapses and this whole column renders *before* the guide —
         so as a stacked list it put a dozen lines of navigation above the title of a document
         nobody has read yet. Below `md` the two lists run horizontally instead: the same links,
         two or three lines, and the title stays near the top of the screen. There is no script to
         collapse anything behind a toggle, and a table of contents is not worth what adding one
         would cost this page. -->
    <aside class="border-b border-line pt-6 pb-4 md:sticky md:top-8 md:self-start md:border-b-0 md:py-8">
      <AppBrand />

      <nav v-if="contents.length" class="mt-4 md:mt-6">
        <p :class="rail">Contents</p>
        <ul class="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 md:block">
          <li v-for="h in contents" :key="h.id" :class="h.level === 3 ? 'md:pl-3' : ''">
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

      <!-- The rest of the guide is on the same page, so it is addressed by the same rail. The
           heading is what says these are not the sections this view leads with. -->
      <nav v-if="then.length" class="mt-4 md:mt-6">
        <p :class="rail">Then</p>
        <ul class="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 md:block">
          <li v-for="h in then" :key="h.id" :class="h.level === 3 ? 'md:pl-3' : ''">
            <a
              :href="`#${h.id}`"
              class="block py-0.5 font-ui text-sm text-muted no-underline hover:text-accent"
            >{{ h.text }}</a>
          </li>
        </ul>
      </nav>

      <nav class="mt-4 md:mt-6">
        <p :class="rail">Views</p>
        <ul class="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 md:block">
          <li v-for="v in views" :key="v.label">
            <!-- The marker for the view you are on moves from the left edge to under the label:
                 a left border reads as a rail when the items are stacked and as a stray tick when
                 they sit in a row. -->
            <a
              :href="v.href"
              :aria-current="v.on ? 'page' : undefined"
              class="block border-b-2 py-0.5 font-ui text-sm no-underline md:border-b-0 md:border-l-2 md:pl-2"
              :class="v.on ? 'border-b-accent font-semibold text-fg md:border-l-accent' : 'border-b-transparent text-muted hover:text-fg md:border-l-transparent'"
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
          <div v-for="f in facts" :key="f.label" :class="f.wide ? '[grid-column:1/-1]' : ''">
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

      <!-- Verify re-orders someone else's document, and a reader who does not know that is
           reading a guide whose author appears to have started in the middle. It says so, in the
           only place it can be read before the reordering takes effect. -->
      <div
        v-if="cut"
        class="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 rounded-2 border border-accent bg-accent-soft px-4 py-3"
      >
        <div class="min-w-0 grow basis-72">
          <p :class="rail" class="text-accent">
            {{ cut.lead.length ? `Verify · ${cut.lead.length} of ${cut.total} sections first` : "Verify" }}
          </p>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">
            <template v-if="cut.lead.length">
              {{ sentence(cut.lead) }} lead. Everything else follows below, never dropped.
            </template>
            <template v-else>
              Nothing in this guide is named like a section Verify leads with, so it reads in the
              author's order.
            </template>
          </p>
        </div>
        <a :href="url" class="font-ui text-sm whitespace-nowrap">read in the author's order</a>
      </div>

      <!-- eslint-disable-next-line vue/no-v-html -- see server/utils/guide-html.ts: the CSP is what
           makes this safe, and it is checked by scripts/probe.sh against a deployed response. -->
      <article class="prose">
        <div v-html="guide.html" />

        <p v-if="rest" class="handover">
          Everything below is the rest of the guide, in the author's order:
          {{ rest.names.join(", ").toLowerCase() }}.
        </p>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="rest" v-html="rest.html" />
      </article>

      <div class="pull">
        <template v-if="isBug">
          <b class="block font-ui text-sm text-fg">This is a bug report</b>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">
            The steps under Reproduce show the problem — they are not a fix to apply. Fix what
            Problem describes, then check Verification and say whether it worked.
          </p>
          <p class="mt-3 mb-0 font-ui text-sm text-muted">
            Send it to someone by sharing this page's address.
          </p>
          <code class="line">{{ url }}</code>
          <p class="mt-2 mb-0 font-ui text-sm text-muted">
            An agent takes it with <code>passalong pull {{ id }}</code>; append <code>.md</code> to
            this URL for the markdown.
          </p>
        </template>
        <template v-else-if="isTask">
          <b class="block font-ui text-sm text-fg">This is a task — work nobody has done yet</b>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">
            An agent takes it from the queue, works out how to reach Goal, and comes back with a
            write-up that a person checks against Acceptance.
          </p>
          <p class="mt-3 mb-0 font-ui text-sm text-muted">
            In {{ str(meta?.target_context) || "a session outside any repo" }}, tell the agent to take
            the next task, or read this one with
          </p>
          <code class="line">passalong pull {{ url }}</code>
        </template>
        <template v-else>
          <b class="block font-ui text-sm text-fg">Pull this into your context</b>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">
            Select the line — a guide page runs no script, so there is no copy button.
          </p>
          <code class="line">passalong pull {{ url }}</code>
          <p class="mt-2 mb-0 font-ui text-sm text-muted">
            Or append <code>.md</code> to this URL for the markdown source.
          </p>
        </template>
      </div>

      <footer>
        <!-- The transfer-guide line assumes the reader wrote this in an editor somewhere and can
             re-share it. Whoever filed a bug through the hub did not, and telling them to go and
             edit markdown is how a page stops being for them. -->
        <template v-if="isBug">
          Read-only. Something to add? File it as another issue, or say whether the fix worked from
          your board.
        </template>
        <template v-else>
          Read-only. Edit the markdown in your own tools and <code>passalong share</code> again.
        </template>
      </footer>
    </div>
  </main>
</template>
