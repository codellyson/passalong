<!--
  Triage: what needs you, one at a time, in the server's order (`GET /v1/needs`, the same read as
  Needs you; no route of its own). `?id=` is the item shown; Previous and Next, or j and k (and the
  up and down arrows) when no field has focus, move through the list.

  A customer request is its conversation with the reply box and the agent's draft (HubConversation,
  as on the request's own page); anything else is its summary, what was said and its thread, with its
  one act on the work's page. Once a reply is sent, or the item leaves the server's list, Next becomes
  the one primary button and takes focus.

  The order is held for the visit: answering drops an item from the server's list, and the count and
  Previous must not shift under the person working through it. New rows join the end.
-->
<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import type { GuideContext, NeedRow, SupportList, ThreadItem } from "~/types/hub";
import { age, toneOf } from "~/utils/projects";

usePage({
  title: "Next · Passalong",
  description: "What needs you, one at a time.",
  noindex: true,
});

/** The other requests folded into a row by needs.ts (`also`); types/hub.ts does not name it yet. */
type Row = NeedRow;

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { api, signedIn, needsQ, markSeen } = useHub();

const order = ref<string[]>([]);
const known = ref(new Map<string, Row>());
watch(
  () => needsQ.data.value?.rows,
  (rows) => {
    if (!rows) return;
    const m = new Map(known.value);
    for (const r of rows as Row[]) {
      if (!m.has(r.id)) order.value.push(r.id);
      m.set(r.id, r);
    }
    known.value = m;
  },
  { immediate: true },
);
const live = computed(() => new Set((needsQ.data.value?.rows ?? []).map((r) => r.id)));

const id = computed(() => String(route.query.id || order.value[0] || ""));
const at = computed(() => order.value.indexOf(id.value));
const item = computed(() => known.value.get(id.value) ?? null);
const customer = computed(() => item.value?.reason === "customer");

const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;

// Showing it is looking at it: its change mark goes, as when it is opened anywhere else.
watch(
  [id, signedIn],
  ([which, inside]) => {
    if (inside && which) void markSeen(which);
  },
  { immediate: true },
);

const threadQ = useQuery({
  queryKey: computed(() => hubKeys.supportThread(id.value)),
  queryFn: async () =>
    (await api<{ thread: ThreadItem[] }>(`/v1/guides/${id.value}/thread`))?.thread ?? [],
  enabled: computed(() => signedIn.value && customer.value),
});
/** Who Send goes to and under what subject: the request's context, as its own page reads it. */
const contextQ = useQuery({
  queryKey: computed(() => hubKeys.context(id.value)),
  queryFn: async () => (await api<GuideContext>(`/v1/guides/${id.value}/context`)) ?? null,
  enabled: computed(() => signedIn.value && customer.value),
});
const { data: support } = useQuery({
  queryKey: hubKeys.support,
  queryFn: async () => (await api<SupportList>("/v1/support")) ?? { requests: [], teams: [] },
  enabled: computed(() => signedIn.value && customer.value),
});
const state = computed(() => support.value?.requests.find((r) => r.id === id.value)?.state);

/** Sent from here, or no longer on the server's list: either way, on to the next. */
const sent = ref("");
const done = computed(
  () => Boolean(item.value) && (sent.value === id.value || !live.value.has(id.value)),
);
const nextBtn = ref<HTMLButtonElement | null>(null);
async function onSent() {
  sent.value = id.value;
  await Promise.all(
    [hubKeys.supportThread(id.value), hubKeys.support, hubKeys.needs].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}
watch(done, (d) => {
  if (d) void nextTick(() => nextBtn.value?.focus());
});

const last = computed(() => at.value === order.value.length - 1);
function go(i: number) {
  const to = order.value[i];
  if (to && to !== id.value) void router.replace({ query: { id: to } });
}

/** j / k and the arrows, never while someone is typing or holding a modifier. */
function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))
    return;
  const step =
    e.key === "j" || e.key === "ArrowDown" ? 1 : e.key === "k" || e.key === "ArrowUp" ? -1 : 0;
  if (!step || at.value < 0) return;
  e.preventDefault();
  go(at.value + step);
}
onMounted(() => {
  tick = setInterval(() => (now.value = Date.now()), 60_000);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  clearInterval(tick);
  document.removeEventListener("keydown", onKey);
});

const GROUP: Record<NeedRow["reason"], string> = {
  customer: "Customer waiting",
  asking: "Agent asking",
  stuck: "Went quiet",
  untaken: "Nobody took it",
  came_back: "Came back to you",
};
const VERB: Record<NeedRow["reason"], string> = {
  customer: "Reply",
  asking: "Answer",
  stuck: "Open",
  untaken: "Open",
  came_back: "Open",
};
/** What was said: the agent's question, or why it came back. */
const SAID: Partial<Record<NeedRow["reason"], string>> = {
  asking: "The question",
  came_back: "Why it came back",
};
</script>

