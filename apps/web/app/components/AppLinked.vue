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
</script>

<template><template v-for="(part, k) in parts" :key="k"><template v-if="part.url"><span
  v-if="part.as?.kind === 'forge' && inert"
  class="forge-ref"
><AppMark :name="part.as.site" :size="12" />{{ forgeName(part.as) }}</span><HubUrlCard
  v-else-if="part.as?.kind === 'forge'"
  :href="part.url"
  :what="forgeLabel(part.as)"
  class="forge-ref"
  :aria-label="forgeLabel(part.as)"
><AppMark :name="part.as.site" :size="12" />{{ forgeName(part.as) }}</HubUrlCard><template
  v-else-if="inert"
>{{ shorten(part.url, 40).text }}</template><HubLinkCard
  v-else-if="part.as?.kind === 'work'"
  :id="part.as.id"
  :href="part.url"
  :shared="part.as.shared"
  :text="part.text"
/><HubUrlCard v-else :href="part.url">{{ part.text }}</HubUrlCard></template><HubLinkCard
  v-else-if="part.id && !inert"
  :id="part.id"
  :href="`/hub/w/${part.id}`"
  :shared="false"
  :text="part.text"
  bare
/><template v-else>{{ part.text }}</template></template></template>
