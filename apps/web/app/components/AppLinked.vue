<!--
  Text a person wrote, with the URLs in it made links. Progress notes, replies and summaries are
  plain text, so a pull request or a failed run named in one could be read and not followed.
  Same rule as a hand-in's evidence (linkParts in utils/evidence.ts), and like it, only http(s).

  Two kinds of link say what they are (utils/link-kind.ts, from the URL alone): a piece of work
  shows its card on hover, and a GitHub pull request, issue, commit or run reads as GitHub does,
  `repo #2800`, beside GitHub's mark. Nothing is fetched from GitHub: the URL is all there is, which
  is why a private repo's link reads as well as a public one, and why there is no title or state.
-->
<script setup lang="ts">
const props = defineProps<{ text: string }>();
const here = useRequestURL().host;
const parts = computed(() =>
  linkParts(props.text).map((p) => ({ ...p, as: p.url ? linkKind(p.url, here) : null })),
);
</script>

<template><template v-for="(part, k) in parts" :key="k"><HubLinkCard
  v-if="part.url && part.as?.kind === 'work'"
  :id="part.as.id"
  :href="part.url"
  :shared="part.as.shared"
  :text="part.text"
/><a
  v-else-if="part.url && part.as?.kind === 'github'"
  :href="part.url"
  target="_blank"
  rel="noopener nofollow"
  class="inline-flex max-w-full items-baseline gap-1 rounded-1 bg-field px-1 font-ui no-underline shadow-edge hover:underline"
  :aria-label="`${part.as.what} ${part.as.ref} in ${part.as.repo} on GitHub`"
><AppMark name="github" :size="12" class="shrink-0 self-center" /><span class="min-w-0 break-all">{{ part.as.ref ? `${part.as.repo.split("/")[1]} ${part.as.ref}` : part.as.repo }}</span></a><a
  v-else-if="part.url"
  :href="part.url"
  target="_blank"
  rel="noopener nofollow"
>{{ part.text }}</a><template v-else>{{ part.text }}</template></template></template>
