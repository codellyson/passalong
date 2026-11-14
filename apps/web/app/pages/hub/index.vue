<!--
  Needs you: the hub's first screen. What waits on the signed-in person, ranked by the server
  (`GET /v1/needs`, apps/api/src/needs.ts) — an agent's question, work sent to you that nobody took,
  an agent gone quiet, your work that came back — and beside it what was finished lately, each with
  Reopen.

  It decides: the server's first row leads as Next, with Start opening the rest one at a time
  (/hub/next). The rest is grouped by reason in the server's order, the oldest three of each shown.

  An ink bar at a row's left edge, with a line naming what changed, says changed since you last
  looked (coral is the hub's active state). It stays until the work is opened (`markSeen`).
-->
<script setup lang="ts">
import type { NeedRow, Needs } from "~/types/hub";
import { age, toneOf } from "~/utils/projects";

// Inline: definePageMeta is lifted out of this script and cannot see its variables.
definePageMeta({
  middleware: async (to) => {
    // Someone with no team who never touched setup sets up before Needs you renders, so the
    // register never flashes on the way (pages/hub/start.vue). On a first load the server asks,
    // with the session cookie the request carried, and answers with a redirect; a redirect made
    // while the client hydrates left a blank page. Moving here inside the app, the client asks, and
    // the answer is cached as the shell's own `me`.
    type MeLike = Parameters<typeof needsSetup>[0];
    const app = useNuxtApp();
    let me: MeLike = null;
    if (import.meta.server) {
      me = await useRequestFetch()<MeLike>("/v1/me").catch(() => null);
    } else if (!app.isHydrating) {
      const hub = useHub();
      hub.adoptToken();
      me = await app.$queryClient
        .fetchQuery({
          queryKey: hubKeys.me,
          queryFn: () => hub.api<MeLike>("/v1/me"),
          staleTime: 30_000,
        })
        .catch(() => null);
    }
    if (needsSetup(me)) return navigateTo("/hub/start", { replace: true });
  },
});

usePage({
  title: "Needs you · Passalong",
  description: "What waits on you, ranked: questions from agents, work nobody took.",
  noindex: true,
});

const { data, needsQ, onReopen, refresh } = useHub();
const noTeam = computed(() => Boolean(data.value.me) && !data.value.me?.teams.length);
const needs = computed<Needs | null>(() => needsQ.data.value ?? null);
const rows = computed(() => needs.value?.rows ?? []);
const lead = computed<NeedRow | undefined>(() => rows.value[0]);
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick = setInterval(() => (now.value = Date.now()), 60_000);
});
onBeforeUnmount(() => clearInterval(tick));

const changedCount = computed(
  () =>
    rows.value.filter((r) => r.changed).length +
    (needs.value?.closed ?? []).filter((c) => c.changed).length,
);
/** Each thing said once. */
const summary = computed(() => {
  const n = rows.value.length;
  const parts: string[] = [];
  if (n) parts.push(`${n} waiting on you`);
  if (changedCount.value) parts.push(`${changedCount.value} changed since you last looked`);
  return parts.join(" · ");
});

/**
 * Each reason's one act, done where the row is (2026-11-10): an agent asking gets Reply, opened in
 * place; work sent to you that nobody took gets I'll do this, which takes it and opens it. A hold
 * gone quiet and work that came back need reading first, so they open the work.
 */
const VERB: Record<NeedRow["reason"], string> = {
  asking: "Reply",
  stuck: "Open",
  untaken: "I'll do this",
  came_back: "Open",
};
const { onPersonTaskTake } = useHub();
const replying = ref("");
const taking = ref("");
async function take(id: string) {
  taking.value = id;
  const ok = await onPersonTaskTake(id);
  taking.value = "";
  if (ok) await navigateTo(href({ id }));
}
const plainWords = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** The line under a title: what was said, or the summary unless it only restates the title. */
function secondLine(r: NeedRow): string {
  if (r.said) return r.said;
  const s = plainWords(r.summary);
  const t = plainWords(r.title);
  return !s || s.includes(t) || t.includes(s) ? "" : r.summary;
}
const href = (r: { id: string }) => `/hub/w/${r.id}`;
const withWho = (r: NeedRow) => r.with || "Nobody";

