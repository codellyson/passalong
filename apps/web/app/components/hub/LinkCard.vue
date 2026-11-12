<!--
  A link to a piece of work, inside text someone wrote, that shows what the work is before you
  follow it: where it stands, its title and summary, and who has it. Read from the same
  `/v1/work/:id/context` the work page reads (and caches), which records no pull, and which answers
  only for work this reader may see — a share link to work they cannot open shows no card.
  Shown on hover or keyboard focus after a moment, and kept while the pointer is on the card.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";

const props = defineProps<{ id: string; href: string; shared: boolean; text: string }>();
const { reads, ready } = useHub();
// One read per linked piece of work, cached with the work page's own: it is what lets the link say
// the work's title rather than its address, and the card open without waiting.
const { data: ctx } = useQuery({
  ...reads.context(props.id),
  staleTime: 30_000,
  retry: false,
  enabled: ready,
});

const anchor = ref<{ $el: HTMLElement } | null>(null);
const open = ref(false);
const at = ref({ top: 0, left: 0 });
const cardId = `work-card-${props.id}-${useId()}`;
let timer: ReturnType<typeof setTimeout> | undefined;

const CARD_W = 320;
function show() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const box = anchor.value?.$el?.getBoundingClientRect?.();
    if (!ctx.value || !box) return;
    at.value = {
      top: box.bottom + 6,
      left: Math.min(Math.max(8, box.left), window.innerWidth - CARD_W - 8),
    };
    open.value = true;
  }, 350);
}
function hide() {
  clearTimeout(timer);
  timer = setTimeout(() => (open.value = false), 150);
}
onBeforeUnmount(() => clearTimeout(timer));

const w = computed(() => ctx.value?.work);
const holder = computed(() => w.value?.held_by?.[0]);
/** A link to the hub's page opens it here; a share link stays what it was, since it may be the
 *  only way this reader can open the work. */
const to = computed(() => (props.shared ? props.href : `/hub/w/${props.id}`));
</script>

<template>
  <NuxtLink
    ref="anchor"
    :to="to"
    :external="shared"
    :target="shared ? '_blank' : undefined"
    :rel="shared ? 'noopener nofollow' : undefined"
    :aria-describedby="open ? cardId : undefined"
    @mouseenter="show"
    @mouseleave="hide"
    @focus="show"
    @blur="hide"
    @keydown.esc="open = false"
  >{{ w?.title || text }}</NuxtLink>
  <Teleport to="body">
    <div
      v-if="open && w"
      :id="cardId"
      role="tooltip"
      class="fixed z-50 flex flex-col gap-2 rounded-3 bg-raised px-4 py-3 font-ui text-sm text-fg not-italic shadow-[0_0_0_1px_var(--edge-ring),var(--shadow-2)]"
      :style="{ top: `${at.top}px`, left: `${at.left}px`, width: `${CARD_W}px` }"
      @mouseenter="show"
      @mouseleave="hide"
    >
      <p class="m-0 flex items-center gap-2 text-xs text-muted">
        <HubStage :work="w" />
        <HubWorkTag :tags="w.tags" />
        <span class="ml-auto shrink-0">{{ rel(w.created) }}</span>
      </p>
      <b class="font-medium leading-snug">{{ w.title || "Untitled" }}</b>
      <p v-if="w.summary && w.summary.trim() !== w.title" class="m-0 line-clamp-3 leading-snug text-muted">{{ w.summary }}</p>
      <p class="m-0 flex flex-wrap items-center gap-1 text-xs text-muted">
        <span class="inline-flex items-center gap-1">from <HubFace :name="w.mine ? 'You' : w.from_name || 'someone'" /><b class="font-medium text-fg">{{ w.mine ? "you" : w.from_name || "someone" }}</b></span>
        <span v-if="holder" class="inline-flex items-center gap-1"> · held by <HubFace :name="holder.you ? 'You' : holder.name" /><b class="font-medium text-fg">{{ holder.you ? "you" : holder.name }}</b></span>
      </p>
    </div>
  </Teleport>
</template>
