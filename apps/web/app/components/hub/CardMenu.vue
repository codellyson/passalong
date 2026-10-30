<!--
  A board card's actions, opened from the card's own menu button or by right-clicking it. The same
  acts as the work's own page, worded the same way, and offered under the same rules: anyone in the
  team moves work and stops an agent, its author or a team admin (`manage`) archives and deletes.
  It is also the keyboard's way to do what dragging does: each move between columns is an item
  here (Ready, Move to Draft, Stop this agent, Reopen, Archive), and so is Give to….

  Drawn where it was opened, fixed to the viewport and pulled back inside it. Escape, a click
  elsewhere, scrolling or picking an item closes it. Reopen and Delete ask inside it, in place.
-->
<script setup lang="ts">
import type { Guide, Task, Working } from "~/types/hub";

const props = defineProps<{ guide: Guide; x: number; y: number; canGive: boolean }>();
const emit = defineEmits<{ close: []; give: [] }>();
const { onArchive, onRemove, onReopen, onTaskDraft, onTaskReady, onTakeBack } = useHub();

const g = computed(() => props.guide);
const archived = computed(() => g.value.status === "consumed");
const held = computed(() => Boolean(g.value.held_by?.length));

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
  // Tab moves through the reason form's own buttons rather than leaving the menu.
  if (e.key === "Tab" && (e.target as HTMLElement).closest("form")) return;
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
const archive = () => run(() => onArchive(g.value, true));
const unarchive = () => run(() => onArchive(g.value, false));
/** Delete asks inside the menu, naming what goes, before anything does. */
const confirming = ref(false);
function remove() {
  run(() => onRemove(g.value));
}
const ready = () => run(() => onTaskReady({ id: g.value.id } as Task));
/** Finished work back to To do, with why. Archived work is Unarchive's. */
const reopenable = computed(() => archived.value && g.value.outcome !== "archived");
const reopening = ref(false);
// The item that opened it had focus and is gone; the field takes it.
watch(reopening, async (on) => {
  await nextTick();
  if (on) menu.value?.querySelector<HTMLInputElement>("input[name=why]")?.focus();
});
function reopen(form: HTMLFormElement) {
  const why = field(form, "why").trim();
  if (why) run(() => onReopen(g.value.id, why));
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
      :aria-label="`Actions for ${g.title || 'this work'}`"
      @keydown="onKey"
      @contextmenu.prevent
    >
      <NuxtLink role="menuitem" class="menu-item" :to="`/hub/g/${g.id}`" @click="close">
        <AppIcon name="open" />Open
      </NuxtLink>
      <button
        v-if="g.stage === 'draft'"
        role="menuitem"
        class="menu-item"
        type="button"
        @click="ready"
      >Ready</button>
      <button
        v-if="g.stage === 'todo' && !held"
        role="menuitem"
        class="menu-item"
        type="button"
        @click="draft"
      >Move to Draft</button>
      <button v-if="canGive" role="menuitem" class="menu-item" type="button" @click.stop="give">Give to…</button>
      <button v-if="held" role="menuitem" class="menu-item" type="button" @click="stop">Stop this agent</button>
      <button v-if="reopenable && !reopening" role="menuitem" class="menu-item" type="button" @click.stop="reopening = true">Reopen…</button>
      <form v-else-if="reopenable" class="flex flex-col gap-2 px-2 py-2" @submit.prevent="reopen($event.target as HTMLFormElement)">
        <label class="font-ui text-sm" :for="`reopen-${g.id}`">What's still wrong? Whoever finished it is told.</label>
        <input :id="`reopen-${g.id}`" name="why" class="h-8 text-sm" required @keydown.stop />
        <div class="flex gap-2">
          <button class="btn sm primary" type="submit">Reopen</button>
          <button class="btn sm" type="button" @click.stop="reopening = false">Keep it</button>
        </div>
      </form>
      <div class="menu-rule" role="separator" />
      <button role="menuitem" class="menu-item" type="button" @click="copyAndClose(g.url, $event)">
        <AppIcon name="copy" /><span data-label>Copy share link</span>
      </button>
      <button
        role="menuitem"
        class="menu-item"
        type="button"
        @click="copyAndClose(`passalong take ${g.id}`, $event)"
      >
        <AppIcon name="copy" /><span data-label>Copy the command for an agent</span>
      </button>
      <template v-if="g.manage">
        <div class="menu-rule" role="separator" />
        <button v-if="!archived" role="menuitem" class="menu-item" type="button" @click="archive">Archive</button>
        <button v-else role="menuitem" class="menu-item" type="button" @click="unarchive">Unarchive to Draft</button>
        <button v-if="!confirming" role="menuitem" class="menu-item destructive" type="button" @click.stop="confirming = true">Delete…</button>
        <div v-else class="flex flex-col gap-2 px-2 py-2" role="alert">
          <p class="m-0 font-ui text-sm">Delete “{{ g.title }}” with its screenshots and files? This cannot be undone.</p>
          <div class="flex gap-2">
            <button role="menuitem" class="btn sm outline danger" type="button" @click="remove">Delete</button>
            <button role="menuitem" class="btn sm" type="button" @click.stop="confirming = false">Keep it</button>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>
