<!--
  PROTOTYPE — hub guide page, variant C: "Story". Delete with the prototype.

  The handoff as what happened, in order. The timeline is the primary column — sent, opened,
  taken, what they said, what they handed in and showed — ending on where it is now. The guide
  sits beside it, flowing at full height, for when you need the words themselves.
-->
<script setup lang="ts">
import type { GuideContext } from "~/types/hub";
import { story, TONE } from "./story";

const props = defineProps<{ ctx: GuideContext; src: string; standing: string }>();
const g = computed(() => props.ctx.guide);
const beats = computed(() => story(props.ctx));
const badge = computed(() => kindBadge(g.value.kind));
</script>

<template>
  <article class="flex flex-col gap-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <p class="m-0 flex items-center gap-2 font-ui text-sm text-muted">
          <span v-if="badge" class="rounded-1 border px-1.5 py-0.5 text-xs font-medium tracking-wide uppercase" :class="badge.class">{{ badge.label }}</span>
          <span v-if="g.source_context" class="font-code text-xs">{{ g.source_context }}</span>
        </p>
        <h1 class="mt-2 mb-0">{{ g.title || "Untitled guide" }}</h1>
      </div>
      <div class="flex flex-wrap gap-2"><slot name="actions" /></div>
    </header>

    <div class="grid items-start gap-10 lg:grid-cols-[24rem_minmax(0,1fr)]">
      <!-- The timeline. A rule runs down the left; each beat is a dot on it in its tone. -->
      <ol class="relative m-0 flex list-none flex-col gap-6 p-0 lg:sticky lg:top-24">
        <span class="absolute top-2 bottom-2 left-[0.3125rem] w-px bg-line-strong" aria-hidden="true" />
        <li v-for="(b, i) in beats" :key="i" class="relative flex gap-4">
          <span class="relative z-10 mt-1.5 size-2.5 shrink-0 rounded-pill ring-4 ring-bg" :class="TONE[b.tone]" />
          <div class="flex min-w-0 flex-col gap-2 font-ui text-sm">
            <p class="m-0">
              <b class="font-medium">{{ b.who }}</b> {{ b.what }}
              <span class="text-muted">· {{ rel(b.at) }}</span>
            </p>
            <p v-if="b.said" class="m-0 rounded-2 bg-raised px-4 py-3 text-muted">{{ b.said }}</p>
            <div v-if="b.proof" class="rounded-2 bg-raised px-4 py-3"><HubEvidence :text="b.proof" prose /></div>
            <NuxtLink v-if="b.link" :to="`/hub/g/${b.link.id}`" class="self-start">{{ b.link.title }} →</NuxtLink>
          </div>
        </li>
        <!-- Now: where it stands, as the last beat, marked with the diamond. -->
        <li class="relative flex gap-4">
          <span class="relative z-10 mt-1.5 size-2.5 shrink-0 rotate-45 rounded-[2px] bg-coral ring-4 ring-bg" />
          <p class="m-0 font-ui text-sm font-medium">Now — {{ standing }}</p>
        </li>
      </ol>

      <section class="min-w-0 border-line lg:border-l lg:pl-10" aria-label="The guide">
        <p class="m-0 mb-4 flex flex-wrap gap-2">
          <span v-for="s in g.stack_assumptions" :key="s" class="tag">{{ s }}</span>
          <span v-for="t in g.tags" :key="t" class="tag">#{{ t }}</span>
        </p>
        <HubPrototypeFrame :src="src" :title="g.title || 'The guide'" />
      </section>
    </div>
  </article>
</template>