<template>
  <HubShell>
    <div class="flex flex-col gap-6">
      <header class="sticky top-14 z-20 m-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-bg py-3 md:top-0">
        <NuxtLink to="/hub" class="inline-flex items-center gap-1 font-ui text-sm text-muted no-underline hover:text-fg"><AppIcon name="back" :size="14" />Back to Needs you</NuxtLink>
        <div v-if="order.length" class="flex flex-wrap items-center gap-2">
          <span v-if="done" class="font-ui text-sm font-medium text-fg" role="status">{{ sent === id ? "Sent" : "Off your list" }}</span>
          <span class="font-ui text-sm text-muted tabular-nums">{{ at + 1 }} of {{ order.length }}</span>
          <button type="button" class="btn sm" :disabled="at <= 0" aria-keyshortcuts="k" @click="go(at - 1)">Previous <kbd aria-hidden="true" class="rounded-1 border border-current/40 px-1 font-ui text-xs leading-4 opacity-70 max-md:hidden">k</kbd></button>
          <NuxtLink v-if="done && last" to="/hub" class="btn sm primary">Back to Needs you</NuxtLink>
          <button
            v-else
            ref="nextBtn"
            type="button"
            class="btn sm"
            :class="done ? 'primary' : ''"
            :disabled="last"
            aria-keyshortcuts="j"
            @click="go(at + 1)"
          >
            Next <kbd aria-hidden="true" class="rounded-1 border border-current/40 px-1 font-ui text-xs leading-4 opacity-70 max-md:hidden">j</kbd>
          </button>
        </div>
      </header>

      <HubSkeleton v-if="needsQ.isPending.value" variant="lines" :rows="6" label="Loading what needs you" />

      <div
        v-else-if="needsQ.isError.value && !order.length"
        role="alert"
        class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3"
      >
        <div class="min-w-0 grow basis-64">
          <p class="m-0 font-ui text-sm font-semibold text-danger">This list didn't load</p>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ needsQ.error.value?.message }}</p>
        </div>
        <button class="btn outline danger sm" type="button" @click="needsQ.refetch()">Try again</button>
      </div>

      <div v-else-if="!order.length" class="flex flex-col gap-4 border-t border-fg py-10">
        <p class="m-0 text-h3 font-medium">Nothing needs you.</p>
        <p class="m-0 font-ui text-sm text-muted">When something does, it is here, one at a time.</p>
      </div>

      <div v-else-if="!item" class="flex flex-col gap-4 border-t border-fg py-10">
        <p class="m-0 text-h3 font-medium">This isn't waiting on you.</p>
        <p class="m-0 font-ui text-sm text-muted">
          Someone may have answered it already.
          <NuxtLink :to="{ query: { id: order[0] } }">Start from the first</NuxtLink>
        </p>
      </div>

      <article v-else :key="item.id" class="flex flex-col gap-6">
        <div class="flex flex-col gap-2">
          <h1 class="m-0 text-h2 font-medium tracking-tight break-words">{{ item.title }}</h1>
          <p class="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-ui text-sm text-muted">
            <span class="font-medium text-fg">{{ GROUP[item.reason] }}</span>
            <span aria-hidden="true">·</span>
            <span class="tabular-nums">{{ age(item.since, now) }}</span>
            <template v-if="item.with">
              <span aria-hidden="true">·</span>
              <span class="break-words">{{ item.with }}</span>
            </template>
            <span aria-hidden="true">·</span>
            <span class="inline-flex min-w-0 items-baseline gap-2">
              <template v-if="item.project">
                <span class="project-mark h-3.5 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf(item.project)" aria-hidden="true" />
                <span class="break-words">{{ item.project.title }}</span>
              </template>
              <template v-else>Not in a project</template>
            </span>
          </p>
          <p v-if="item.also?.length" class="m-0 flex flex-wrap items-baseline gap-x-2 font-ui text-sm text-muted">
            {{ item.with }} asked this {{ item.also.length + 1 }} times. The others:
            <NuxtLink v-for="(other, i) in item.also" :key="other" :to="`/hub/support/${other}`">request {{ i + 2 }}</NuxtLink>
          </p>
          <p class="m-0 font-ui text-sm">
            <NuxtLink :to="customer ? `/hub/support/${item.id}` : `/hub/g/${item.id}`">
              {{ customer ? "Open the request" : "Open the work" }}
            </NuxtLink>
          </p>
        </div>

        <HubConversation
          v-if="customer"
          :key="`c-${item.id}`"
          :guide-id="item.id"
          :thread="threadQ.data.value ?? null"
          :name="contextQ.data.value?.customer?.name || item.with || 'the customer'"
          :address="contextQ.data.value?.customer?.email"
          :subject="contextQ.data.value?.customer?.subject"
          :state="state"
          @sent="onSent"
        />

        <template v-else>
          <p v-if="item.summary" class="m-0 max-w-[65ch] font-ui text-sm leading-relaxed break-words">{{ item.summary }}</p>
          <div v-if="item.said && SAID[item.reason]" class="flex max-w-[40rem] flex-col gap-1">
            <p class="m-0 font-ui text-xs font-medium text-muted">{{ SAID[item.reason] }}</p>
            <p class="m-0 rounded-3 border border-line-strong bg-field px-4 py-3 font-ui text-sm leading-relaxed break-words whitespace-pre-wrap">{{ item.said }}</p>
          </div>
          <NuxtLink :to="`/hub/g/${item.id}`" class="btn self-start" :class="done ? '' : 'primary'">{{ VERB[item.reason] }} on its page</NuxtLink>
          <section aria-label="Thread" class="flex max-w-[48rem] flex-col border-t border-line pt-4">
            <HubThread
              :key="`t-${item.id}`"
              :id="item.id"
              :stamp="`${item.since}${item.changed}`"
              :reply="item.reason === 'asking' || item.reason === 'stuck'"
            />
          </section>
        </template>

      </article>
    </div>
  </HubShell>
</template>
