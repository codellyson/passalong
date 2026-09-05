<!--
  What happened while you were away. The server renders each line so the hub, the CLI and an agent
  all report the same sentence.
-->
<script setup lang="ts">
const { data, readAll } = useHub();

const activity = computed(() => data.value.activity);
const recent = computed(() => activity.value.slice(0, 12));

/** A note names a guide by id; the link is whatever that guide's share URL turned out to be. */
const urlFor = (id: string | null) =>
  id ? data.value.guides.find((g) => g.id === id)?.url : undefined;
</script>

<template>
  <section v-if="activity.length" class="activity">
    <div class="head">
      <h2>{{ data.unread ? `Activity · ${data.unread} new` : "Activity" }}</h2>
      <button v-if="data.unread" class="btn" @click="readAll">mark all read</button>
    </div>
    <ul class="notes">
      <li v-for="n in recent" :key="n.id" :class="['note', { unread: !n.read }]">
        <span class="when">{{ rel(n.at) }}</span>
        <a v-if="urlFor(n.guide)" :href="urlFor(n.guide)" target="_blank" rel="noopener">
          {{ n.text }}
        </a>
        <span v-else>{{ n.text }}</span>
      </li>
    </ul>
  </section>
</template>
