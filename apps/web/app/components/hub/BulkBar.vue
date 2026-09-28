<!--
  Select, then act on what is selected: Archive, Unarchive, Delete. Each button says how many it
  will touch, because a selection can mix archived and live guides and each act only applies to
  one kind. Delete asks once, in place, before it does anything — it cannot be undone.
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

// Leaving the page leaves the mode, so a selection never outlives the list it was made on.
onBeforeUnmount(stop);
</script>

<template>
  <!-- While selecting it stays in view under the masthead, so a tick far down a list can still be
       acted on without scrolling back to the top. -->
  <div class="flex flex-col gap-2" :class="on ? 'sticky top-16 z-20 -mx-2 rounded-2 bg-bg/90 px-2 py-2 backdrop-blur-md' : ''">
    <div class="flex flex-wrap items-center gap-2">
      <button
        class="btn sm"
        type="button"
        :aria-pressed="on"
        @click="on ? stop() : (on = true)"
      >{{ on ? "Done selecting" : "Select" }}</button>
      <template v-if="on">
        <span class="font-ui text-sm text-muted">{{ list.length ? `${count(list.length)} selected` : "Nothing selected yet" }}</span>
        <template v-if="list.length && !confirming">
          <button
            v-if="toArchive.length"
            class="btn sm"
            type="button"
            :disabled="Boolean(busy)"
            @click="act('archive')"
          >{{ busy === "archive" ? "Archiving…" : `Archive ${toArchive.length}` }}</button>
          <button
            v-if="toUnarchive.length"
            class="btn sm"
            type="button"
            :disabled="Boolean(busy)"
            @click="act('unarchive')"
          >{{ busy === "unarchive" ? "Unarchiving…" : `Unarchive ${toUnarchive.length}` }}</button>
          <button
            class="btn outline danger sm"
            type="button"
            :disabled="Boolean(busy)"
            @click="confirming = true"
          >Delete {{ list.length }}</button>
          <button class="linkish font-ui text-sm" type="button" @click="clear">Clear</button>
        </template>
      </template>
    </div>
    <p v-if="on && !list.length" class="m-0 font-ui text-xs text-muted">
      Tick the guides to act on. Only your own can be picked: archiving and deleting are the author's.
    </p>
    <div
      v-if="on && confirming"
      class="flex flex-wrap items-center gap-2 rounded-2 border border-danger px-4 py-3 font-ui text-sm"
      role="alert"
    >
      <span>Delete {{ count(list.length) }} for good? Nobody will be able to open {{ list.length === 1 ? "it" : "them" }} again, and this cannot be undone.</span>
      <button class="btn danger sm" type="button" :disabled="Boolean(busy)" @click="act('delete')">
        {{ busy === "delete" ? "Deleting…" : `Yes, delete ${list.length}` }}
      </button>
      <button class="btn sm" type="button" :disabled="Boolean(busy)" @click="confirming = false">Cancel</button>
    </div>
  </div>
</template>
