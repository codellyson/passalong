<!--
  The theme switch, in reach: one button in the header that steps System → Light → Dark → System.

  The footer's AppTheme stays — three labelled links for anyone who wants to see every choice at
  once. This is the same switch for the moment you are in the middle of something and the page is
  too bright: one press, where the page chrome already is, instead of a scroll to the footer.

  Still a link through /theme, not a click handler, so it works on the public pages that run no
  script at all, and the server renders the next page already in the chosen theme — nothing flashes.
  It cycles rather than flipping between two because "System" is the default and a real answer
  (see AppTheme); a two-state switch would have taken it away from whoever chose neither.

  The icon is where you are now, and the label says where a press takes you.
-->
<script setup lang="ts">
const route = useRoute();
// Read on the server and carried to the browser in the payload. The cookie is HttpOnly (the server
// stamps the theme during render, nothing else needs it), so a useCookie read in the browser comes
// back empty: on a hydrated page the button said "system" over a page rendered in light.
const cookie = useCookie<string | undefined>("theme", { readonly: true });
const theme = useState<string | undefined>("theme:choice", () => cookie.value);

type Mode = "" | "light" | "dark";
const now = computed<Mode>(() =>
  theme.value === "light" || theme.value === "dark" ? theme.value : "",
);
const NEXT: Record<Mode, Mode> = { "": "light", light: "dark", dark: "" };
const NAME: Record<Mode, string> = { "": "system", light: "light", dark: "dark" };
const ICON = { "": "system", light: "sun", dark: "moon" } as const;

const next = computed(() => NEXT[now.value]);
const href = computed(() => `/theme?to=${next.value}&back=${encodeURIComponent(route.fullPath)}`);
const label = computed(() => `Appearance: ${NAME[now.value]}. Switch to ${NAME[next.value]}`);
</script>

<template>
  <!-- nofollow, like AppTheme: every page carries one with its own `back`. -->
  <a class="btn icon" :href="href" rel="nofollow" :aria-label="label">
    <AppIcon :name="ICON[now]" />
  </a>
</template>
