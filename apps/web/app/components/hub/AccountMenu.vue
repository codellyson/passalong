<!--
  You, at the foot of the hub's rail, and the few things about you rather than about a piece of
  work: where to learn how the product works, the appearance, and signing out. Settings is its own
  place on the rail, just above.

  It replaces a footer that printed your handle — or, with no handle, "account <id>" — beside a
  lowercase "sign out", and a "What is Passalong?" link in the page heading that sent someone
  already signed in back to the marketing page.
-->
<script setup lang="ts">
const { data, signOut } = useHub();

const label = computed(() => meName(data.value.me) || "Account");
/** Two letters for the avatar a phone shows instead of the whole name. */
const initials = computed(() => initialsOf(label.value));

const open = ref(false);
const root = ref<HTMLElement | null>(null);

function onDocument(e: MouseEvent) {
  if (open.value && !root.value?.contains(e.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener("click", onDocument));
onBeforeUnmount(() => document.removeEventListener("click", onDocument));
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      class="flex min-h-9 w-full cursor-pointer items-center gap-3 rounded-1 border-0 bg-transparent px-3 py-1.5 text-left font-ui text-sm text-on-rail-muted transition-colors hover:bg-rail-hover hover:text-on-rail"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      <span class="grid size-6 shrink-0 place-items-center rounded-1 bg-rail-current text-xs font-semibold text-on-rail" aria-hidden="true">{{ initials }}</span>
      <span class="min-w-0 grow break-words">{{ label }}</span>
      <AppIcon name="reveal" class="shrink-0" />
    </button>
    <!-- Opens upward: it sits at the foot of the rail. -->
    <div v-if="open" class="menu top-auto right-auto bottom-full left-0 mb-1 w-full min-w-[15rem]" role="menu">
      <p v-if="data.me?.email" class="menu-note mt-0 mb-1 break-words">{{ data.me.email }}</p>
      <NuxtLink v-if="data.me?.role === 'super'" class="menu-item" to="/admin" @click="open = false">
        Admin
      </NuxtLink>
      <a class="menu-item" href="/connect">Connect Claude or another assistant</a>
      <a class="menu-item" href="/">How Passalong works</a>
      <div class="menu-rule" />
      <AppThemeToggle row />
      <div class="menu-rule" />
      <button class="menu-item" type="button" @click="signOut">Sign out</button>
    </div>
  </div>
</template>
