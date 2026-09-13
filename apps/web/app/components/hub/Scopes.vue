<!--
  Whose guides you are looking at. The hub's guide list is scoped; `/v1/board` is not, so across
  everything the page adds back anything handed to you from outside your teams.

  Making a team is not here. It lives on settings, next to the list of the teams you are in, where
  the thing being added is in view.
-->
<script setup lang="ts">
const { data, scope } = useHub();
const teams = computed(() => data.value.me?.teams || []);
</script>

<template>
  <!-- Nothing to say when there is one scope: an empty chip row in the masthead reads as something
       that failed to load. -->
  <div v-if="teams.length" class="chips scopes">
    <button :class="['chip', { on: scope === 'all' }]" @click="scope = 'all'">everything</button>
    <button :class="['chip', { on: scope === 'mine' }]" @click="scope = 'mine'">mine</button>
    <!-- The slug, not the name you typed. The slug is what the server disambiguated it to, what
         `--to` takes, and what every row prints — a chip reading "kreative-korna" that filters to
         guides labelled "kreative-korna-3" is a different string for the same thing. In the code
         face for the same reason: it is an identifier, not a label. -->
    <button
      v-for="t in teams"
      :key="t.slug"
      :class="['chip', 'font-code', { on: scope === t.slug }]"
      @click="scope = t.slug"
    >
      {{ t.slug }}
    </button>
  </div>
</template>
