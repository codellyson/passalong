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

  The follow-up dock follows the same rule. Its follow-ups open as columns beside the guide, the
  way a TweetDeck column opens beside another — but each "Open beside" and "×" is a link to this
  page with a different `?with=`, and the server draws the columns. A fragment on the link scrolls
  the new column into view, which is the one part of opening a panel a page without script can do.
-->
<script setup lang="ts">
const route = useRoute();
const id = computed(() => String(route.params.id));
const key = computed(() => String(route.params.key));
const view = computed(() => (route.query.view === "verify" ? "verify" : "guide"));
const withParam = computed(() => (typeof route.query.with === "string" ? route.query.with : ""));

/**
 * The document alone, for the hub's page about this guide, which frames it. The hub draws the
 * title, where the guide has got to and every way to answer it beside the frame, so here the rail,
 * the heading and the answer box would each be said twice. Still this page, with this page's
 * headers and no script: the frame is how the hub shows a guide without rendering it itself.
 *
 * Nothing in the frame may navigate the frame. A link that did would load a page without this
 * flag, and the full page — rail, title, dock — would come back squeezed into the hub's column.
 * So every link opens a tab of its own (the frame's sandbox lets exactly that out), and the
 * follow-up box and the parent line, which exist to lead somewhere, give way to the hub's
 * "Tied to", which leads to the hub's page for each.
 */
const embed = computed(() => route.query.embed === "1");

if (embed.value) useHead({ base: { target: "_blank" } });

const { data: guide } = await useFetch(
  () => `/api/guide/${encodeURIComponent(id.value)}/${encodeURIComponent(key.value)}`,
  // Framed, there is no dock: the hub lists the follow-ups beside the frame, and a row of columns
  // inside a frame is columns inside a column.
  { query: { view, with: computed(() => (embed.value ? "" : withParam.value)) } },
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
    { label: "from", value: str(meta.value?.author) },
    { label: "sent", value: created.value },
    { label: "project", value: str(meta.value?.source_context) },
    // A task's own two facts: the repo an agent has to be in to take it, and what it waits for.
    { label: "for", value: str(meta.value?.target_context) },
    { label: "waits on", value: list(meta.value?.blocked_by).join(" · ") },
    { label: "assumes", value: list(meta.value?.stack_assumptions).join(" · ") },
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
  { label: "Whole guide", href: `${url.value}${dockSuffix.value}`, on: view.value !== "verify" },
  {
    label: "Checks first",
    href: dockHref(base.value, openOrder.value, { verify: true }),
    on: view.value === "verify",
  },
  { label: "Markdown, for agents", href: `${url.value}.md`, on: false },
]);

/**
 * Where the answer buttons lead. This page runs no script, so it cannot hold a form: each button
 * is a link into the hub, which signs the visitor in if needed and asks the question there.
 */
const answer = (what: string) => `/hub/answer/${encodeURIComponent(id.value)}?do=${what}`;
const author = computed(() => str(meta.value?.author) || "the sender");
/** Said to an agent, not typed into a form: this page runs no script, so it is shown to select. */
const followUp = computed(() => followUpAsk(id.value));
/** More context added to this guide, oldest first, and the guide this one adds context to. */
const followUps = computed(() => guide.value?.followUps ?? []);
/** Standing verdicts saying it does not hold, with what was run. See the server route. */
const failing = computed(() => guide.value?.failing ?? []);
/** What people had to change to make it work where they ran it. See the server route. */
const adapted = computed(() => guide.value?.adapted ?? []);
const parent = computed(() => guide.value?.parent ?? null);

// ---- the dock ----------------------------------------------------------------------------------
const base = computed(() => `/g/${id.value}/${key.value}`);
const docked = computed(() => guide.value?.docked ?? []);
const openOrder = computed(() => guide.value?.openOrder ?? []);
const dockOpen = computed(() => docked.value.length > 0);
const verify = computed(() => view.value === "verify");
/** The `?with=` part of this address, carried onto the view links so switching view keeps the dock. */
const dockSuffix = computed(() => dockHref("", openOrder.value).replace(/^$/, ""));

const isOpen = (fid: string) => openOrder.value.includes(fid);
const openHref = (fid: string) =>
  dockHref(base.value, withOpened(openOrder.value, fid), { verify: verify.value, jump: fid });
const closeHref = (fid: string) =>
  dockHref(base.value, withClosed(openOrder.value, fid), { verify: verify.value });
