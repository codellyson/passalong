<!--
  PROTOTYPE — hub guide page, variant D: "Map". Delete with the prototype.

  Where this guide sits among the others, drawn: what it follows on the left, this one in the
  middle, its follow-ups on the right, what blocks it above and what it blocks below. Under the
  map, one segmented control picks what you are looking at — the guide, what happened, or what
  came back — instead of stacking all three down the page.
-->
<script setup lang="ts">
import type { Guide, GuideContext } from "~/types/hub";
import { story, TONE } from "./story";

const props = defineProps<{ ctx: GuideContext; src: string; standing: string }>();
const g = computed(() => props.ctx.guide);
const beats = computed(() => story(props.ctx));
const back = computed(
  () => props.ctx.claims.filter((k) => k.state === "review").length + props.ctx.verdicts.length,
);
const tabs = computed(() => [
  { id: "guide", label: "Guide" },
  { id: "activity", label: `Activity · ${beats.value.length}` },
  { id: "back", label: `Came back · ${back.value}` },
]);
const tab = ref("guide");
const who = (by: { handle: string; name: string }) => personName(by.name, by.handle) || "someone";
const kindOf = (x: Guide) => kindBadge(x.kind)?.label ?? "";
</script>

<template>
  <article class="flex flex-col gap-8">
    <!-- The map. Nodes are pills; the one you are on is the big card with the coral edge. -->
    <section class="rounded-3 bg-raised px-6 py-8" aria-label="Where it sits">
      <div v-if="ctx.blocked_by.length" class="mb-4 flex flex-wrap justify-center gap-2">
        <NuxtLink v-for="b in ctx.blocked_by" :key="b.id" :to="`/hub/g/${b.id}`" class="rounded-pill bg-field px-3 py-1.5 font-ui text-xs text-fg no-underline shadow-edge">
          blocked by · {{ b.title }}
        </NuxtLink>
      </div>
      <div class="grid items-center gap-4 md:grid-cols-[1fr_auto_minmax(0,26rem)_auto_1fr]">
        <div class="flex flex-col items-end gap-2">
          <NuxtLink v-if="ctx.parent" :to="`/hub/g/${ctx.parent.id}`" class="max-w-full rounded-pill bg-field px-4 py-2 font-ui text-sm text-fg no-underline shadow-edge">
            <span class="text-muted">follows</span> {{ ctx.parent.title }}
          </NuxtLink>
          <span v-else class="font-ui text-xs text-muted">nothing before it</span>
        </div>
        <span class="hidden h-px w-10 bg-line-strong md:block" />
        <div class="flex flex-col gap-3 rounded-3 bg-bg p-6 ring-2 ring-coral">
          <p class="m-0 font-ui text-xs tracking-widest text-muted uppercase">{{ kindOf(g) }} · {{ rel(g.created) }}</p>
          <h1 class="m-0 text-h2 leading-snug">{{ g.title || "Untitled guide" }}</h1>
          <p class="m-0 font-ui text-sm text-muted">{{ standing }}</p>
          <div class="flex flex-wrap gap-2"><slot name="actions" /></div>
        </div>
        <span class="hidden h-px w-10 bg-line-strong md:block" />
        <div class="flex flex-col items-start gap-2">
          <NuxtLink v-for="c in ctx.children" :key="c.id" :to="`/hub/g/${c.id}`" class="max-w-full rounded-pill bg-field px-4 py-2 font-ui text-sm text-fg no-underline shadow-edge">
            <span class="text-muted">{{ kindOf(c) }}</span> {{ c.title }}
          </NuxtLink>
          <span v-if="!ctx.children.length" class="font-ui text-xs text-muted">no follow-ups yet</span>
        </div>
      </div>
      <div v-if="ctx.blocks.length" class="mt-4 flex flex-wrap justify-center gap-2">
        <NuxtLink v-for="b in ctx.blocks" :key="b.id" :to="`/hub/g/${b.id}`" class="rounded-pill bg-field px-3 py-1.5 font-ui text-xs text-fg no-underline shadow-edge">
          blocks · {{ b.title }}
        </NuxtLink>
      </div>
    </section>

    <!-- One control picks the view. The active segment is the near-white field with a small lift. -->
    <div class="flex justify-center">
      <div class="inline-flex gap-1 rounded-2 bg-raised p-1" role="tablist">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="tab === t.id"
          class="cursor-pointer rounded-1 border-0 px-4 py-2 font-ui text-sm"
          :class="tab === t.id ? 'bg-field text-fg shadow-[0_1px_3px_rgb(0_0_0/0.1)]' : 'bg-transparent text-muted hover:text-fg'"
          @click="tab = t.id"
        >{{ t.label }}</button>
      </div>
    </div>

    <section v-show="tab === 'guide'" class="mx-auto w-full max-w-[46rem]">
      <p class="m-0 mb-4 flex flex-wrap gap-2">
        <span v-if="g.source_context" class="tag">{{ g.source_context }}</span>
        <span v-for="s in g.stack_assumptions" :key="s" class="tag">{{ s }}</span>
        <span v-for="t in g.tags" :key="t" class="tag">#{{ t }}</span>
      </p>
      <HubPrototypeFrame :src="src" :title="g.title || 'The guide'" />
    </section>

    <ol v-if="tab === 'activity'" class="mx-auto m-0 flex w-full max-w-[40rem] list-none flex-col gap-3 p-0">
      <li v-for="(b, i) in beats" :key="i" class="flex items-start gap-3 rounded-2 bg-raised px-4 py-3 font-ui text-sm">
        <span class="mt-1.5 size-2 shrink-0 rounded-pill" :class="TONE[b.tone]" />
        <div class="flex min-w-0 flex-col gap-1">
          <p class="m-0"><b class="font-medium">{{ b.who }}</b> {{ b.what }} <span class="text-muted">· {{ rel(b.at) }}</span></p>
          <p v-if="b.said" class="m-0 text-muted">{{ b.said }}</p>
        </div>
      </li>
    </ol>

    <div v-if="tab === 'back'" class="mx-auto flex w-full max-w-[46rem] flex-col gap-4">
      <p v-if="!back" class="m-0 text-center font-ui text-sm text-muted">Nothing has come back yet.</p>
      <div v-for="k in ctx.claims.filter((x) => x.state === 'review')" :key="k.place" class="flex flex-col gap-3 rounded-3 bg-raised p-6">
        <p class="m-0 font-ui text-sm"><b class="font-medium">{{ who(k.by) }}</b> handed it in · {{ rel(k.updated) }}</p>
        <HubHandIn :evidence="k.evidence" :checks="k.checks" :writeup="k.writeup" :risk="k.risk" />
      </div>
      <div v-for="v in ctx.verdicts" :key="v.by.handle + v.at" class="flex flex-col gap-3 rounded-3 bg-raised p-6">
        <p class="m-0 font-ui text-sm">
          <b :class="v.ok ? 'text-ok' : 'text-danger'">{{ v.ok ? "Works" : "Didn't work" }}</b> — {{ who(v.by) }} · {{ rel(v.at) }}
        </p>
        <HubEvidence v-if="v.detail" :text="v.detail" prose />
      </div>
    </div>
  </article>
</template>
