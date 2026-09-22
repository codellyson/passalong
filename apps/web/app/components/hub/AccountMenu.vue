<!--
  You, and the few things that are about you rather than about a guide: your settings, where to
  learn how the product works, and signing out.

  It replaces a footer that printed your handle — or, with no handle, "account <id>" — beside a
  lowercase "sign out", and a "What is Passalong?" link in the page heading that sent someone
  already signed in back to the marketing page.
-->
<script setup lang="ts">
const { data, signOut } = useHub();

const label = computed(() => meName(data.value.me) || "Account");

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
      class="btn sm max-w-[7.5rem] sm:max-w-[12rem]"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      <span class="truncate">{{ label }}</span>
      <AppIcon name="reveal" class="shrink-0 text-muted" />
    </button>
    <div v-if="open" class="menu" role="menu">
      <p v-if="data.me?.email" class="menu-note mt-0 mb-1 truncate">{{ data.me.email }}</p>
      <NuxtLink class="menu-item" to="/hub/settings" @click="open = false">
        Profile, teams and plans
      </NuxtLink>
      <a class="menu-item" href="/connect">Connect Claude or another assistant</a>
      <a class="menu-item" href="/">How Passalong works</a>
      <div class="menu-rule" />
      <button class="menu-item" type="button" @click="signOut">Sign out</button>
    </div>
  </div>
</template>
