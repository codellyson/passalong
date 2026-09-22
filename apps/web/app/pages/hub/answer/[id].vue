<!--
  Answering one guide: whether you are taking it, and later how it went.

  This is where the buttons on a shared guide page lead. That page renders markdown a stranger
  wrote and runs no script at all — its CSP names no `script-src`, which is what makes it safe — so
  it cannot hold a form. It links here instead, with what was pressed in `?do=`. This page is inside
  the hub, so a visitor who is not signed in gets the sign-in card in place and lands back on the
  same answer when they are.

  It never records anything on arrival. A GET that took a guide would take it for anyone whose
  browser pre-fetched the link; the answer is always a button pressed on this page.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { Guide } from "~/types/hub";
import { boardStates, stateOf } from "~/utils/guide-state";

usePage({
  title: "Answer a guide · Passalong",
  description: "Tell the sender whether you're taking a guide, and how it went.",
  noindex: true,
});

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const intent = computed(() => (typeof route.query.do === "string" ? route.query.do : ""));

const { data, api, signedIn, loading } = useHub();

/** Already in memory: the list for whichever team is picked, or the board. */
const listed = computed(
  () =>
    [...data.value.guides, ...(data.value.board?.waiting ?? [])].find((x) => x.id === id.value) ||
    null,
);

/**
 * A guide sent to you in another team is not in the picked team's list, so it is looked for
 * across everything — the same cached query the guides page uses for "All teams". Not through
 * `GET /v1/guides/:id`: that returns the markdown and counts as opening it.
 */
const inMemoryDone = computed(() => !loading.value.guides && !loading.value.board);
const everything = useQuery({
  queryKey: hubKeys.guides("all"),
  queryFn: async () => (await api<{ guides: Guide[] }>("/v1/guides?scope=all")) ?? { guides: [] },
  enabled: computed(() => signedIn.value && inMemoryDone.value && !listed.value),
});

const g = computed(
  () => listed.value || everything.data.value?.guides.find((x) => x.id === id.value) || null,
);
const looked = computed(
  () => inMemoryDone.value && (Boolean(listed.value) || everything.isFetched.value),
);

const me = computed(() => data.value.me?.handle || null);
const state = computed(() =>
  g.value ? stateOf(g.value, boardStates(data.value.board), me.value) : null,
);
const status = computed(() => (g.value ? statusLine({ g: g.value, state: state.value }) : null));
const team = computed(() => (g.value ? teamLabel(g.value, data.value.me?.teams) : ""));

/** The one question still open for you on this guide, if any. */
const asks = computed(() => {
  const key = state.value?.key;
  if (!g.value || g.value.mine) return null;
  if (key === "unanswered") return "ack";
  if (key === "waiting" || key === "unjudged") return "verdict";
  return null;
});

const home = () => router.push("/hub");
</script>

<template>
  <HubShell>
    <div class="mx-auto flex max-w-xl flex-col gap-5">
      <template v-if="g">
        <div>
          <p class="m-0 font-ui text-sm text-muted">
            From <b class="font-medium text-fg">{{ fromName(g) || "someone" }}</b>
            <template v-if="team"> in {{ team }}</template> · {{ rel(g.created) }}
          </p>
          <h1 class="mt-1 mb-0 text-h2">{{ g.title || "Untitled guide" }}</h1>
          <a :href="g.url" target="_blank" rel="noopener" class="mt-2 inline-block font-ui text-sm">
            Read the guide
          </a>
        </div>

        <HubAck v-if="asks === 'ack'" :g="g" :why="intent === 'pass'" @done="home" />
        <HubVerdict v-else-if="asks === 'verdict'" :g="g" :why="intent === 'failed'" @done="home" />
        <div v-else class="rounded-3 bg-raised shadow-edge p-4">
          <p class="m-0 font-ui text-sm text-fg">
            <template v-if="g.mine">
              This is your guide. Answers from {{ g.to ? toName(g) : "your team" }} show up on your
              guides page.
            </template>
            <template v-else-if="status?.text">You're all done here: {{ status.text }}.</template>
            <template v-else>There's nothing for you to answer on this guide.</template>
          </p>
        </div>

        <NuxtLink to="/hub" class="font-ui text-sm">Go to your guides</NuxtLink>
      </template>

      <div v-else-if="looked && !everything.isFetching.value" class="rounded-3 bg-raised shadow-edge p-5">
        <h1 class="mt-0 mb-2 text-h2">This guide isn't available to you</h1>
        <p class="m-0 font-ui text-sm text-muted">
          It may have been deleted, or sent to a team you're not in. If someone sent it to you, ask
          them to check who it went to.
        </p>
        <NuxtLink to="/hub" class="btn mt-4">Go to your guides</NuxtLink>
      </div>

      <div v-else class="flex flex-col gap-4" role="status" aria-label="Finding the guide">
        <span class="block h-3 w-40 rounded-pill bg-line" aria-hidden="true" />
        <span class="block h-7 w-4/5 rounded-pill bg-line-strong" aria-hidden="true" />
        <span class="block h-28 rounded-2 bg-raised shadow-edge" aria-hidden="true" />
        <span class="sr-only">Finding the guide…</span>
      </div>
    </div>
  </HubShell>
</template>
