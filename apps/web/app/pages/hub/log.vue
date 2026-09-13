<!--
  What you did, under a heading per month.

  The board answers "what needs me now" and the guides page answers "where did everything get to".
  Both are ordered by state, and neither can answer "what did I get done in September" — which is
  the question someone has at the end of a month, in a standup, or when a piece of work has fallen
  far enough out of memory that the only thing they still know about it is roughly when it was.
  Time is the axis nothing else in the product offers, so it is the only ordering here.

  The line under the heading is not a disclaimer to be trimmed later. This list looks exactly like
  a work log and is not one: it holds what you passed along. A month where you shipped without
  sharing renders identically to a month where you did nothing, and the page has to say so or it
  quietly lies about the thing people will use it to check.
-->
<script setup lang="ts">
import type { LogEntry } from "~/types/hub";

usePage({
  title: "Your log · Passalong",
  description: "What you published, pulled and answered, newest first.",
  noindex: true,
});

const { data, loading } = useHub();

/** The one genuinely controlled input on the page, as on the guides page. */
const q = ref("");

/**
 * The two acts that are somebody being told bad news.
 *
 * There is no pill naming the act, because the server's sentence already opens with it — "published
 * …", "pulled …" — at the same left edge on every row, which is the column a pill would have been
 * for. A chip repeating the first word of the line beside it is one fact drawn twice.
 *
 * So the word carries the kind and the stripe carries urgency, which is the division the rest of the
 * hub uses, and it is the same stripe a failing verdict already gets on a guide row.
 */
const STRIPE: Partial<Record<LogEntry["act"], string>> = {
  broken: "border-l-danger",
  passed: "border-l-warn",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
/** "September 2026" from an ISO timestamp. One heading does not need a date library. */
const monthOf = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const visible = computed(() => {
  const terms = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return data.value.log;
  return data.value.log.filter((e) => {
    const hay = [e.title, e.repo, e.note, e.act, e.guide].join("\n").toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
});

/** Grouped in one pass, because the server already sent them newest first. */
const months = computed(() => {
  const out: { month: string; entries: LogEntry[] }[] = [];
  for (const e of visible.value) {
    const month = monthOf(e.at);
    const last = out[out.length - 1];
    if (last?.month === month) last.entries.push(e);
    else out.push({ month, entries: [e] });
  }
  return out;
});
</script>

<template>
  <HubShell heading="Your log">
    <template #sub>What you've sent, opened and answered, newest first.</template>

    <HubSkeleton v-if="loading.log" variant="lines" :rows="6" label="Loading your log" />
    <p v-else-if="!data.log.length" class="empty">
      Nothing yet. Your log fills up as you send guides, open them, and answer them.
      <NuxtLink to="/hub/write">Write your first guide</NuxtLink>
    </p>

    <template v-else>
      <div class="toolbar">
        <input v-model="q" type="search" placeholder="Search your log" aria-label="Search your log" />
      </div>

      <p v-if="!visible.length" class="empty">Nothing in your log matches.</p>

      <template v-else>
        <section v-for="m in months" :key="m.month" class="mt-8 first:mt-0">
          <!-- No count beside the month. "7 in September, 2 in August" is a productivity metric,
               and the moment this page carries one it is the dashboard the PRD rules out — worse,
               a metric of the wrong thing, since it counts sharing rather than work. -->
          <h2
            class="m-0 mb-3 border-b border-line pb-2 font-ui text-xs font-semibold uppercase tracking-widest text-muted"
          >
            {{ m.month }}
          </h2>

          <!-- Every row has the same anatomy: when, what happened, where it came from. Every row
               also carries the stripe, transparent unless the act was bad news, so a coloured one
               is a difference in the row rather than a difference in where the row starts. -->
          <ul class="m-0 list-none p-0">
            <li
              v-for="e in m.entries"
              :key="`${e.act}-${e.guide}-${e.at}`"
              class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-l-2 border-line border-b-line py-3 pl-3 last:border-b-0"
              :class="STRIPE[e.act] ?? 'border-l-transparent'"
            >
              <time
                class="w-20 shrink-0 font-ui text-xs text-muted tabular-nums"
                :datetime="e.at"
                :title="new Date(e.at).toLocaleString()"
              >{{ new Date(e.at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) }}</time>
              <!-- The sentence is the link, styled as the sentence it is. Underlining it renders
                   twelve rows of rule and, worse, claims a verdict's reason is a link as well. -->
              <a
                class="min-w-0 grow basis-64 font-ui text-sm text-fg no-underline hover:text-accent"
                :href="e.url"
                target="_blank"
                rel="noopener"
              >{{ e.text }}</a>
              <AppShorten v-if="e.repo" :value="e.repo" class="font-ui text-xs text-muted" />
            </li>
          </ul>
        </section>

        <p class="mt-8 font-ui text-sm text-muted">
          Showing {{ visible.length }} of {{ data.log.length }}.
          <b class="text-fg">This is what you sent and answered, not everything you worked on.</b>
          Work that never became a guide has no line here, so a quiet month is not necessarily a
          quiet month.
        </p>
      </template>
    </template>
  </HubShell>
</template>
