<!--
  One guide in the list, in the same language as the board: a stripe, a badge for the state, one
  action, and everything else behind the overflow.

  Three lines, and the order is the point. What state it is in and who it is with; what it is;
  then the identifiers — id, repo, what it assumes, tags — which are what you need once you have
  already decided this is the row you wanted. The old row ran all eleven facts together in one
  grey paragraph and gave eight actions equal weight.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";
import type { GuideState } from "~/utils/guide-state";

const props = defineProps<{ g: Guide; state: GuideState | null }>();

const judging = ref(false);

const pull = computed(() => `passalong pull ${props.g.id}`);

/** The tail of the first line: the one fact that explains the badge. */
const tail = computed(() => {
  const g = props.g;
  switch (props.state?.key) {
    case "waiting":
    case "flight":
      return "not pulled yet";
    case "unjudged":
      return "nobody has said whether it worked";
    case undefined:
      return g.mine && !g.team ? "addressed to nobody" : "";
    default:
      // Not when the tail below names who pulled it: "1 pull" and "pulled by @someone" are one
      // fact, and the row was saying it twice.
      return g.pulls && !pulledBy.value ? plural(g.pulls, "pull") : "";
  }
});

/** Who has taken it, for the person who handed it over. Nobody else is shown the list. */
const pulledBy = computed(() =>
  props.g.mine && props.g.pulled_by?.length
    ? props.g.pulled_by.map((p) => (p.handle ? `@${p.handle}` : "link")).join(", ")
    : null,
);

/**
 * Three tags, then a count you can open.
 *
 * A guide can carry six, and six pills under a title is the row reading as a wall rather than as a
 * line. Three is enough to recognise a subject; the count says the others exist so nothing looks
 * lost, and pressing it says what they are — it used to hide them in a `title` tooltip, which is
 * delayed, unstyled and unreachable on a phone.
 */
const allTags = computed(() => props.g.tags || []);
const shownTags = computed(() => (showTags.value ? allTags.value : allTags.value.slice(0, 3)));
const moreTags = computed(() => Math.max(0, allTags.value.length - 3));
const showTags = ref(false);
// A row rebound to a different guide must not keep the last one's tags open.
watch(allTags, () => {
  showTags.value = false;
});

/** Printed in full on the row. It is the most valuable thing the product produces. */
const verdict = computed(() => {
  const v = props.g.verdict;
  if (!v || v.ok) return null;
  const who = v.by ? `@${v.by}` : "someone";
  return `${who}: ${v.note || "no reason given"}`;
});
</script>

