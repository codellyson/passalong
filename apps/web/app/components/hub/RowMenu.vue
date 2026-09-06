<!--
  Everything a guide can do that is not the one thing this row leads with. It is a menu rather than
  a row of buttons because the alternative is what this page used to be: up to eight identical
  ghost buttons per guide, seven guides deep, with the destructive ones distinguished only on hover.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";

const props = defineProps<{ g: Guide }>();
const emit = defineEmits<{ verdict: [] }>();

const { onStatus, onRemove } = useHub();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const pull = computed(() => `passalong pull ${props.g.id}`);
/** Only the person a guide was handed to gets to say whether it worked. */
const canJudge = computed(() => !props.g.mine);

// Two complete strings rather than a base plus an override: both set `color`, and which one won
// would be decided by Tailwind's ordering of its own utilities, not by the order written here.
const BASE =
  "flex w-full cursor-pointer items-center gap-2 rounded-1 border-0 bg-transparent px-2 py-1.5 text-left font-ui text-sm";
const item = `${BASE} text-fg hover:bg-surface`;
const dangerItem = `${BASE} text-danger hover:bg-danger-soft`;

function shut() {
  open.value = false;
}

/** A menu that stays open behind you is worse than no menu. */
function onDocument(e: MouseEvent) {
  if (open.value && !root.value?.contains(e.target as Node)) shut();
}

onMounted(() => document.addEventListener("click", onDocument));
onBeforeUnmount(() => document.removeEventListener("click", onDocument));

function run(work: () => void) {
  shut();
  work();
}
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="shut">
    <button
      class="cursor-pointer rounded-1 border border-line-strong px-2.5 py-2 font-ui text-sm leading-none font-semibold text-muted transition-colors hover:border-muted hover:text-fg"
      :aria-expanded="open"
      aria-haspopup="menu"
      :title="`more for ${g.id}`"
      @click="open = !open"
    >
      ⋯
    </button>

    <div
      v-if="open"
      class="absolute top-full right-0 z-20 mt-1 flex w-56 flex-col gap-0.5 rounded-2 border border-line-strong bg-raised p-1.5 shadow-lift"
    >
      <a :class="item" :href="g.url" target="_blank" rel="noopener" @click="shut">open the guide</a>
      <button :class="item" :title="pull" @click="copy(pull, $event.currentTarget)">
        copy pull command
      </button>
      <button :class="item" @click="copy(g.url, $event.currentTarget)">copy link</button>

      <template v-if="canJudge">
        <div class="my-1 h-px bg-line" />
        <button :class="item" @click="run(() => emit('verdict'))">say whether it worked</button>
      </template>

      <div class="my-1 h-px bg-line" />
      <button
        v-if="g.status !== 'consumed'"
        :class="item"
        @click="run(() => onStatus(g, 'consumed'))"
      >
        mark done
      </button>
      <button
        v-if="g.mine && g.status !== 'promoted'"
        :class="item"
        @click="run(() => onStatus(g, 'promoted'))"
      >
        promote to a reference
      </button>
      <button
        v-if="g.mine && g.status !== 'published'"
        :class="item"
        @click="run(() => onStatus(g, 'published'))"
      >
        reopen
      </button>
      <button v-if="g.mine" :class="dangerItem" @click="run(() => onRemove(g))">
        remove from sync
      </button>
    </div>
  </div>
</template>
