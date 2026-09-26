<!--
  PROTOTYPE — hub guide page, variant B: "Document". Delete with the prototype.

  The guide is the page. One reading column: where the handoff is on its journey as a strip under
  the title, the document flowing inline at full height (no box, no second scrollbar), and what
  came back after it — hand-ins, verdicts with their screenshots, follow-ups as cards.
-->
<script setup lang="ts">
import type { GuideContext } from "~/types/hub";
import { journey } from "./story";

const props = defineProps<{ ctx: GuideContext; src: string; standing: string }>();
const g = computed(() => props.ctx.guide);
const stops = computed(() => journey(props.ctx));
const badge = computed(() => kindBadge(g.value.kind));
const who = (by: { handle: string; name: string }) => personName(by.name, by.handle) || "someone";
const came = computed(
  () => props.ctx.claims.filter((k) => k.state === "review").length + props.ctx.verdicts.length,
);
</script>

<template>
  <article class="mx-auto flex max-w-[46rem] flex-col">
    <p class="m-0 flex flex-wrap items-center gap-2 font-ui text-sm text-muted">
      <span v-if="badge" class="rounded-1 border px-1.5 py-0.5 text-xs font-medium tracking-wide uppercase" :class="badge.class">{{ badge.label }}</span>
      <span>from <b class="font-medium text-fg">{{ g.mine ? "you" : fromName(g) }}</b></span>
      <span>· {{ rel(g.created) }}</span>
    </p>
    <h1 class="mt-3 mb-0 text-[clamp(2rem,1.4rem+2.6vw,3rem)] leading-[1.08]">{{ g.title || "Untitled guide" }}</h1>
    <p class="mt-3 mb-0 font-ui text-lg text-muted">{{ standing }}</p>

    <!-- The journey. Done is ink, now is the coral diamond, next is an outline. -->
    <ol class="m-0 mt-8 grid list-none grid-cols-5 p-0" aria-label="Where it is">
      <li v-for="(s, i) in stops" :key="s.label" class="relative flex flex-col items-center gap-2 text-center">
        <span v-if="i > 0" class="absolute top-[0.4375rem] right-1/2 h-px w-full" :class="s.state === 'next' ? 'bg-line-strong' : 'bg-fg'" />
        <span
          class="relative z-10 block size-3.5"
          :class="
            s.state === 'now'
              ? 'rotate-45 rounded-[2px] bg-coral shadow-[0_0_0_4px_var(--accent-soft)]'
              : s.state === 'done'
                ? 'rounded-pill bg-fg'
                : 'rounded-pill border border-line-strong bg-bg'
          "
        />
        <span class="font-ui text-xs" :class="s.state === 'now' ? 'font-semibold text-fg' : s.state === 'done' ? 'text-fg' : 'text-muted'">{{ s.label }}</span>
      </li>
    </ol>

    <div class="mt-8 flex flex-wrap gap-2"><slot name="actions" /></div>

    <!-- The facts, once, as a line rather than a table. -->
    <p class="mt-8 mb-0 flex flex-wrap items-center gap-2 border-t border-line pt-4 font-ui text-sm text-muted">
      <span v-if="g.source_context" class="font-code text-xs text-fg">{{ g.source_context }}</span>
      <span v-for="s in g.stack_assumptions" :key="s" class="tag">{{ s }}</span>
      <span v-for="t in g.tags" :key="t" class="tag">#{{ t }}</span>
    </p>

    <HubPrototypeFrame class="mt-6" :src="src" :title="g.title || 'The guide'" />

    <section v-if="came" class="mt-12 flex flex-col gap-4">
      <h2 class="m-0 text-h2">What came back</h2>
      <div v-for="k in ctx.claims.filter((x) => x.state === 'review')" :key="k.place" class="flex flex-col gap-3 rounded-3 bg-raised p-6">
        <p class="m-0 font-ui text-sm"><b class="font-medium">{{ who(k.by) }}</b> handed it in · {{ rel(k.updated) }}</p>
        <p v-if="k.note" class="m-0 font-ui text-sm text-muted">“{{ k.note }}”</p>
        <HubHandIn :evidence="k.evidence" :checks="k.checks" :writeup="k.writeup" :risk="k.risk" />
      </div>
      <div v-for="v in ctx.verdicts" :key="v.by.handle + v.at" class="flex flex-col gap-3 rounded-3 bg-raised p-6">
        <p class="m-0 font-ui text-sm">
          <b :class="v.ok ? 'text-ok' : 'text-danger'">{{ v.ok ? "Works" : "Didn't work" }}</b>
          — {{ who(v.by) }} · {{ rel(v.at) }}
        </p>
        <HubEvidence v-if="v.detail" :text="v.detail" prose />
        <p v-else-if="v.note" class="m-0 font-ui text-sm text-muted">“{{ v.note }}”</p>
      </div>
    </section>

    <section v-if="ctx.children.length || ctx.parent" class="mt-12 flex flex-col gap-4">
      <h2 class="m-0 text-h2">{{ ctx.children.length ? "What came next" : "Where it came from" }}</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <NuxtLink
          v-for="c in [...(ctx.parent ? [ctx.parent] : []), ...ctx.children]"
          :key="c.id"
          :to="`/hub/g/${c.id}`"
          class="flex flex-col gap-3 rounded-3 bg-raised p-6 no-underline transition-transform hover:-translate-y-0.5"
        >
          <span class="font-ui text-xs text-muted">{{ c.id === ctx.parent?.id ? "Follows" : "Follow-up" }} · {{ rel(c.created) }}</span>
          <span class="text-lg leading-snug text-fg">{{ c.title || "Untitled guide" }}</span>
          <span class="mt-auto font-ui text-sm text-muted">Open →</span>
        </NuxtLink>
      </div>
    </section>
  </article>
</template>
