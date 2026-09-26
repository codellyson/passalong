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
const props = defineProps<{
  text: string;
  /**
   * Draw the words as prose rather than terminal output.
   *
   * A check with no command behind it is the agent's sentence about what it saw, and the share
   * page says so by setting it in the reading face instead of the mono one. It still comes through
   * here, because a screenshot in it has to become a picture wherever it was written — that was
   * the bug: the guide page printed `![Sales Order PDF](https://…/v1/shots/d2eg7b2xaqx7)` as text.
   */
  prose?: boolean;
}>();
const parts = computed(() => evidenceParts(props.text));

/**
 * How much of a long run shows before it is folded, in lines.
 *
 * It was a fixed height with its own scrollbar, on a page that already scrolls. A reader had to
 * find that second scrollbar to reach the end of the evidence — and the end is usually the part
 * that decides it, the last command and what it printed. Folding says there is more and opens it
 * in place; a scroll window hides that there is more at all.
 */
const FOLD = 16;

const lines = computed(() =>
  parts.value.reduce(
    (n, p) =>
      n +
      (p.kind === "run"
        ? p.parts
            .map((x) => x.text)
            .join("")
            .split("\n").length
        : 0),
    0,
  ),
);
const shots = computed(() => parts.value.filter((p) => p.kind === "shot").length);
/** Folded only when there is enough to be worth folding: a short run is just shown. */
const long = computed(() => lines.value > FOLD + 4 || shots.value > 1);
const open = ref(false);

/**
 * A screenshot, opened over the page at full size. The review is the whole point of proof, and a
 * thumbnail the width of a sidebar cannot be checked — "Paid" on a captured order is four pixels
 * tall there. It used to open in a new tab, which took the reviewer off the page they were deciding
 * on. A plain click opens it here; a modified or middle click still gets the tab, from the link.
 */
const zoom = ref<HTMLDialogElement | null>(null);
const zoomed = ref<{ url: string; alt: string } | null>(null);
function enlarge(e: MouseEvent, url: string, alt: string) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  zoomed.value = { url, alt };
  zoom.value?.showModal();
}
</script>

<template>
  <div v-if="parts.length" class="mt-2" role="group" aria-label="What it ran">
    <!-- No inner scrollbar: the page scrolls, and a second scroller inside it hides the end of the
         evidence behind a bar nobody looks for. A long run is folded instead, which says there is
         more and opens it where it is. -->
    <div
      class="relative overflow-hidden"
      :class="[prose ? '' : 'rounded-1 bg-surface p-3', long && !open ? 'max-h-[24rem]' : '']"
    >
      <template v-for="(p, i) in parts" :key="i">
        <p
          v-if="p.kind === 'run' && prose"
          class="m-0 font-ui text-sm leading-relaxed whitespace-pre-wrap text-fg"
        ><template v-for="(part, k) in p.parts" :key="k"><a
            v-if="part.url"
            :href="part.url"
            target="_blank"
            rel="noopener nofollow"
          >{{ part.text }}</a><template v-else>{{ part.text }}</template></template></p>
        <pre
          v-else-if="p.kind === 'run'"
          class="m-0 font-code text-xs leading-relaxed whitespace-pre-wrap break-words text-fg"
        ><template v-for="(part, k) in p.parts" :key="k"><a
            v-if="part.url"
            :href="part.url"
            target="_blank"
            rel="noopener nofollow"
          >{{ part.text }}</a><template v-else>{{ part.text }}</template></template></pre>
        <!-- A screenshot is the part of the evidence a reviewer reads fastest and the part that was
             being cut in half, so it is shown whole and opens full size in a tab. -->
        <figure v-else class="my-3 first:mt-0 last:mb-0">
          <a
            :href="p.url"
            target="_blank"
            rel="noopener"
            class="block cursor-zoom-in"
            :aria-label="`Open ${p.alt || 'the screenshot'} full size`"
            @click="enlarge($event, p.url, p.alt)"
          >
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

      <!-- The fold is visible, not a hard cut: a flat edge reads as the end of the evidence. -->
      <div
        v-if="long && !open"
        class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent"
        :class="prose ? 'to-[var(--surface-raised)]' : 'to-[var(--surface)]'"
        aria-hidden="true"
      />
    </div>

    <button
      v-if="long"
      class="linkish mt-2 font-ui text-xs font-medium"
      type="button"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ open ? "Show less" : `Show all ${lines} lines${shots ? ` and ${shots} screenshots` : ""}` }}
    </button>

    <!-- The full-size view. A native <dialog>: Esc closes it, focus is held inside, and the page
         behind is inert. A click on the dimmed backdrop — outside the picture — closes it too. -->
    <dialog
      ref="zoom"
      class="m-auto max-h-[94vh] max-w-[94vw] rounded-3 border-0 bg-bg p-0 text-fg shadow-[0_24px_80px_rgb(0_0_0/0.45)] backdrop:bg-black/70"
      :aria-label="zoomed?.alt || 'Screenshot'"
      @click.self="zoom?.close()"
      @close="zoomed = null"
    >
      <figure v-if="zoomed" class="m-0 flex flex-col">
        <img :src="zoomed.url" :alt="zoomed.alt" class="block max-h-[82vh] max-w-full object-contain" />
        <figcaption class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 font-ui text-sm">
          <span class="text-muted">{{ zoomed.alt || "Screenshot" }}</span>
          <span class="flex gap-2">
            <a class="btn sm" :href="zoomed.url" target="_blank" rel="noopener">
              <AppIcon name="open" />Open in a tab
            </a>
            <button class="btn sm" type="button" @click="zoom?.close()">Close</button>
          </span>
        </figcaption>
      </figure>
    </dialog>
  </div>
</template>