const openAllIds = computed(() => followUps.value.slice(0, DOCK_MAX).map((f) => f.id));
const openAllHref = computed(() =>
  dockHref(base.value, openAllIds.value, { verify: verify.value, jump: openAllIds.value[0] }),
);
const closeAllHref = computed(() => dockHref(base.value, [], { verify: verify.value }));
const atCap = computed(() => openOrder.value.length >= DOCK_MAX);
/** Follow-up n of M, by the order they were added. */
const position = (fid: string) => followUps.value.findIndex((f) => f.id === fid) + 1;

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
  type: "article",
});
</script>

<template>
  <div v-if="guide" :class="dockOpen ? 'dock' : ''">
    <main
      class="guide-page"
      :class="
        dockOpen
          ? 'dock-guide'
          : embed
            ? 'max-w-[46rem] pt-6'
            : 'max-w-[64rem] md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10'
      "
    >
      <!-- Sticky with no script: the rail scrolls with the document until it reaches the top and
           then stays.

           On a narrow screen the grid collapses and this whole column renders *before* the guide —
           so as a stacked list it put a dozen lines of navigation above the title of a document
           nobody has read yet. Below `md` the two lists run horizontally instead: the same links,
           two or three lines, and the title stays near the top of the screen.

           With follow-ups docked the guide is one column of several and there is no room for a
           rail beside it, so the rail becomes a top bar: the brand, and how to leave the dock. -->
      <div
        v-if="dockOpen"
        class="dock-bar flex flex-wrap items-center justify-between gap-3 border-b border-line py-3"
      >
        <AppBrand />
        <span class="font-ui text-sm text-muted">
          {{ docked.length }} of {{ followUps.length }} follow-ups open ·
          <a :href="closeAllHref">Close all</a>
        </span>
      </div>

      <aside
        v-else-if="!embed"
        class="border-b border-line pt-6 pb-4 md:sticky md:top-8 md:self-start md:border-b-0 md:py-8"
      >
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
          <p :class="rail">Read it as</p>
          <ul class="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 md:block">
            <li v-for="v in views" :key="v.label">
              <!-- The marker for the view you are on moves from the left edge to under the label:
                   a left border reads as a rail when the items are stacked and as a stray tick
                   when they sit in a row. -->
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

      <div class="min-w-0" :class="dockOpen ? 'pt-6' : 'md:py-8'">
        <header class="mb-6 border-b-0 pb-0">
          <h1 v-if="!embed" class="mt-0">{{ str(meta?.title) || "Untitled guide" }}</h1>

          <p v-if="parent && !embed" class="mt-2 mb-0 font-ui text-sm text-muted">
            More context for <a :href="parent.url">{{ parent.title || "an earlier guide" }}</a>.
          </p>

          <p v-if="guide.pulls" class="mt-2 mb-0 font-ui text-sm text-muted">
            Opened {{ guide.pulls === 1 ? "once" : `${guide.pulls} times` }}
          </p>

          <!-- Labelled, because the difference between the repo it came out of and the stack it
               assumes is not something a reader should have to infer from two grey strings. -->
          <dl
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

        <!-- Follow-ups are more context for this guide, so a reader has to see them before acting
             on it — above the document, not after the last section. Each one opens as a column
             beside the guide, or on its own page. -->
        <section
          v-if="followUps.length && !embed"
          class="mb-6 rounded-2 border border-accent bg-accent-soft px-4 py-3"
          aria-labelledby="follow-ups"
        >
          <p id="follow-ups" :class="rail" class="text-accent">
            More context · {{ followUps.length }} {{ followUps.length === 1 ? "follow-up" : "follow-ups" }}
          </p>
          <p class="mt-1 mb-2 font-ui text-sm text-muted">
            Added to this guide after it was written. Read these too; where one disagrees with the
            guide, the follow-up is newer.
          </p>
          <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
            <li
              v-for="f in followUps"
              :key="f.id"
              class="flex flex-wrap items-baseline justify-between gap-x-3 font-ui text-sm"
            >
              <span class="min-w-0">
                <a :href="f.url" class="font-medium" :class="isOpen(f.id) ? 'text-fg' : ''">
                  {{ f.title || "Untitled follow-up" }}
                </a>
                <span class="text-muted"> · {{ f.created.slice(0, 10) }}</span>
              </span>
              <a v-if="isOpen(f.id)" :href="`#f-${f.id}`" class="shrink-0 text-muted">Open →</a>
              <a v-else :href="openHref(f.id)" class="shrink-0">
                {{ atCap ? "Open instead" : "Open beside" }}
              </a>
            </li>
          </ul>
          <p class="mt-2 mb-0 flex flex-wrap gap-x-4 font-ui text-xs">
            <a v-if="followUps.length > 1" :href="openAllHref">
              Open {{ Math.min(DOCK_MAX, followUps.length) }} beside
            </a>
            <a v-if="dockOpen" :href="closeAllHref">Close all</a>
          </p>
          <p
            v-if="atCap && followUps.length > DOCK_MAX"
            class="mt-2 mb-0 rounded-1 bg-warn-soft px-2 py-1 font-ui text-xs text-warn"
          >
            {{ DOCK_MAX }} columns is the most that fit. Opening another replaces the one you opened
            first.
          </p>
        </section>

        <!-- Verify re-orders someone else's document, and a reader who does not know that is
             reading a guide whose author appears to have started in the middle. It says so, in the
             only place it can be read before the reordering takes effect. -->
        <div
          v-if="cut"
          class="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 rounded-2 border border-accent bg-accent-soft px-4 py-3"
        >
          <div class="min-w-0 grow basis-72">
            <p :class="rail" class="text-accent">Checks first</p>
            <p class="mt-1 mb-0 font-ui text-sm text-muted">
              <template v-if="cut.lead.length">
                Showing {{ sentence(cut.lead) }} first. The rest of the guide follows below.
              </template>
              <template v-else>
                This guide has no checks section, so it's shown in the order it was written.
              </template>
            </p>
          </div>
          <a :href="dockHref(base, openOrder)" class="font-ui text-sm whitespace-nowrap">Read it in order</a>
        </div>

        <!-- Above the Steps, because it is what somebody about to follow them needs first.
             The page showed no verdict at all before this, so a guide already found broken read as
             authoritative to the next reader, and the only way to warn them was to publish a
             second guide titled "Correction: …". Nobody is named: the key in the URL is the whole
             authorisation, so this page is as public as the link. -->
        <aside v-if="failing.length" class="notworking">
          <p class="m-0 font-ui text-sm font-semibold">
            {{ failing.length === 1 ? "Somebody tried this and it did not hold" : `${failing.length} people tried this and it did not hold` }}
          </p>
          <div v-for="(f, i) in failing" :key="i" class="mt-3">
            <p class="m-0 font-ui text-sm">
              <time :datetime="f.at">{{ f.at.slice(0, 10) }}</time
              ><template v-if="f.note"> — {{ f.note }}</template>
            </p>
            <ul v-if="f.checks.length" class="m-0 mt-2 list-none p-0">
              <li v-for="(c, j) in f.checks" :key="j" class="mt-2">
                <p class="m-0 font-ui text-sm font-medium">{{ c.check }}</p>
                <HubEvidence :text="c.ran" />
              </li>
            </ul>
            <HubEvidence v-else-if="f.detail" :text="f.detail" />
          </div>
        </aside>

        <!-- After the warning and before the guide, for the same reason the warning is there: it is
             what somebody about to follow the Steps needs before they start, not after. This is a
             hand-in that DID hold and had something to say about what it took — which had no home
             either, so it arrived as a follow-up guide with an id and an inbox row, when it is a
             paragraph about this guide. Nobody is named, as above. -->
        <aside v-if="adapted.length" class="adapted">
          <p class="m-0 font-ui text-sm font-semibold">
            {{ adapted.length === 1 ? "One person ran this" : `${adapted.length} people ran this` }}
          </p>
          <div v-for="(a, i) in adapted" :key="i" class="mt-3">
            <p class="m-0 font-ui text-sm text-muted">
              <time :datetime="a.at">{{ a.at.slice(0, 10) }}</time> — it worked here
            </p>

            <!-- Commands the runner executed before the hand-in was allowed to land: a non-zero
                 exit refused it, so this output is the one thing on the page the agent did not
                 write. It goes first for that reason. -->
            <ul v-if="a.ran.length" class="m-0 mt-2 list-none p-0">
              <li v-for="(c, j) in a.ran" :key="`ran-${j}`" class="mt-2">
                <p class="m-0 flex items-baseline gap-2 font-ui text-sm font-medium">
                  <span class="adapted-badge" :title="`${c.cmd} → exited ${c.exit === null ? 'nothing' : c.exit}`">ran</span>
                  {{ c.check }}
                </p>
                <HubEvidence :text="c.ran" />
              </li>
            </ul>

            <!-- A check with no command behind it. Still answered line against line, still the
                 agent's own account of what happened — so it is named as that, not as output. -->
            <ul v-if="a.said.length" class="m-0 mt-2 list-none p-0">
              <li v-for="(c, j) in a.said" :key="`said-${j}`" class="mt-2">
                <p class="m-0 font-ui text-sm font-medium">{{ c.check }}</p>
                <HubEvidence :text="c.ran" prose />
              </li>
            </ul>

            <!-- And prose last, labelled, because nothing checked it. It used to be the whole
                 block and sat at the top of the page, above the guide it is about. -->
            <template v-if="a.writeup">
              <p class="mt-3 mb-0 font-ui text-xs tracking-wide text-muted uppercase">
                What they said they changed
              </p>
              <HubEvidence :text="a.writeup" prose />
            </template>
            <p v-else-if="!a.ran.length && !a.said.length" class="adapted-said">
              Nothing was recorded about what it took.
            </p>
          </div>
        </aside>

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

        <!-- The answer, on the page the link opened. Every control here is a plain link or a
             <details>, because this page runs no script: the buttons lead into the hub, which signs
             the visitor in if they need it and asks the question there. -->
        <div v-if="!embed" class="pull">
          <p v-if="isBug" class="mt-0 mb-3 font-ui text-sm text-muted">
            <b class="text-fg">This is a bug report.</b> The steps under Reproduce show the problem;
            they aren't a fix. Fix what Problem describes, then check Verification.
          </p>

          <!-- A task is not handed to a person, so it is not taken or passed here: an agent takes it
               from its author's queue. Take and Pass would send an answer nobody is waiting for. -->
          <template v-if="isTask">
            <b class="block font-ui text-base text-fg">This is a task: work nobody has done yet.</b>
            <p class="mt-1 mb-0 font-ui text-sm text-muted">
              An agent takes it from the queue, works out how to reach Goal, and comes back with a
              write-up that {{ author }} checks against Acceptance. In
              {{ str(meta?.target_context) || "a session outside any repo" }}, run
              <code>passalong work</code> or tell an agent to take the next task.
            </p>
          </template>
          <template v-else>
            <b class="block font-ui text-base text-fg">Was this sent to you?</b>
            <p class="mt-1 mb-0 font-ui text-sm text-muted">
              Tell {{ author }} whether you're taking it. You'll be asked to sign in if you aren't.
            </p>
            <p class="mt-3 mb-0 flex flex-wrap items-center gap-2">
              <a class="btn primary" :href="answer('take')">Take it</a>
              <a class="btn" :href="answer('pass')">Pass</a>
              <a class="ml-1 font-ui text-sm" :href="answer('report')">Already on it? Say how it went</a>
            </p>
          </template>
          <p class="mt-3 mb-0 font-ui text-sm text-muted">
            Something missing from this guide? Ask your agent to add a follow-up with the extra
            context, and everyone who opens it gets that too:
            <code class="font-code text-xs text-fg select-all">{{ followUp }}</code>
          </p>

          <details class="mt-4">
            <summary class="cursor-pointer font-ui text-sm text-muted">For agents and terminals</summary>
            <p class="mt-2 mb-0 font-ui text-sm text-muted">Fetch it into a session with:</p>
            <code class="line">passalong pull {{ url }}</code>
            <p class="mt-2 mb-0 font-ui text-sm text-muted">
              Or give an agent the <a :href="`${url}.md`">markdown version</a>.
            </p>
          </details>
        </div>
      </div>
    </main>

    <!-- The docked follow-ups, one column each, in the order they were added. Each scrolls on its
         own, so reading one does not move the guide. -->
    <section
      v-for="d in docked"
      :id="`f-${d.id}`"
      :key="d.id"
      class="dock-col"
      :aria-label="`Follow-up: ${d.title || 'untitled'}`"
    >
      <div class="dock-col-head">
        <div class="min-w-0">
          <p :class="rail" class="m-0 text-accent">
            Follow-up {{ position(d.id) }} of {{ followUps.length }}
          </p>
          <p class="m-0 mt-0.5 font-ui text-sm leading-snug font-semibold text-fg">
            {{ d.title || "Untitled follow-up" }}
          </p>
          <p class="m-0 font-ui text-xs text-muted">
            <template v-if="d.author">from {{ d.author }} · </template>{{ d.created.slice(0, 10) }}
          </p>
        </div>
        <div class="flex shrink-0 gap-1">
          <a :href="d.url" class="dock-icon" title="Open on its own page" aria-label="Open on its own page">↗</a>
          <a :href="closeHref(d.id)" class="dock-icon" title="Close this column" aria-label="Close this column">×</a>
        </div>
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -- rendered by the same renderer as the guide, under
           the same no-script CSP. -->
      <article class="prose dock-col-body" v-html="d.html" />
    </section>
  </div>
</template>
