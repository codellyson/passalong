<!--
  A link to somewhere else, with a card on hover or keyboard focus that says what is there: the
  page's own title, description and site, from its Open Graph tags (`GET /v1/unfurl`, fetched by
  the server and cached, so the reader's browser asks nobody but us). Read only when someone
  points at the link, once per link per hour. A page that says nothing gets no card — except a
  GitHub reference, which says what the URL itself says (`what`), since a private repo's page
  answers GitHub's sign-in and nothing else.
-->
<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";

// The link is not the only root (the card is teleported), so class and aria pass to it by hand.
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  href: string;
  /** For a GitHub reference: what it is, when its page says nothing. */
  what?: string;
}>();
const { reads } = useHub();
const queryClient = useQueryClient();

const anchor = ref<HTMLElement | null>(null);
// One card open at a time across the hub: opening one closes whichever was open.
const showing = useState<string>("hover-card", () => "");
const mine = ref(false);
const open = computed({
  get: () => mine.value && showing.value === cardId,
  set: (v: boolean) => {
    mine.value = v;
    if (v) showing.value = cardId;
  },
});
const preview = ref<{ title: string; description: string; site: string } | null>(null);
const at = ref({ top: 0, left: 0 });
const cardId = `url-card-${useId()}`;
let timer: ReturnType<typeof setTimeout> | undefined;
const CARD_W = 320;
const host = computed(() => {
  try {
    return new URL(props.href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
});

function show() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      preview.value = await queryClient.fetchQuery({
        ...reads.unfurl(props.href),
        staleTime: 3_600_000,
      });
    } catch {
      preview.value = null;
    }
    const box = anchor.value?.getBoundingClientRect();
    if (!box || !(preview.value?.title || props.what)) return;
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
</script>

<template>
  <a
    ref="anchor"
    :href="href"
    target="_blank"
    rel="noopener nofollow"
    v-bind="$attrs"
    :aria-describedby="open ? cardId : undefined"
    @mouseenter="show"
    @mouseleave="hide"
    @focus="show"
    @blur="hide"
    @keydown.esc="open = false"
  ><slot /></a>
  <Teleport to="body">
    <div
      v-if="open"
      :id="cardId"
      role="tooltip"
      class="fixed z-50 flex flex-col gap-1 rounded-3 bg-raised px-4 py-3 font-ui text-sm text-fg not-italic shadow-[0_0_0_1px_var(--edge-ring),var(--shadow-2)]"
      :style="{ top: `${at.top}px`, left: `${at.left}px`, width: `${CARD_W}px` }"
      @mouseenter="show"
      @mouseleave="hide"
    >
      <p class="m-0 text-xs text-muted">{{ preview?.site || host }}</p>
      <b class="font-medium leading-snug break-words">{{ preview?.title || what }}</b>
      <p v-if="preview?.description" class="m-0 line-clamp-3 leading-snug text-muted">{{ preview.description }}</p>
    </div>
  </Teleport>
</template>
