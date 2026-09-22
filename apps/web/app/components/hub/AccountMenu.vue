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
/** Two letters for the avatar a phone shows instead of the whole name. */
const initials = computed(() => {
  const words = label.value.replace(/^@/, "").split(/\s+/).filter(Boolean);
  // One word — a handle, or an account id — gives one letter from each word, which is one letter.
  const two = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "");
  return two.slice(0, 2).toUpperCase();
});

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
    <!-- On a phone the whole name did not fit and was cut to "@7kef2w…": an avatar there instead,
         with the name read out and shown at the top of the menu. -->
    <button
      type="button"
      class="btn sm max-w-[12rem] max-sm:size-8 max-sm:rounded-pill max-sm:p-0"
      :aria-expanded="open"
      aria-haspopup="menu"
      :aria-label="label"
      @click="open = !open"
    >
      <span class="truncate max-sm:hidden">{{ label }}</span>
      <span class="font-ui text-xs font-semibold sm:hidden" aria-hidden="true">{{ initials }}</span>
      <AppIcon name="reveal" class="shrink-0 text-muted max-sm:hidden" />
    </button>
    <div v-if="open" class="menu" role="menu">
      <p class="menu-note mt-0 mb-1 truncate font-medium text-fg sm:hidden">{{ label }}</p>
      <p v-if="data.me?.email" class="menu-note mt-0 mb-1 truncate">{{ data.me.email }}</p>
      <NuxtLink class="menu-item" to="/hub/settings" @click="open = false">
        Profile, teams and plans
      </NuxtLink>
      <a class="menu-item" href="/connect">Connect Claude or another assistant</a>
      <a class="menu-item" href="/">How Passalong works</a>
      <div class="menu-rule" />
      <!-- The navbar's theme button is hidden on a phone to fit one row; it lives here there. -->
      <div class="sm:hidden">
        <AppThemeToggle row />
        <div class="menu-rule" />
      </div>
      <button class="menu-item" type="button" @click="signOut">Sign out</button>
    </div>
  </div>
</template>
