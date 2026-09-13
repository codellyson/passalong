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

const { data, api, signedIn } = useHub();

/**
 * The hub loads whichever team is picked, so a guide sent to you in another team may not be in
 * memory. It is looked for once across everything before the page says it is gone. Not through
 * `GET /v1/guides/:id`: that returns the markdown and counts as opening it.
 */
const extra = ref<Guide[]>([]);
const looked = ref(false);
const pool = computed(() => [
  ...data.value.guides,
  ...(data.value.board?.waiting ?? []),
  ...extra.value,
]);
const g = computed(() => pool.value.find((x) => x.id === id.value) || null);

watch(
  [signedIn, g],
  async ([yes, found]) => {
    if (!yes || found || looked.value) return;
    try {
      const all = await api<{ guides: Guide[] }>("/v1/guides?scope=all");
      extra.value = all?.guides ?? [];
    } catch {
      // Falls through to "isn't available", which is what the person can act on.
    } finally {
      looked.value = true;
    }
  },
  { immediate: true },
);

const me = computed(() => data.value.me?.handle || null);
const state = computed(() =>
  g.value ? stateOf(g.value, boardStates(data.value.board), me.value) : null,
);
const status = computed(() => (g.value ? statusLine({ g: g.value, state: state.value }) : null));
const sender = computed(() => (g.value ? fromName(g.value) : "") || "the sender");
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
        <div v-else class="rounded-3 border border-line bg-raised p-4">
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

      <div v-else-if="looked" class="rounded-3 border border-line bg-raised p-5">
        <h1 class="mt-0 mb-2 text-h2">This guide isn't available to you</h1>
        <p class="m-0 font-ui text-sm text-muted">
          It may have been deleted, or sent to a team you're not in. If {{ sender }} sent it to you,
          ask them to check who it went to.
        </p>
        <NuxtLink to="/hub" class="btn mt-4">Go to your guides</NuxtLink>
      </div>

      <p v-else class="font-ui text-sm text-muted">Finding the guide…</p>
    </div>
  </HubShell>
</template>
