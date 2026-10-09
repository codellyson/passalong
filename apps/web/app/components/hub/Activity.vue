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
const { data, failed, readAll, load } = useHub();

const activity = computed(() => data.value.activity);

/** Every guide the board is currently showing, in either lane. */
const onBoard = computed(() => {
  const b = data.value.board;
  if (!b) return new Set<string>();
  return new Set([...b.waiting, ...b.failing, ...b.in_flight, ...b.landed].map((g) => g.id));
});

/** Folded runs, newest first. A run of one person's eight shares is one entry, not eight lines. */
const news = computed(() =>
  groupNotes(activity.value.filter((n) => !n.guide || !onBoard.value.has(n.guide))),
);
const echoes = computed(() =>
  groupNotes(activity.value.filter((n) => n.guide && onBoard.value.has(n.guide))),
);

/** The latest few show; the rest are one click away. The count says how many, so nothing hides. */
const SHOWN = 6;
const all = ref(false);
const lead = computed(() => (all.value ? news.value : news.value.slice(0, SHOWN)));
const rest = computed(() => news.value.length - lead.value.length);
const folds = computed(() => news.value.length > SHOWN);

/** Which groups are open. */
const opened = ref<Set<string>>(new Set());
const flip = (id: string) => {
  const next = new Set(opened.value);
  next.has(id) ? next.delete(id) : next.add(id);
  opened.value = next;
};

/** A note names a guide by id; the link is whatever that guide's share URL turned out to be. */
const urlFor = (id: string | null) =>
  id ? data.value.guides.find((g) => g.id === id)?.url : undefined;
</script>

<template>
  <section v-if="failed.notifications" class="mb-6 border-t border-line pt-4 font-ui text-sm text-muted">
    Activity could not load. <button type="button" class="linkish" @click="load()">Try again</button>
  </section>
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
        Mark all read
      </button>
    </div>

    <ul v-if="news.length" class="notes">
      <template v-for="e in lead" :key="e.kind === 'group' ? e.id : e.note.id">
        <li v-if="e.kind === 'note'" :class="['note', { unread: !e.note.read }]">
          <span class="when">{{ rel(e.note.at) }}</span>
          <a v-if="urlFor(e.note.guide)" :href="urlFor(e.note.guide)" target="_blank" rel="noopener">
            {{ e.note.text }}
          </a>
          <span v-else>{{ e.note.text }}</span>
        </li>
        <li v-else :class="['note', { unread: !e.read }]">
          <span class="when">{{ rel(e.at) }}</span>
          <button
            type="button"
            class="linkish cursor-pointer text-left"
            :aria-expanded="opened.has(e.id)"
            @click="flip(e.id)"
          >
            {{ e.text }} · {{ opened.has(e.id) ? "hide" : "show" }}
          </button>
          <ul v-if="opened.has(e.id)" class="notes">
            <li v-for="n in e.notes" :key="n.id" :class="['note', { unread: !n.read }]">
              <span class="when">{{ rel(n.at) }}</span>
              <a v-if="urlFor(n.guide)" :href="urlFor(n.guide)" target="_blank" rel="noopener">
                {{ n.title || n.text }}
              </a>
              <span v-else>{{ n.text }}</span>
            </li>
          </ul>
        </li>
      </template>
    </ul>
    <button v-if="folds" type="button" class="linkish mt-2 cursor-pointer font-ui text-sm" @click="all = !all">
      {{ all ? "Show fewer" : `Show ${rest} more` }}
    </button>

    <details v-if="echoes.length" class="mt-2">
      <summary class="cursor-pointer font-ui text-sm text-muted hover:text-fg">
        {{ plural(echoes.length, "more update") }} about guides already in your list
      </summary>
      <ul class="notes">
        <template v-for="e in echoes" :key="e.kind === 'group' ? e.id : e.note.id">
          <li v-if="e.kind === 'note'" :class="['note', { unread: !e.note.read }]">
            <span class="when">{{ rel(e.note.at) }}</span>
            <a v-if="urlFor(e.note.guide)" :href="urlFor(e.note.guide)" target="_blank" rel="noopener">
              {{ e.note.text }}
            </a>
            <span v-else>{{ e.note.text }}</span>
          </li>
          <li v-else :class="['note', { unread: !e.read }]">
            <span class="when">{{ rel(e.at) }}</span>
            <span>{{ e.text }}</span>
          </li>
        </template>
      </ul>
    </details>
  </section>
</template>
