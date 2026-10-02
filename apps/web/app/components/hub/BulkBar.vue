<!--
  Act on what is ticked: Archive, Unarchive, Delete. Each button says how many it will touch,
  because a selection can mix archived and live guides and each act only applies to one kind.
  Delete asks once, in place, before it does anything — it cannot be undone.
-->
<script setup lang="ts">
import type { QueryKey } from "@tanstack/vue-query";

const props = defineProps<{
  /** Queries this page reads that the change also moves, beyond the hub's own. */
  also?: QueryKey[];
}>();
const { onBulk } = useHub();
const { on, list, clear, stop } = useSelection();

const toArchive = computed(() => list.value.filter((p) => !p.archived));
const toUnarchive = computed(() => list.value.filter((p) => p.archived));
const confirming = ref(false);
const busy = ref("");

const count = (n: number) => `${n} ${n === 1 ? "guide" : "guides"}`;

async function act(action: "archive" | "unarchive" | "delete") {
  const ids = (
    action === "archive" ? toArchive.value : action === "unarchive" ? toUnarchive.value : list.value
  ).map((p) => p.id);
  if (!ids.length) return;
  busy.value = action;
  try {
    await onBulk(ids, action, props.also);
    confirming.value = false;
    clear();
  } finally {
    busy.value = "";
  }
}

// The boxes are on for as long as this is on the page, and a selection never outlives the list it
// was made on.
onMounted(() => {
  on.value = true;
});
onBeforeUnmount(stop);
</script>

<template>
  <!-- Floats over the bottom of the page once something is ticked, and takes no room before: the
       list does not move when you select, and the bar is in reach however far down the tick was. -->
  <Transition
    enter-active-class="transition-[opacity,translate] duration-150 ease-out motion-reduce:transition-none"
    enter-from-class="translate-y-2 opacity-0"
    leave-active-class="transition-opacity duration-100 motion-reduce:transition-none"
    leave-to-class="opacity-0"
  >
    <div
      v-if="list.length"
      class="fixed bottom-6 left-1/2 z-30 flex w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-3 rounded-3 bg-ink px-4 py-3 text-on-ink shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
      role="region"
      aria-label="Selected guides"
    >
      <div class="flex flex-wrap items-center gap-2 font-ui text-sm">
        <span class="mr-auto font-medium">{{ count(list.length) }} selected</span>
        <template v-if="!confirming">
          <button v-if="toArchive.length" class="btn sm !border-0 !bg-bg !text-fg" type="button" :disabled="Boolean(busy)" @click="act('archive')">
            {{ busy === "archive" ? "Archiving…" : `Archive ${toArchive.length}` }}
          </button>
          <button v-if="toUnarchive.length" class="btn sm !border-0 !bg-bg !text-fg" type="button" :disabled="Boolean(busy)" @click="act('unarchive')">
            {{ busy === "unarchive" ? "Unarchiving…" : `Unarchive ${toUnarchive.length}` }}
          </button>
          <button class="btn sm !border-0 !bg-danger !text-white" type="button" :disabled="Boolean(busy)" @click="confirming = true">Delete {{ list.length }}</button>
          <button class="linkish !text-on-ink font-ui text-sm" type="button" @click="clear">Clear</button>
        </template>
      </div>
      <div v-if="confirming" class="flex flex-wrap items-center gap-2 font-ui text-sm" role="alert">
        <span class="mr-auto">Delete {{ count(list.length) }} for good? This cannot be undone.</span>
        <button class="btn sm !border-0 !bg-danger !text-white" type="button" :disabled="Boolean(busy)" @click="act('delete')">
          {{ busy === "delete" ? "Deleting…" : `Yes, delete ${list.length}` }}
        </button>
        <button class="btn sm !border-0 !bg-bg !text-fg" type="button" :disabled="Boolean(busy)" @click="confirming = false">Cancel</button>
      </div>
    </div>
  </Transition>
</template>
