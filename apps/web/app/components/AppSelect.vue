<script setup lang="ts">
import { shorten } from "~/utils/shorten";

type Option = { value: string; label: string };

const props = defineProps<{
  modelValue: string;
  options: Option[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
  shortAt?: number;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const current = computed(
  () => props.options.find((option) => option.value === props.modelValue)?.label || props.placeholder || "Choose",
);

function close() {
  open.value = false;
  trigger.value?.focus();
}

function pick(value: string) {
  emit("update:modelValue", value);
  close();
}

async function show() {
  open.value = true;
  await nextTick();
  const items = menu.value?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]");
  const selected = props.options.findIndex((option) => option.value === props.modelValue);
  items?.[Math.max(0, selected)]?.focus();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  if (!open.value) {
    void show();
    return;
  }
  const items = Array.from(menu.value?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") || []);
  if (!items.length) return;
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
    (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}

function onDocument(event: MouseEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener("click", onDocument));
onBeforeUnmount(() => document.removeEventListener("click", onDocument));
</script>

<template>
  <div ref="root" class="relative inline-block" @keydown="onKeydown">
    <button
      ref="trigger"
      type="button"
      class="btn w-full justify-between text-left"
      :aria-label="`${label}: ${current}`"
      :aria-expanded="open"
      aria-haspopup="menu"
      :disabled="disabled"
      @click="open ? close() : show()"
    >
      <span>{{ shorten(current, shortAt || 26).text }}</span>
      <AppIcon name="reveal" class="shrink-0 text-muted" />
    </button>
    <div v-if="open" ref="menu" class="menu under-field" role="menu" :aria-label="label">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="menu-item"
        role="menuitemradio"
        :aria-checked="modelValue === option.value"
        @click="pick(option.value)"
      >
        <span class="w-4 shrink-0 text-accent">{{ modelValue === option.value ? "✓" : "" }}</span>
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
