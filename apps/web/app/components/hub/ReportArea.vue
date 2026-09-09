<!--
  A product area, and the issues filed against it.

  This is the card the request was actually about: pick "Storefront Editor" once and keep adding
  issues under it, instead of answering the same question six times. The area is chosen on the
  card, and every issue inside it inherits the answer — which is also why the issue keys are
  prefixed with the area's code, so a key says where its issue is without opening it.
-->
<script setup lang="ts">
import type { Area } from "~/utils/report";
import { areaCode, blankIssue } from "~/utils/report";

const props = defineProps<{ area: Area; duplicate: boolean }>();
const emit = defineEmits<{ (e: "remove"): void; (e: "touch"): void }>();

const code = computed(() => areaCode(props.area.area));
const anyOpen = computed(() => props.area.issues.some((i) => i.open));

function add() {
  props.area.issues.push(blankIssue());
  emit("touch");
}

function remove(id: string) {
  // An area with no issues is not a group, it is a leftover. Removing the last one removes the
  // card, which is also the only way an area card ever leaves without a confirmation.
  if (props.area.issues.length === 1) {
    emit("remove");
    return;
  }
  props.area.issues = props.area.issues.filter((i) => i.id !== id);
  emit("touch");
}

function duplicateIssue(id: string) {
  const at = props.area.issues.findIndex((i) => i.id === id);
  const source = props.area.issues[at];
  if (!source) return;
  props.area.issues.splice(at + 1, 0, {
    ...structuredClone(toRaw(source)),
    id: newId(),
    title: source.title ? `${source.title} (copy)` : "",
    // The copy is its own guide and has not been written yet, whatever the original's state.
    saved: false,
    open: true,
    // Evidence is shared by reference on purpose: the same upload, named twice, not stored twice.
    shots: [...source.shots],
  });
  emit("touch");
}

function toggleAll() {
  const closing = anyOpen.value;
  for (const issue of props.area.issues) issue.open = !closing;
}
</script>

<template>
  <section class="overflow-hidden rounded-3 border border-line bg-raised">
    <div class="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3">
      <span
        class="shrink-0 rounded-2 border px-2 py-1 font-code text-xs font-semibold"
        :class="area.area ? 'border-accent-soft bg-accent-soft text-accent' : 'border-line text-muted'"
      >{{ code }}</span>

      <label class="flex items-center gap-2">
        <span class="sr-only">Product area</span>
        <select v-model="area.area" class="w-auto min-w-52 font-ui font-semibold" @change="emit('touch')">
          <option value="">Which area is this?</option>
          <option v-for="a in AREAS" :key="a.slug" :value="a.slug">{{ a.label }}</option>
        </select>
      </label>

      <span class="font-code text-xs text-muted">
        {{ area.issues.length }} issue{{ area.issues.length === 1 ? "" : "s" }}
      </span>

      <span class="ml-auto flex gap-1">
        <button type="button" class="btn sm" @click="toggleAll">
          {{ anyOpen ? "collapse all" : "expand all" }}
        </button>
        <button type="button" class="btn sm destructive" @click="emit('remove')">remove area</button>
      </span>
    </div>

    <!-- Two cards for one area is a mistake worth naming rather than merging behind their back:
         which issues they meant to put where is not something this can guess. -->
    <p
      v-if="duplicate"
      class="m-0 border-b border-line bg-warn-soft px-4 py-2 font-ui text-sm text-warn"
    >
      Another card above is already {{ areaLabel(area.area) }}. Move these issues into it, or pick a
      different area — otherwise the report has the same heading twice.
    </p>

    <div>
      <HubReportIssue
        v-for="(issue, n) in area.issues"
        :key="issue.id"
        :issue="issue"
        :code="code"
        :index="n"
        @remove="remove(issue.id)"
        @duplicate="duplicateIssue(issue.id)"
        @touch="emit('touch')"
      />
    </div>

    <div class="px-4 py-3">
      <button
        type="button"
        class="w-full rounded-2 border border-dashed border-line-strong bg-transparent px-3 py-3 text-left font-ui text-sm text-muted hover:border-accent hover:text-accent"
        @click="add"
      >
        + another issue in {{ area.area ? areaLabel(area.area) : "this area" }}
      </button>
    </div>
  </section>
</template>
