<!--
  A board card's quick actions, opened by right-clicking the card (or the context-menu key on it).
  The same acts as the guide's own page, worded the same way, and offered under the same rules:
  anyone in the team moves work and stops an agent, its author or a team admin (`manage`) archives
  and deletes. Ready is the one that goes to the page instead, because marking a task Ready asks
  which repo it is for, and that question belongs with the task in front of you.

  Drawn at the pointer, fixed to the viewport and pulled back inside it, so it is never clipped by
  the board's sideways scroll. Escape, a click elsewhere, scrolling or picking an item closes it.
-->
<script setup lang="ts">
import type { Guide, Task, Working } from "~/types/hub";

const props = defineProps<{ guide: Guide; x: number; y: number; canGive: boolean }>();
const emit = defineEmits<{ close: []; give: [] }>();
const { onArchive, onCloseGuide, onRemove, onTaskDraft, onTakeBack } = useHub();

const g = computed(() => props.guide);
const isTask = computed(() => g.value.kind === "task");
const archived = computed(() => g.value.status === "consumed");
const held = computed(() => (g.value.held_by ?? []).some((h) => h.health !== "review"));

const menu = ref<HTMLElement | null>(null);
const at = ref({ left: props.x, top: props.y });
onMounted(() => {
  const box = menu.value?.getBoundingClientRect();
  if (box)
    at.value = {
      left: Math.max(8, Math.min(props.x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(props.y, window.innerHeight - box.height - 8)),
    };
  menu.value?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("scroll", close, true);
  window.addEventListener("resize", close);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside, true);
  window.removeEventListener("scroll", close, true);
  window.removeEventListener("resize", close);
});
function outside(e: PointerEvent) {
  if (!menu.value?.contains(e.target as Node)) close();
}
function close() {
  emit("close");
}

/** Up and down move between items, as in any menu; Tab leaves it. */
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" || e.key === "Tab") return close();
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const items = [...(menu.value?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
  const i = items.indexOf(document.activeElement as HTMLElement);
  items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
}

async function run(act: () => Promise<unknown>) {
  close();
  await act();
}
const draft = () => run(() => onTaskDraft({ id: g.value.id } as Task));
const stop = () => run(() => onTakeBack({ id: g.value.id } as Working));
// As on the guide's page: a task is archived through its status, a handoff or bug is closed.
const archive = () => run(() => (isTask.value ? onArchive(g.value, true) : onCloseGuide(g.value)));
const unarchive = () => run(() => onArchive(g.value, false));
function remove() {
  if (!confirm(`Delete "${g.value.title}"? This cannot be undone.`)) return close();
  run(() => onRemove(g.value));
}
function give() {
  emit("give");
  close();
}
function copyAndClose(text: string, e: Event) {
  copy(text, e.currentTarget as HTMLElement);
  setTimeout(close, 600);
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="menu"
      class="menu !fixed !m-0 w-60"
      :style="{ left: `${at.left}px`, top: `${at.top}px`, right: 'auto' }"
      role="menu"
      :aria-label="`Actions for ${g.title || 'this guide'}`"
      @keydown="onKey"
      @contextmenu.prevent
    >
      <NuxtLink role="menuitem" class="menu-item" :to="`/hub/g/${g.id}`" @click="close">
        <AppIcon name="open" />Open
      </NuxtLink>
      <NuxtLink
        v-if="isTask && g.stage === 'draft'"
        role="menuitem"
        class="menu-item"
        :to="`/hub/g/${g.id}`"
        @click="close"
      >Ready for agents…</NuxtLink>
      <button
        v-if="isTask && g.stage === 'todo'"
        role="menuitem"
        class="menu-item"
        type="button"
        @click="draft"
      >Move to Draft</button>
      <button v-if="canGive" role="menuitem" class="menu-item" type="button" @click.stop="give">Give to…</button>
      <button v-if="held" role="menuitem" class="menu-item" type="button" @click="stop">Stop this agent</button>
      <div class="menu-rule" role="separator" />
      <button role="menuitem" class="menu-item" type="button" @click="copyAndClose(g.url, $event)">
        <AppIcon name="copy" /><span data-label>Copy share link</span>
      </button>
      <button
        role="menuitem"
        class="menu-item"
        type="button"
        @click="copyAndClose(`passalong pull ${g.url}`, $event)"
      >
        <AppIcon name="copy" /><span data-label>Copy pull command</span>
      </button>
      <template v-if="g.manage">
        <div class="menu-rule" role="separator" />
        <button v-if="!archived" role="menuitem" class="menu-item" type="button" @click="archive">Archive</button>
        <button v-else role="menuitem" class="menu-item" type="button" @click="unarchive">{{ isTask ? "Unarchive to Draft" : "Unarchive" }}</button>
        <button role="menuitem" class="menu-item destructive" type="button" @click="remove">Delete</button>
      </template>
    </div>
  </Teleport>
</template>
