<!--
  Everything a guide can do that is not the one thing this row leads with. It is a menu rather than
  a row of buttons because the alternative is what this page used to be: up to eight identical
  ghost buttons per guide, seven guides deep, with the destructive ones distinguished only on hover.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";

const props = defineProps<{ g: Guide }>();
const emit = defineEmits<{ verdict: [] }>();

const { onRemove } = useHub();

const open = ref(false);
/** Removal asks in the menu it was chosen from. `confirm()` threw where dialogs are blocked. */
const confirming = ref(false);
const root = ref<HTMLElement | null>(null);

const pull = computed(() => `passalong pull ${props.g.id}`);
/** Only the person a guide was handed to gets to say whether it worked. */
const canJudge = computed(() => !props.g.mine);

function shut() {
  open.value = false;
  confirming.value = false;
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
      class="btn icon"
      :aria-expanded="open"
      aria-haspopup="menu"
      :title="`more for ${g.id}`"
      @click="open = !open"
    >
      <AppIcon name="more" />
    </button>

    <div v-if="open" class="menu">
      <a class="menu-item" :href="g.url" target="_blank" rel="noopener" @click="shut">open the guide</a>
      <button class="menu-item" :title="pull" @click="copy(pull, $event.currentTarget)">
        copy pull command
      </button>
      <button class="menu-item" @click="copy(g.url, $event.currentTarget)">copy link</button>

      <template v-if="canJudge">
        <div class="menu-rule" />
        <button class="menu-item" @click="run(() => emit('verdict'))">say whether it worked</button>
      </template>

      <div class="menu-rule" />
      <template v-if="g.mine">
        <button v-if="!confirming" class="menu-item destructive" @click="confirming = true">
          remove from sync
        </button>
        <template v-else>
          <p class="menu-note">Removes it from sync for everyone. Local copies are untouched.</p>
          <button class="menu-item destructive" @click="run(() => onRemove(g))">Yes, remove it</button>
          <button class="menu-item" @click="confirming = false">Keep it</button>
        </template>
      </template>
    </div>
  </div>
</template>
