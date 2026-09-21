<!--
  Whose guides you are looking at, as the title's own dropdown: "Guides in [Khaime ▾]".

  It used to be a row of chips in the masthead, far from the list it filtered, labelled with each
  team's slug in the code face. The slug is what the server stores; the name is what the person
  typed and what everyone calls the team, so that is what this shows.

  The hub's guide list is scoped; `/v1/board` is not, so across all teams the page adds back
  anything sent to you from outside your teams.
-->
<script setup lang="ts">
const { data, scope } = useHub();
const teams = computed(() => data.value.me?.teams || []);

const options = computed(() => [
  { value: "all", label: "All teams" },
  { value: "mine", label: "Only ones I sent" },
  ...teams.value.map((t) => ({ value: t.slug, label: t.name || t.slug })),
]);
const current = computed(
  () => options.value.find((o) => o.value === scope.value)?.label || "All teams",
);

const open = ref(false);
const root = ref<HTMLElement | null>(null);

function pick(value: string) {
  scope.value = value;
  open.value = false;
}

function onDocument(e: MouseEvent) {
  if (open.value && !root.value?.contains(e.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener("click", onDocument));
onBeforeUnmount(() => document.removeEventListener("click", onDocument));
</script>

<template>
  <div v-if="teams.length" ref="root" class="relative inline-block" @keydown.esc="open = false">
    <button
      type="button"
      class="btn text-base font-semibold"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      {{ current }}
      <AppIcon name="reveal" class="text-muted" />
    </button>
    <div v-if="open" class="menu left-0 right-auto" role="menu">
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        class="menu-item"
        role="menuitemradio"
        :aria-checked="scope === o.value"
        @click="pick(o.value)"
      >
        <span class="w-4 shrink-0 text-accent">{{ scope === o.value ? "✓" : "" }}</span>
        {{ o.label }}
      </button>
    </div>
  </div>
</template>
