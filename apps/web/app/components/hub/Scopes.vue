<!--
  Whose guides you are looking at. It filters the list and picks which team the settings page
  administers, and it is rendered on those two pages only: the board reads `/v1/board`, which is
  not scoped, so on that page these buttons would have been decoration.
-->
<script setup lang="ts">
defineProps<{ create?: boolean }>();

const { data, scope, createTeam } = useHub();
const teams = computed(() => data.value.me?.teams || []);
</script>

<template>
  <div class="chips scopes">
    <template v-if="teams.length">
      <button :class="['chip', { on: scope === 'all' }]" @click="scope = 'all'">everything</button>
      <button :class="['chip', { on: scope === 'mine' }]" @click="scope = 'mine'">mine</button>
    </template>
    <button
      v-for="t in teams"
      :key="t.slug"
      :class="['chip', { on: scope === t.slug }]"
      @click="scope = t.slug"
    >
      {{ t.name }}
    </button>
    <button v-if="create" class="chip" @click="createTeam">
      {{ teams.length ? "+ team" : "+ start a team" }}
    </button>
  </div>
</template>