<template>
  <!-- Two things about the edges. The corner radius is the list's minus its border, because the
       row sits a pixel inside it — matching them exactly leaves the fill short of the border on
       the curve. And the separator between rows is an inset shadow rather than a top border: a
       1px border mitres against the 3px stripe, taking a diagonal bite out of the left edge at
       every row boundary. A shadow starts inside the border box, so the stripe runs unbroken. -->
  <li
    class="m-0 flex flex-wrap items-start gap-x-4 gap-y-2 border-l-[3px] border-t-0 border-r-0 border-b-0 shadow-[inset_0_1px_0_var(--line)] first:shadow-none bg-raised px-4 py-4 first:rounded-t-[calc(var(--r-3)-1px)] last:rounded-b-[calc(var(--r-3)-1px)]"
    :class="state?.stripe ?? 'border-l-line'"
  >
    <div class="min-w-0 flex-1 basis-72">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 font-ui text-sm text-muted">
        <!-- No badge when nothing is in transit: a guide shared with nobody, or closed out. -->
        <span
          v-if="state"
          class="rounded-pill px-2 py-0.5 text-xs font-semibold tracking-wide uppercase"
          :class="state.badge"
        >{{ state.label }}</span>
        <!-- A bug carries how badly it is broken; a transfer guide has nothing to say here. It
             sits with the other pill rather than in front of the title, because a fact only some
             rows have must not decide where every row's title starts. Named rather than coded:
             next to "waiting on you", an `s3` was the only thing on the line you had to already
             know to read. -->
        <span
          v-if="g.severity"
          class="rounded-pill px-2 py-0.5 text-xs font-semibold tracking-wide uppercase"
          :class="severityTone(g.severity)"
        >{{ severityLabel(g.severity) }}</span>
        <!-- Three cases, not two. A guide of yours that went to a team says where it went; one
             handed to you says who from; and one you shared with nobody says neither, because the
             tail after the date already says "addressed to nobody". Collapsing the third into the
             second printed "from @?" on your own guides. -->
        <span v-if="g.mine && g.team">to <b class="font-medium text-fg">{{ g.team }}{{ g.to ? ` / @${g.to}` : "" }}</b></span>
        <span v-else-if="!g.mine">
          from <b class="font-medium text-fg">@{{ g.from || "?" }}</b>
          <template v-if="g.team"> in {{ g.team }}</template>
        </span>
        <span>{{ rel(g.created) }}</span>
        <span v-if="g.stale" class="font-medium text-warn">· over a week</span>
        <span v-if="tail">· {{ tail }}</span>
      </div>

      <!-- Nothing precedes the title. Every row in this list has the same anatomy, so the titles
           share one left edge and the list scans as a column. -->
      <a
        :href="g.url"
        target="_blank"
        rel="noopener"
        class="mt-2 block text-base font-semibold leading-snug text-fg no-underline hover:text-accent"
      >{{ g.title || g.id }}</a>

      <p
        v-if="verdict"
        class="mt-2 mb-0 border-l-2 border-l-danger py-0.5 pl-2 font-ui text-sm text-danger"
      >
        {{ verdict }}
      </p>

      <!-- One line, and it is reference rather than triage: what you read once you have already
           decided this is the row you wanted.
           `assumes` used to sit here and is gone. It is the longest thing a guide carries, it
           truncated to "assumes Khaime API /api/v1,…" which tells nobody anything, and it is on
           the guide page in full where a person deciding whether they can follow the steps is
           actually looking. Tags stop at three for the same reason: a row wearing six is a row
           nobody reads, and the rest are one click away.
           What is left is shortened by unit rather than by pixel — see AppShorten. Nothing on this
           line hides its value in a `title` tooltip any more. -->
      <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-code text-xs text-muted">
        <span>{{ g.id }}</span>
        <template v-if="g.source_context">
          <span>·</span>
          <AppShorten :value="g.source_context" />
        </template>
        <template v-if="pulledBy"><span>·</span><span>pulled by {{ pulledBy }}</span></template>
        <!-- The one thing a row cannot say on its own: it was filed with others. -->
        <template v-if="g.report">
          <span>·</span>
          <!-- A link needs no disclosure: the whole title is at the other end of it. It is cut on a
               word boundary all the same, because "Hub polish, round t…" is not a shorter title,
               it is a different one. -->
          <NuxtLink :to="`/hub/report/${g.report}`">
            {{ shorten(g.report_title || "part of a report", 24).text }}
          </NuxtLink>
        </template>
        <span v-for="t in shownTags" :key="t">#{{ t }}</span>
        <button
          v-if="moreTags"
          type="button"
          class="unfold"
          :aria-expanded="showTags"
          @click="showTags = !showTags"
        >{{ showTags ? "fewer" : `+${moreTags}` }}</button>
      </div>
    </div>

    <!-- One slot, five states, and until now five unrelated acts wearing the same button: two of
         them copied something, two navigated, and one asked a question. Reading down the column
         taught the hand nothing, because position and size said "the same control" while the
         label said otherwise.

         So the mark says what kind of act it is, and the colour goes on saying how urgent it is.
         Two sheets means it goes to the clipboard, an arrow leaving a box means you end up
         somewhere else, and a chevron means this row is about to open underneath you — the same
         three marks, in the same order of preference, wherever a row offers an action. -->
    <div class="flex shrink-0 items-center gap-2">
      <button
        v-if="state?.action === 'pull'"
        class="btn primary sm"
        :title="pull"
        @click="copy(pull, $event.currentTarget)"
      >
        <AppIcon name="copy" /><span data-label>copy pull</span>
      </button>
      <!-- Labelled "read the reason" until the reason moved onto the row two lines above it, at
           which point the button led where the eye had just been. It keeps the danger outline:
           the row is still the urgent one, and opening it is still the only move. -->
      <a
        v-else-if="state?.action === 'open-urgent'"
        :href="g.url"
        target="_blank"
        rel="noopener"
        class="btn outline danger sm"
      ><AppIcon name="open" />open</a>
      <button
        v-else-if="state?.action === 'link'"
        class="btn sm"
        @click="copy(g.url, $event.currentTarget)"
      >
        <AppIcon name="copy" /><span data-label>copy link</span>
      </button>
      <!-- "did it work?" was the one control in the column that asked rather than did, and it is
           the only one that opens something in place instead of leaving. Now it says what pressing
           it does — in the same words the row's overflow menu uses for the same act, because two
           labels for one thing is the bug one level down — and the chevron turns over to show the
           form below belongs to it. -->
      <button
        v-else-if="state?.action === 'verdict'"
        class="btn outline warn sm"
        :aria-expanded="judging"
        @click="judging = !judging"
      >
        <AppIcon name="reveal" class="transition-transform" :class="judging ? 'rotate-180' : ''" />
        say whether it worked
      </button>
      <a v-else :href="g.url" target="_blank" rel="noopener" class="btn sm">
        <AppIcon name="open" />open
      </a>

      <HubRowMenu :g="g" @verdict="judging = true" />
    </div>

    <!-- Full width and last, so opening it pushes nothing sideways. -->
    <HubVerdict v-if="judging && !g.mine" :g="g" class="order-last" @done="judging = false" />
  </li>
</template>