/** The groups, in the server's order of reasons; inside each, the server's rank (oldest first). */
const GROUP: Record<NeedRow["reason"], string> = {
  asking: "Agents asking",
  stuck: "Went quiet",
  untaken: "Nobody took it",
  came_back: "Came back to you",
};
const SHOWN = 3;
const groups = computed(() => {
  const by = new Map<NeedRow["reason"], NeedRow[]>();
  for (const r of rows.value.slice(1)) by.set(r.reason, [...(by.get(r.reason) ?? []), r]);
  return [...by].map(([reason, list]) => ({ reason, list }));
});
/**
 * The rail beside the register (2026-11-11): one card per reason below Next, each saying how many
 * wait and carrying the act for the oldest of them, so what to do now is read without the rows.
 */
const RAIL: Record<NeedRow["reason"], (n: number) => string> = {
  asking: (n) =>
    n === 1
      ? "An agent is waiting on your answer."
      : `${n} agents are waiting on your answer. The oldest:`,
  stuck: (n) => (n === 1 ? "An agent went quiet on this." : `${n} agents went quiet. The longest:`),
  untaken: (n) =>
    n === 1
      ? "Sent to you, and nobody took it."
      : `${n} were sent to you and nobody took them. The oldest:`,
  came_back: (n) => (n === 1 ? "This came back to you." : `${n} came back to you. The oldest:`),
};
const opened = ref(new Set<string>());
function toggle(reason: string) {
  const next = new Set(opened.value);
  if (!next.delete(reason)) next.add(reason);
  opened.value = next;
}

const reopening = ref("");
const reopenBusy = ref(false);
async function sendReopen(id: string, form: HTMLFormElement) {
  const why = field(form, "why").trim();
  if (!why) return;
  reopenBusy.value = true;
  const ok = await onReopen(id, why);
  reopenBusy.value = false;
  if (ok) {
    reopening.value = "";
    await refresh(hubKeys.needs);
  }
}

const label = "font-ui text-[0.6875rem] font-medium tracking-wider text-muted uppercase";
/** The register's columns, stated once and shared by its header and every row. */
const cols = "@2xl:grid-cols-[minmax(0,1fr)_8.5rem_8rem_3.5rem_6.5rem]";
/** A row's act, in the last column; on a phone the whole row opens the work instead. */
const actCls =
  "btn sm order-1 shrink-0 @max-md:hidden @2xl:order-none @2xl:col-start-5 @2xl:row-start-1 @2xl:justify-self-end";
</script>

