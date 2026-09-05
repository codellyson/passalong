<!--
  A queue line: what it is, who it is with, and the one action that moves it along. The full row
  with every button lives in the list below; up here a card is a thing to act on, not to browse.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";

defineProps<{ g: Guide; action: "pull" | "done" | "promote" | "link" }>();
const { onStatus } = useHub();
</script>

<template>
  <li :class="['card-row', { stale: g.stale }]">
    <a class="card-title" :href="g.url" target="_blank" rel="noopener">{{ g.title || g.id }}</a>
    <span class="meta">
      <span v-if="g.mine">to <b>{{ g.team }}{{ g.to ? ` / @${g.to}` : "" }}</b></span>
      <span v-else>from <b>@{{ g.from || "?" }}</b></span>
      <span>{{ rel(g.created) }}</span>
      <span v-if="g.stale" class="warn">not picked up</span>
      <span v-if="g.failing && g.verdict" class="warn">
        {{ g.verdict.by ? `@${g.verdict.by}` : "someone" }}:
        {{ g.verdict.note || "no reason given" }}
      </span>
      <span v-if="g.pulls">{{ plural(g.pulls, "pull") }}</span>
    </span>

    <button
      v-if="action === 'pull'"
      class="btn"
      :title="`passalong pull ${g.id}`"
      @click="copy(`passalong pull ${g.id}`, $event.target)"
    >
      copy pull
    </button>
    <button v-else-if="action === 'done'" class="btn" @click="onStatus(g, 'consumed')">
      done
    </button>
    <button v-else-if="action === 'promote'" class="btn nudge" @click="onStatus(g, 'promoted')">
      promote
    </button>
    <button v-else class="btn" @click="copy(g.url, $event.target)">copy link</button>
  </li>
</template>
