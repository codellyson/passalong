<!--
  What happened while you were away. The server renders each line so the hub, the CLI and an agent
  all report the same sentence.

  Most of what lands here is a second account of something the board is already showing: the
  verdict printed on a row, the pull that put a guide in "worth keeping", the handoff sitting in
  the lane at the top. Those lines are not deleted — they are the audit trail, and a line can be
  the only record of a guide that has since been removed — but they are folded, so what is left
  open is the part the board does not already say.
-->
<script setup lang="ts">
const { data, readAll } = useHub();

const activity = computed(() => data.value.activity);

/** Every guide the board is currently showing, in either lane. */
const onBoard = computed(() => {
  const b = data.value.board;
  if (!b) return new Set<string>();
  return new Set([...b.waiting, ...b.failing, ...b.in_flight, ...b.landed].map((g) => g.id));
});

const news = computed(() =>
  activity.value.filter((n) => !n.guide || !onBoard.value.has(n.guide)).slice(0, 8),
);
const echoes = computed(() => activity.value.filter((n) => n.guide && onBoard.value.has(n.guide)));

/** A note names a guide by id; the link is whatever that guide's share URL turned out to be. */
const urlFor = (id: string | null) =>
  id ? data.value.guides.find((g) => g.id === id)?.url : undefined;
</script>

<template>
  <section v-if="activity.length" class="mb-6 border-t border-line pt-4">
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <h2 class="m-0 font-ui text-xs font-semibold uppercase tracking-widest text-muted">
        Activity<span v-if="data.unread" class="ml-2 text-accent">{{ data.unread }} new</span>
      </h2>
      <button
        v-if="data.unread"
        class="btn sm"
        @click="readAll"
      >
        mark all read
      </button>
    </div>

    <ul v-if="news.length" class="notes">
      <li v-for="n in news" :key="n.id" :class="['note', { unread: !n.read }]">
        <span class="when">{{ rel(n.at) }}</span>
        <a v-if="urlFor(n.guide)" :href="urlFor(n.guide)" target="_blank" rel="noopener">
          {{ n.text }}
        </a>
        <span v-else>{{ n.text }}</span>
      </li>
    </ul>

    <details v-if="echoes.length" class="mt-2">
      <summary class="cursor-pointer font-ui text-sm text-muted hover:text-fg">
        {{ plural(echoes.length, "line") }} about guides already on the board
      </summary>
      <ul class="notes">
        <li v-for="n in echoes" :key="n.id" :class="['note', { unread: !n.read }]">
          <span class="when">{{ rel(n.at) }}</span>
          <a v-if="urlFor(n.guide)" :href="urlFor(n.guide)" target="_blank" rel="noopener">
            {{ n.text }}
          </a>
          <span v-else>{{ n.text }}</span>
        </li>
      </ul>
    </details>
  </section>
</template>
