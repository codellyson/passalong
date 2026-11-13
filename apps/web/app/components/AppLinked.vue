<!--
  Text a person wrote, with what it points at made followable: every http(s) URL is a link
  (linkParts in utils/evidence.ts), and a work id written bare (`p64kbrdt`) is a link once the
  work is known to exist.

  Two kinds say what they are (shared/link-kind.ts, from the URL alone): a piece of work says its
  title and shows its card on hover, and a GitHub pull request, issue, commit or run reads as
  GitHub does, `repo #2800`, beside GitHub's mark. Nothing is fetched from GitHub.

  `inert` is for text that is already inside a link — a card's or a row's title. A link cannot
  hold another, so there the same things are drawn without being links: the GitHub chip as a chip,
  any other URL shortened to its host and path, a work id as written.
-->
<script setup lang="ts">
const props = defineProps<{ text?: string | null; inert?: boolean }>();
const here = useRequestURL().host;

/** Words; a URL with what it points at (`as`); or a bare work id. */
type Part = { text: string; url?: string; as?: LinkKind | null; id?: string };

const parts = computed<Part[]>(() =>
  linkParts(props.text ?? "").flatMap((p): Part[] =>
    p.url ? [{ text: p.text, url: p.url, as: linkKind(p.url, here) }] : idParts(p.text),
  ),
);
const ghName = (k: { repo: string; ref: string }) =>
  k.ref ? `${k.repo.split("/")[1]} ${k.ref}` : k.repo;
</script>

<template><template v-for="(part, k) in parts" :key="k"><template v-if="part.url"><span
  v-if="part.as?.kind === 'github' && inert"
  class="gh-ref"
><AppMark name="github" :size="12" />{{ ghName(part.as) }}</span><a
  v-else-if="part.as?.kind === 'github'"
  :href="part.url"
  target="_blank"
  rel="noopener nofollow"
  class="gh-ref"
  :aria-label="`${part.as.what} ${part.as.ref} in ${part.as.repo} on GitHub`"
><AppMark name="github" :size="12" />{{ ghName(part.as) }}</a><template
  v-else-if="inert"
>{{ shorten(part.url, 40).text }}</template><HubLinkCard
  v-else-if="part.as?.kind === 'work'"
  :id="part.as.id"
  :href="part.url"
  :shared="part.as.shared"
  :text="part.text"
/><a
  v-else
  :href="part.url"
  target="_blank"
  rel="noopener nofollow"
>{{ part.text }}</a></template><HubLinkCard
  v-else-if="part.id && !inert"
  :id="part.id"
  :href="`/hub/w/${part.id}`"
  :shared="false"
  :text="part.text"
  bare
/><template v-else>{{ part.text }}</template></template></template>