<template>
  <HubShell>
    <div class="grid items-start gap-x-10 gap-y-12 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <section aria-labelledby="needs-h" class="@container min-w-0">
        <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-4">
          <div class="min-w-0">
            <h1 id="needs-h" class="m-0 text-h2 font-medium tracking-tight">Needs you</h1>
            <p v-if="needs && summary" class="m-0 mt-1 font-ui text-sm text-muted">{{ summary }}</p>
          </div>
        </div>

        <HubNameNote />
        <HubRepoQuestions />
        <HubSetupNote />

        <HubSkeleton v-if="needsQ.isPending.value" :rows="6" label="Loading what needs you" />

        <div
          v-else-if="needsQ.isError.value && !needs"
          role="alert"
          class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3"
        >
          <div class="min-w-0 grow basis-64">
            <p class="m-0 font-ui text-sm font-semibold text-danger">This list didn't load</p>
            <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ needsQ.error.value?.message }}</p>
          </div>
          <button class="btn outline danger sm" type="button" @click="needsQ.refetch()">Try again</button>
        </div>

        <div v-else-if="!rows.length" class="flex flex-col gap-4 border-t border-line-strong py-10">
          <p class="m-0 text-h3 font-medium">Nothing needs you.</p>
          <p class="m-0 max-w-[36rem] font-ui text-sm text-muted">
            An agent's question, work sent to you that nobody took, an agent that went quiet: each
            lands here, oldest first.
          </p>
          <div v-if="noTeam" class="mt-2 flex flex-col gap-2">
            <p class="m-0 font-ui text-sm text-muted">Someone sent you an invite? Paste it to join their team.</p>
            <HubInvitePaste label="Invite link" />
          </div>
        </div>

        <template v-else>
          <!-- Next: the server's first row, said in full, and the way into the rest one at a time. -->
          <section v-if="lead" aria-labelledby="lead-h" class="relative flex flex-col gap-3 rounded-3 border border-line bg-raised py-4 pr-4 pl-5">
            <span v-if="lead.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
            <h2 id="lead-h" class="m-0 flex flex-wrap items-baseline gap-x-2 text-h3 font-medium tracking-tight break-words">
              <NuxtLink :to="href(lead)" class="text-fg no-underline hover:underline"><AppLinked :text="lead.title" inert /></NuxtLink>
              <!-- A question with options says what it is once, in the line under them. -->
              <span v-if="lead.changed && !lead.choices?.length" class="font-ui text-xs font-medium text-changed">Changed · {{ lead.changed }}</span>
            </h2>
            <p v-if="secondLine(lead)" class="m-0 max-w-[65ch] font-ui text-sm break-words text-fg">
              <AppLinked :text="lead.said ? `“${secondLine(lead)}”` : secondLine(lead)" />
            </p>
            <!-- An agent's question with options: picked right here, nothing to open. -->
            <HubChoices v-if="lead.choices?.length" :id="lead.id" :choices="lead.choices" />
            <p class="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-ui text-xs text-muted">
              <span class="font-medium text-fg">{{ GROUP[lead.reason] }}</span>
              <span aria-hidden="true">·</span>
              <span class="tabular-nums">{{ age(lead.since, now) }}</span>
              <span aria-hidden="true">·</span>
              <span class="break-words">{{ withWho(lead) }}</span>
              <template v-if="lead.project">
                <span aria-hidden="true">·</span>
                <span class="inline-flex min-w-0 items-baseline gap-2">
                  <span class="project-mark h-3 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf(lead.project)" aria-hidden="true" />
                  <span class="break-words">{{ lead.project.title }}</span>
                </span>
              </template>
            </p>
            <!-- Picking is the one thing to do on a question with options: the other ways on are
                 links, not buttons beside four cards. -->
            <p v-if="lead.choices?.length" class="m-0 flex flex-wrap gap-x-2 font-ui text-xs text-muted">
              <NuxtLink :to="href(lead)" class="text-muted">Answer in words</NuxtLink>
              <template v-if="rows.length > 1">
                <span aria-hidden="true">·</span>
                <NuxtLink :to="{ path: '/hub/next', query: { id: lead.id } }" class="text-muted">Go through all {{ rows.length }}</NuxtLink>
              </template>
            </p>
            <div v-else class="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
              <NuxtLink :to="{ path: '/hub/next', query: { id: lead.id } }" class="btn primary">Start</NuxtLink>
              <button
                v-if="lead.reason === 'asking'"
                type="button"
                class="btn"
                :aria-expanded="replying === lead.id"
                @click="replying = replying === lead.id ? '' : lead.id"
              >
                Reply
              </button>
              <button
                v-else-if="lead.reason === 'untaken'"
                type="button"
                class="btn"
                :disabled="taking === lead.id"
                @click="take(lead.id)"
              >
                {{ taking === lead.id ? "Taking…" : VERB.untaken }}
              </button>
              <NuxtLink v-else :to="href(lead)" class="btn">{{ VERB[lead.reason] }}</NuxtLink>
              <span v-if="rows.length > 1" class="font-ui text-xs text-muted">
                Start goes through all {{ rows.length }}, one at a time.
              </span>
            </div>
            <HubNeedReply v-if="replying === lead.id" :id="lead.id" class="max-w-[40rem]" @done="replying = ''" />
          </section>

          <section
            v-for="(g, gi) in groups"
            :key="g.reason"
            :aria-labelledby="`grp-${g.reason}`"
            :class="gi ? 'mt-6' : 'mt-8'"
          >
            <h2 :id="`grp-${g.reason}`" class="m-0 flex items-baseline gap-2 border-b border-line-strong pb-2 font-ui text-sm font-semibold tracking-normal">
              {{ GROUP[g.reason] }}
              <span class="font-normal text-muted tabular-nums">{{ g.list.length }}</span>
            </h2>
            <!-- The column labels, once, under the first group's heading. -->
            <div
              v-if="!gi"
              aria-hidden="true"
              class="hidden gap-x-3 border-b border-line pt-2 pb-2 pl-4 @2xl:grid"
              :class="[cols, label]"
            >
              <span>Work</span><span>Project</span><span>With</span><span class="text-right">Waiting</span><span />
            </div>
            <ol class="m-0 list-none p-0">
              <li
                v-for="r in opened.has(g.reason) ? g.list : g.list.slice(0, SHOWN)"
                :key="r.id"
                class="relative flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line py-3 pl-4 @2xl:grid @2xl:items-baseline"
                :class="cols"
              >
                <span v-if="r.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
                <div class="min-w-0 grow basis-[calc(100%-6rem)] @2xl:basis-auto">
                  <p class="m-0 flex flex-wrap items-baseline gap-x-2 font-ui text-sm">
                    <!-- On a phone the whole row opens it, and its button goes: beside the title it
                         took a third of the width and squeezed the title onto extra lines, to do what
                         the title already did (2026-11-06). The choices sit above the row's link. -->
                    <NuxtLink :to="href(r)" class="font-medium text-fg no-underline hover:underline @max-md:after:absolute @max-md:after:inset-0"><AppLinked :text="r.title" inert /></NuxtLink>
                    <span v-if="r.changed" class="text-xs font-medium text-changed">Changed · {{ r.changed }}</span>
                  </p>
                  <p v-if="secondLine(r)" class="m-0 mt-1 font-ui text-xs break-words text-muted">
                    <AppLinked :text="r.said ? `“${secondLine(r)}”` : secondLine(r)" />
                  </p>
                  <HubChoices
                    v-if="r.choices?.length && r !== lead"
                    :id="r.id"
                    :choices="r.choices"
                    compact
                    class="relative z-10 mt-2"
                  />
                </div>
                <button
                  v-if="r.reason === 'asking'"
                  type="button"
                  :class="actCls"
                  :aria-expanded="replying === r.id"
                  @click="replying = replying === r.id ? '' : r.id"
                >
                  Reply
                </button>
                <button
                  v-else-if="r.reason === 'untaken'"
                  type="button"
                  :class="actCls"
                  :disabled="taking === r.id"
                  @click="take(r.id)"
                >
                  {{ taking === r.id ? "Taking…" : VERB.untaken }}
                </button>
                <NuxtLink v-else :to="href(r)" :class="actCls">{{ VERB[r.reason] }}</NuxtLink>
                <HubNeedReply
                  v-if="replying === r.id"
                  :id="r.id"
                  class="relative z-10 order-3 basis-full pt-2 @2xl:order-none @2xl:col-span-full"
                  @done="replying = ''"
                />
                <span class="order-2 flex min-w-0 items-baseline gap-2 font-ui text-xs @2xl:order-none @2xl:col-start-2 @2xl:row-start-1 @2xl:text-sm">
                  <template v-if="r.project">
                    <span class="project-mark h-3.5 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf(r.project)" aria-hidden="true" />
                    <span class="min-w-0 break-words">{{ r.project.title }}</span>
                  </template>
                </span>
                <span class="order-2 min-w-0 font-ui text-xs break-words text-muted @max-2xl:-ml-2 @2xl:order-none @2xl:col-start-3 @2xl:row-start-1 @2xl:text-sm @2xl:text-fg">
                  <span class="mr-1 @2xl:hidden" aria-hidden="true">·</span>{{ withWho(r) }}
                </span>
                <span class="order-2 font-ui text-xs text-muted tabular-nums @max-2xl:-ml-2 @2xl:order-none @2xl:col-start-4 @2xl:row-start-1 @2xl:text-right @2xl:text-sm @2xl:text-fg">
                  <span class="mr-1 @2xl:hidden" aria-hidden="true">·</span>{{ age(r.since, now) }}
                </span>
              </li>
            </ol>
            <button
              v-if="g.list.length > SHOWN"
              type="button"
              class="linkish mt-2 font-ui text-xs text-muted"
              :aria-expanded="opened.has(g.reason)"
              @click="toggle(g.reason)"
            >
              {{ opened.has(g.reason) ? "Show fewer" : `Show all ${g.list.length}` }}
            </button>
          </section>
        </template>
      </section>

      <aside class="flex min-w-0 flex-col gap-6" aria-label="Next steps and closed work">
        <section v-if="groups.length" aria-labelledby="rail-h" class="hidden flex-col gap-3 xl:flex">
          <h2 id="rail-h" class="m-0 border-b border-line-strong pb-2 font-ui text-sm font-semibold tracking-normal">Next steps</h2>
          <article
            v-for="g in groups"
            :key="g.reason"
            class="relative flex flex-col gap-2 rounded-3 border border-line bg-raised py-3 pr-4 pl-5"
          >
            <span v-if="g.list[0]!.changed" class="absolute inset-y-0 left-0 w-[3px] rounded-l-3 bg-changed" aria-hidden="true" />
            <p :class="label" class="m-0 flex items-baseline gap-2">
              {{ GROUP[g.reason] }}
              <span class="tabular-nums">{{ g.list.length }}</span>
            </p>
            <p class="m-0 font-ui text-sm text-fg">{{ RAIL[g.reason](g.list.length) }}</p>
            <NuxtLink :to="href(g.list[0]!)" class="font-ui text-sm font-medium break-words text-fg no-underline hover:underline">
              <AppLinked :text="g.list[0]!.title" inert />
            </NuxtLink>
            <p v-if="g.list[0]!.said" class="m-0 font-ui text-xs break-words text-muted">“<AppLinked :text="g.list[0]!.said" />”</p>
            <p class="m-0 font-ui text-xs text-muted">
              <span class="tabular-nums">{{ age(g.list[0]!.since, now) }}</span> · {{ withWho(g.list[0]!) }}
            </p>
            <HubChoices v-if="g.list[0]!.choices?.length" :id="g.list[0]!.id" :choices="g.list[0]!.choices!" compact />
            <template v-else>
              <div class="flex flex-wrap gap-2 pt-1">
                <button
                  v-if="g.reason === 'asking'"
                  type="button"
                  class="btn sm"
                  :aria-expanded="replying === `rail:${g.list[0]!.id}`"
                  @click="replying = replying === `rail:${g.list[0]!.id}` ? '' : `rail:${g.list[0]!.id}`"
                >
                  Reply
                </button>
                <button
                  v-else-if="g.reason === 'untaken'"
                  type="button"
                  class="btn sm"
                  :disabled="taking === g.list[0]!.id"
                  @click="take(g.list[0]!.id)"
                >
                  {{ taking === g.list[0]!.id ? "Taking…" : VERB.untaken }}
                </button>
                <NuxtLink v-else :to="href(g.list[0]!)" class="btn sm">{{ VERB[g.reason] }}</NuxtLink>
              </div>
              <HubNeedReply v-if="replying === `rail:${g.list[0]!.id}`" :id="g.list[0]!.id" @done="replying = ''" />
            </template>
          </article>
        </section>

        <section aria-labelledby="closed-h" class="flex flex-col rounded-3 border border-line bg-raised px-4 pt-3 pb-1">
          <h2 id="closed-h" class="m-0 border-b border-line-strong pb-2 font-ui text-sm font-semibold tracking-normal">Closed by the agent</h2>
          <HubSkeleton v-if="needsQ.isPending.value" variant="lines" :rows="3" label="Loading closed work" class="my-3" />
          <p v-else-if="!needs?.closed.length" class="m-0 py-3 font-ui text-sm text-muted">Nothing was finished this week.</p>
          <ul v-else class="m-0 flex list-none flex-col p-0">
            <li v-for="c in needs.closed" :key="c.id" class="relative flex flex-col gap-1 border-b border-line py-3 pl-3 last:border-b-0">
              <span v-if="c.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
              <span class="flex items-baseline gap-3">
                <NuxtLink :to="`/hub/w/${c.id}`" class="min-w-0 grow font-ui text-sm font-medium break-words text-fg no-underline hover:underline"><AppLinked :text="c.title" inert /></NuxtLink>
                <span class="shrink-0 font-ui text-xs text-muted tabular-nums">{{ age(c.at, now) }}</span>
              </span>
              <!-- One run of text beside the button, so it wraps between words: as separate flex items
                   in the narrow column, a name squeezed beside the button broke a syllable per line
                   (2026-11-14). -->
              <span class="flex items-end gap-2 font-ui text-xs text-muted">
                <span class="min-w-0 grow">
                  <template v-if="c.project">
                    <span class="project-mark mr-2 inline-block h-3 w-[3px] rounded-[1px] align-[-1px]" :data-tone="toneOf(c.project)" aria-hidden="true" />{{ c.project.title }}
                    <span aria-hidden="true">·</span>
                  </template>
                  {{ c.by ? `by ${c.by}` : "Finished" }}
                </span>
                <button
                  type="button"
                  class="btn sm h-7 shrink-0 px-2 text-xs"
                  :aria-expanded="reopening === c.id"
                  @click="reopening = reopening === c.id ? '' : c.id"
                >
                  Reopen
                </button>
              </span>
              <form
                v-if="reopening === c.id"
                class="mt-1 flex gap-2"
                @submit.prevent="sendReopen(c.id, $event.target as HTMLFormElement)"
              >
                <label class="sr-only" :for="`why-${c.id}`">Why reopen it?</label>
                <input :id="`why-${c.id}`" name="why" class="h-8 min-w-0 grow text-sm" placeholder="What's still wrong" required />
                <button class="btn primary sm" type="submit" :disabled="reopenBusy">
                  {{ reopenBusy ? "Reopening…" : "Reopen" }}
                </button>
              </form>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  </HubShell>
</template>
