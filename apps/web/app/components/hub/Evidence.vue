<!--
  What a hand-in ran, as it was sent (docs/V2.md §11).

  One renderer for both places evidence is read: the review pane and the handed-in row. Output
  stays monospace and literal — a reviewer is reading a terminal, and reflowing it would lose the
  alignment that makes it readable. Links are followable where they sit, and screenshots are drawn
  rather than printed as a URL nobody can see.

  Only `/v1/shots/<id>` is drawn as a picture. See evidenceParts(): an <img> at an address the
  writer of the evidence chose would make a reviewer's browser fetch from a stranger.
-->
<script setup lang="ts">
const props = defineProps<{ text: string }>();
const parts = computed(() => evidenceParts(props.text));
</script>

<template>
  <div
    v-if="parts.length"
    class="mt-2 max-h-72 overflow-auto rounded-1 bg-surface p-3"
    tabindex="0"
    role="group"
    aria-label="What it ran"
  >
    <template v-for="(p, i) in parts" :key="i">
      <pre
        v-if="p.kind === 'run'"
        class="m-0 font-code text-xs leading-relaxed whitespace-pre-wrap break-words text-fg"
      ><template v-for="(part, k) in p.parts" :key="k"><a
          v-if="part.url"
          :href="part.url"
          target="_blank"
          rel="noopener nofollow"
        >{{ part.text }}</a><template v-else>{{ part.text }}</template></template></pre>
      <figure v-else class="my-3 first:mt-0 last:mb-0">
        <a :href="p.url" target="_blank" rel="noopener">
          <img
            :src="p.url"
            :alt="p.alt || 'a screenshot from the hand-in'"
            loading="lazy"
            class="block max-w-full rounded-1 outline outline-image-edge"
          />
        </a>
        <figcaption v-if="p.alt" class="mt-1 font-ui text-xs text-muted">{{ p.alt }}</figcaption>
      </figure>
    </template>
  </div>
</template>
