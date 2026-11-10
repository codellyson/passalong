<!--
  One value in the JSON viewer's tree. Children render only while their parent is open, and a long
  list a page at a time: a pasted file can hold more nodes than a tab can draw. While a search runs,
  only what leads to a match is shown.
-->
<script setup lang="ts">
import { type FunctionalComponent, h } from "vue";

const PAGE = 500;
const CLIP = 500;

const props = defineProps<{
  name?: string;
  index?: boolean;
  value: Json;
  id: string;
  path: string;
  depth: number;
  free?: boolean;
}>();

const view = inject<JsonTreeView>(JSON_VIEW) as JsonTreeView;

const shown = ref(PAGE);
const whole = ref(false);

const expanded = computed(() => expandJson(props.value, props.path));
const isHit = computed(() => view.found?.hits.has(props.id) ?? false);
const rows = computed(() => {
  const all = (expanded.value?.kids ?? []).map((kid, i) => ({ kid, id: `${props.id}/${i}` }));
  const found = view.found;
  return !found || props.free || isHit.value ? all : all.filter((row) => found.keep.has(row.id));
});
const open = computed(
  () =>
    view.overrides.get(props.id) ??
    (view.found ? view.found.open.has(props.id) : props.depth < view.levels),
);
const selected = computed(() => view.selected?.id === props.id);
const count = computed(() => {
  const n = expanded.value?.kids.length;
  return Array.isArray(props.value)
    ? `[${n}]`
    : typeof props.value === "string"
      ? `${n} inside`
      : `{${n}}`;
});

const text = computed(() => scalarText(props.value));
const clipped = computed(() => !whole.value && text.value.length > CLIP);
const link = computed(() => linkOf(props.value));
const hint = computed(() => dateHint(props.name, props.value));
const tone = computed(() => {
  const v = props.value;
  if (typeof v === "string") return "text-ok";
  if (typeof v === "boolean" || v === null || expanded.value) return "text-muted";
  return "text-accent";
});

const Marked: FunctionalComponent<{ text: string }> = (p) =>
  marked(p.text, view.query).map((part) =>
    part.hit ? h("mark", { class: "rounded-1 bg-accent-soft text-fg" }, part.text) : part.text,
  );

function onToggle(e: Event) {
  const now = (e.target as HTMLDetailsElement).open;
  if (now !== open.value) view.overrides.set(props.id, now);
}

function select() {
  view.selected = { id: props.id, path: props.path, value: props.value };
}
</script>

<template>
  <details v-if="expanded?.kids.length" class="[&>*]:animate-none" :open="open" @toggle="onToggle">
    <summary class="cursor-pointer rounded-1" :class="selected && 'bg-surface'">
      <button
        type="button"
        class="cursor-pointer border-0 bg-transparent p-0 font-mono text-sm text-fg hover:underline"
        :aria-pressed="selected"
        @click.prevent="select"
      >
        <Marked v-if="name !== undefined && !index" :text="name" />
        <span v-else class="text-muted">{{ name ?? "root" }}</span>
      </button>
      <span class="ml-2 text-muted">{{ count }}</span>
      <span v-if="expanded.label" class="ml-2 font-ui text-xs text-muted">{{ expanded.label }}</span>
    </summary>
    <div v-if="open" class="ml-1 border-l border-line pl-4">
      <JsonNode
        v-for="row in rows.slice(0, shown)"
        :key="row.id"
        :name="row.kid.name"
        :index="row.kid.index"
        :value="row.kid.value"
        :id="row.id"
        :path="row.kid.path"
        :depth="depth + 1"
        :free="free || isHit"
      />
      <button v-if="rows.length > shown" type="button" class="linkish" @click="shown += PAGE">
        Show {{ Math.min(PAGE, rows.length - shown) }} more of {{ rows.length - shown }}
      </button>
    </div>
  </details>
  <div v-else class="rounded-1 [overflow-wrap:anywhere]" :class="selected && 'bg-surface'">
    <button
      type="button"
      class="cursor-pointer border-0 bg-transparent p-0 font-mono text-sm text-fg hover:underline"
      :aria-pressed="selected"
      @click="select"
    >
      <Marked v-if="name !== undefined && !index" :text="name" />
      <span v-else class="text-muted">{{ name ?? "root" }}</span>
    </button>
    <span>: </span>
    <a v-if="link" :href="link" target="_blank" rel="noopener noreferrer" class="text-ok underline">
      <Marked :text="clipped ? `${text.slice(0, CLIP)}…` : text" />
    </a>
    <span v-else :class="tone"><Marked :text="clipped ? `${text.slice(0, CLIP)}…` : text" /></span>
    <button v-if="clipped" type="button" class="linkish ml-2" @click="whole = true">
      Show all {{ text.length }} characters
    </button>
    <span v-if="hint" class="ml-2 font-ui text-xs text-muted">{{ hint }}</span>
  </div>
</template>
