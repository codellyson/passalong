<!-- The full row: everything known about one guide, and every action available on it. -->
<script setup lang="ts">
import type { Guide } from "~/types/hub";

const props = defineProps<{ g: Guide }>();
const { onStatus, onRemove, onVerdict } = useHub();

const pull = computed(() => `passalong pull ${props.g.id}`);

/** Who has taken it, for the person who handed it over. Nobody else needs the list. */
const pulledBy = computed(() => {
  const g = props.g;
  if (!g.mine || !g.pulled_by?.length) return null;
  return g.pulled_by.map((p) => `${p.handle ? `@${p.handle}` : "link"} ${rel(p.at)}`).join(", ");
});

/** Three pulls is the point where a one-off transfer has become a reference worth keeping. */
const nudge = computed(() => props.g.status === "published" && props.g.pulls >= 3);
</script>

<template>
  <li :class="['guide', g.status]">
    <div class="head">
      <a class="title" :href="g.url" target="_blank" rel="noopener">{{ g.title || g.id }}</a>
      <span :class="['status', g.status]">{{ g.status }}</span>
    </div>

    <div class="meta">
      <span>id <b>{{ g.id }}</b></span>
      <span v-if="g.team">
        {{ g.mine ? "to " : "from " }}
        <b>{{ g.mine ? `${g.team}${g.to ? ` / @${g.to}` : ""}` : `@${g.from || "?"} in ${g.team}` }}</b>
      </span>
      <span v-if="g.source_context">repo <b>{{ g.source_context }}</b></span>
      <span>{{ rel(g.created) }}</span>
      <span>{{ plural(g.pulls, "pull") }}</span>
      <span v-if="pulledBy" class="pulled">pulled by <b>{{ pulledBy }}</b></span>
      <span v-if="g.verdict" :class="g.failing ? 'verdict bad' : 'verdict'">
        {{ g.verdict.ok ? "verified by " : "not working — " }}
        <b>{{ g.verdict.by ? `@${g.verdict.by}` : "someone" }}</b>
        {{ g.verdict.note ? `: ${g.verdict.note}` : "" }}
      </span>
      <span v-if="g.stack_assumptions?.length">
        assumes <b>{{ g.stack_assumptions.join(", ") }}</b>
      </span>
      <span v-for="t in g.tags || []" :key="t" class="tag">#{{ t }}</span>
    </div>

    <div class="actions">
      <a class="btn" :href="g.url" target="_blank" rel="noopener">open</a>
      <button class="btn" :title="pull" @click="copy(pull, $event.target)">copy pull</button>
      <button class="btn" @click="copy(g.url, $event.target)">copy link</button>

      <!-- Two answers, and a failure has to say why. Only the receiver gets to give a verdict. -->
      <template v-if="!g.mine">
        <button class="btn" @click="onVerdict(g, true)">works</button>
        <button class="btn danger" @click="onVerdict(g, false)">doesn't work</button>
      </template>

      <button v-if="g.status !== 'consumed'" class="btn" @click="onStatus(g, 'consumed')">
        done
      </button>
      <button
        v-if="g.mine && g.status !== 'promoted'"
        :class="['btn', { nudge }]"
        @click="onStatus(g, 'promoted')"
      >
        {{ nudge ? "★ promote — keeps getting pulled" : "promote" }}
      </button>
      <button
        v-if="g.mine && (g.status === 'consumed' || g.status === 'promoted')"
        class="btn"
        @click="onStatus(g, 'published')"
      >
        reopen
      </button>
      <button v-if="g.mine" class="btn danger" @click="onRemove(g)">remove</button>
    </div>
  </li>
</template>
