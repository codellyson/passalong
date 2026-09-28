<!--
  The theme switch: three links, one of them marked as where you are.

  Links rather than a control, because the pages that carry this run no script and never will —
  and because three states need three things to press. "System" is the default and a real answer,
  so a switch that only flips between light and dark has quietly taken it away from whoever chose
  neither.

  The round trip is a redirect. It costs a navigation, which is the price of a switch that works on
  a page with no JavaScript on it, and it buys something the scripted version cannot have: the
  server knows the answer before it renders, so nothing ever flashes the wrong theme.
-->
<script setup lang="ts">
const route = useRoute();
const theme = useCookie<string | undefined>("theme", { readonly: true });

/** Where to come back to. Always a path, never an origin — see server/routes/theme.get.ts. */
const back = computed(() => encodeURIComponent(route.fullPath));
const now = computed(() => (theme.value === "light" || theme.value === "dark" ? theme.value : ""));

const modes = [
  { to: "", label: "System" },
  { to: "light", label: "Light" },
  { to: "dark", label: "Dark" },
];
</script>

<template>
  <div class="theme-pick">
    <p class="modes">
      <template v-for="m in modes" :key="m.to">
        <span v-if="now === m.to" class="here" aria-current="true">{{ m.label }}</span>
        <!-- nofollow: every page links here three times with its own `back`, which is an endless
             supply of redirect URLs to a crawler. robots.txt disallows /theme as well. -->
        <a v-else :href="`/theme?to=${m.to}&back=${back}`" rel="nofollow">{{ m.label }}</a>
      </template>
    </p>
  </div>
</template>
