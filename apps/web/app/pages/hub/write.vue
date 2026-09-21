<!--
  Writing a guide in the browser — or a follow-up to one.

  Until this existed a guide could only come from `passalong share` or an agent, so anyone without
  a terminal could receive work and never send any. The questions are the guide format's sections
  asked as a person would ask them — what was wrong, what did you do, how would someone else do it,
  how do they know it worked — and the answers become exactly the document the CLI writes.

  `?follows=<id>` makes it a follow-up: more context for a guide, written as a guide of its own and
  linked under the original, so whoever opens the original gets it too. People did not know how to
  write one, because the only way was `passalong share --follows <id>` copied out of a menu, and
  nothing anywhere said what one was for. This page says it in a sentence, names the guide it adds
  to, and sends it to the same people by default: whoever the original went to, or its author when
  the original is someone else's.

  Who it goes to is picked from the team's members by name. A teammate who has never set a handle
  cannot be addressed yet (the server resolves `to:` by handle), so they are listed and explained
  rather than silently missing.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { Guide, TeamDetail } from "~/types/hub";

const route = useRoute();
const router = useRouter();
const follows = computed(() =>
  typeof route.query.follows === "string" ? route.query.follows : "",
);

usePage({
  title: follows.value ? "Write a follow-up · Passalong" : "Write a guide · Passalong",
  description: "Write down finished work so someone else can repeat it.",
  noindex: true,
});

const { data, api, json, refresh, signedIn, loading } = useHub();

const teams = computed(() => data.value.me?.teams ?? []);
const draft = reactive(blankDraft());
/** Minted once per visit, so a retried publish updates the same guide instead of making two. */
const id = newId();

/**
 * The guide this follows. In memory if it is in the current list or the board; otherwise looked
 * for across all teams, through the same cached query the guides page uses.
 */
const listed = computed<Guide | null>(
  () =>
    [...data.value.guides, ...(data.value.board?.waiting ?? [])].find(
      (g) => g.id === follows.value,
    ) || null,
);
const everything = useQuery({
  queryKey: hubKeys.guides("all"),
  queryFn: async () => (await api<{ guides: Guide[] }>("/v1/guides?scope=all")) ?? { guides: [] },
  enabled: computed(
    () =>
      signedIn.value &&
      Boolean(follows.value) &&
      !listed.value &&
      !loading.value.guides &&
      !loading.value.board,
  ),
});
const parent = computed<Guide | null>(
  () => listed.value || everything.data.value?.guides.find((g) => g.id === follows.value) || null,
);
const parentMissing = computed(
  () => Boolean(follows.value) && !parent.value && everything.isFetched.value,
);
const parentAuthor = computed(() => (parent.value ? fromName(parent.value) : ""));

// A different team means a different set of people, so whoever was picked is cleared — except
// while a follow-up is filling both in from the guide it follows.
let seeding = false;
watch(
  () => draft.team,
  () => {
    if (!seeding) draft.to = "";
  },
);

// Once, when the original is known: its team, and back to its author.
const seeded = ref(false);
watch(
  parent,
  async (p) => {
    if (!p || seeded.value) return;
    seeded.value = true;
    const defaults = followUpDefaults(p);
    seeding = true;
    draft.team = defaults.team;
    await nextTick();
    draft.to = defaults.to;
    seeding = false;
  },
  { immediate: true },
);

watch(
  teams,
  (list) => {
    if (!follows.value && !draft.team && list.length === 1) draft.team = list[0]?.slug ?? "";
  },
  { immediate: true },
);

// Shared with Settings, so a team already looked at there is not fetched again. If it fails, the
// picker falls back to "everyone in the team", which still sends the guide.
const { data: teamData, isFetching: loadingMembers } = useQuery({
  queryKey: computed(() => hubKeys.team(draft.team)),
  queryFn: async () =>
    (await api<TeamDetail>(`/v1/teams/${encodeURIComponent(draft.team)}`)) as TeamDetail,
  enabled: computed(() => signedIn.value && Boolean(draft.team)),
});
const members = computed(() =>
  (teamData.value?.members ?? []).filter((m) => m.handle !== data.value.me?.handle),
);

const ready = computed(() =>
  Boolean(draft.title.trim() && draft.problem.trim() && draft.steps.trim()),
);
const busy = ref(false);
const trouble = ref<string | null>(null);

async function send() {
  if (!ready.value || busy.value) return;
  busy.value = true;
  trouble.value = null;
  try {
    const markdown = draftMarkdown(id, draft);
    // `parent` beside the document, which the API writes into its frontmatter. It is only sent
    // for a guide this account can actually read; the server would drop anything else anyway.
    await api(
      `/v1/guides/${id}`,
      json("PUT", parent.value ? { markdown, parent: parent.value.id } : { markdown }),
    );
    await refresh(hubKeys.allGuides, hubKeys.board, hubKeys.log, hubKeys.me);
    router.push("/hub#sent");
  } catch (e) {
    trouble.value = (e as Error).message;
    busy.value = false;
  }
}

const label = "block font-ui text-sm font-semibold text-fg";
const hint = "mt-1 mb-2 font-ui text-sm text-muted";
const box =
  "block w-full resize-y rounded-1 border border-line-strong bg-raised p-3 font-ui text-sm text-fg";
</script>

<template>
  <HubShell :heading="follows ? 'Write a follow-up' : 'Write a guide'">
    <template #sub>
      <template v-if="follows">
        A follow-up adds more context to a guide: a missing detail, a step that needed explaining,
        what changed since, or what someone found doing it. Anyone who opens the guide gets it too.
      </template>
      <template v-else>
        Write down what you finished so someone else can repeat it. They'll tell you whether it
        worked.
      </template>
    </template>

    <form class="flex max-w-2xl flex-col gap-6" @submit.prevent="send">
      <!-- The guide this follows, named, so nobody writes a follow-up to the wrong thing. -->
      <div
        v-if="parent"
        class="rounded-2 border border-accent bg-accent-soft px-4 py-3 font-ui text-sm text-muted"
      >
        <p class="m-0">
          More context for
          <a :href="parent.url" target="_blank" rel="noopener" class="font-semibold text-fg">
            {{ parent.title || "Untitled guide" }}
          </a>
          <template v-if="!parent.mine && parentAuthor"> by {{ parentAuthor }}</template>.
        </p>
        <p class="mt-1 mb-0">
          It's listed under that guide. Everyone who opens the guide sees it, and agents that pick
          the guide up read it along with the original.
        </p>
      </div>
      <p
        v-else-if="parentMissing"
        class="m-0 rounded-2 border border-warn bg-warn-soft px-4 py-3 font-ui text-sm text-muted"
      >
        The guide this was meant to follow isn't available to you, so this will be saved as a new
        guide. <NuxtLink to="/hub/write">Start a plain guide instead</NuxtLink>
      </p>
      <div
        v-else-if="follows"
        class="h-16 rounded-2 bg-raised shadow-edge"
        role="status"
        aria-label="Finding the guide this follows"
      />

      <div>
        <label :class="label" for="g-title">What is it?</label>
        <p :class="hint">
          {{ follows ? "Say what the extra context is about, so it reads clearly under the original." : "A title someone would recognise in a list." }}
        </p>
        <input
          id="g-title"
          v-model="draft.title"
          class="w-full"
          required
          maxlength="140"
          :placeholder="follows ? 'Invoice PDFs: which environment variables the email step needs' : 'Invoice PDFs: download link and email attachment'"
        />
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label :class="label" for="g-team">Send it to</label>
          <select id="g-team" v-model="draft.team" class="mt-2 w-full">
            <option value="">Nobody yet, just save it</option>
            <option v-for="t in teams" :key="t.slug" :value="t.slug">{{ t.name }}</option>
          </select>
        </div>
        <div v-if="draft.team">
          <label :class="label" for="g-to">Anyone in particular?</label>
          <select id="g-to" v-model="draft.to" class="mt-2 w-full" :aria-busy="loadingMembers">
            <option value="">{{ loadingMembers ? "Loading people…" : "Everyone in the team" }}</option>
            <option
              v-for="m in members"
              :key="m.handle || m.display || m.name || ''"
              :value="m.handle || ''"
              :disabled="!m.handle"
            >
              {{ m.display || personName(m.name, m.handle) }}{{ m.handle ? "" : " (hasn't finished setting up)" }}
            </option>
          </select>
        </div>
      </div>

      <div>
        <label :class="label" for="g-problem">
          {{ follows ? "What context does the guide need?" : "What was the problem?" }}
        </label>
        <p :class="hint">
          {{ follows ? "What's missing, unclear or out of date in the original, and where." : "What was broken or missing, and where." }}
        </p>
        <textarea id="g-problem" v-model="draft.problem" :class="box" rows="4" required />
      </div>

      <div>
        <label :class="label" for="g-solution">What did you do? <span class="font-normal text-muted">Optional</span></label>
        <p :class="hint">The approach in a few sentences, and why you chose it.</p>
        <textarea id="g-solution" v-model="draft.solution" :class="box" rows="3" />
      </div>

      <div>
        <label :class="label" for="g-steps">
          {{ follows ? "What should someone do with this context?" : "How would someone else do it?" }}
        </label>
        <p :class="hint">The steps, in order. Numbered lines work well.</p>
        <textarea
          id="g-steps"
          v-model="draft.steps"
          :class="box"
          rows="6"
          required
          placeholder="1. …&#10;2. …"
        />
      </div>

      <div>
        <label :class="label" for="g-check">How do they know it worked? <span class="font-normal text-muted">Optional</span></label>
        <p :class="hint">What they should see when it's done right.</p>
        <textarea id="g-check" v-model="draft.verification" :class="box" rows="3" />
      </div>

      <div>
        <label :class="label" for="g-gotchas">Anything to watch out for? <span class="font-normal text-muted">Optional</span></label>
        <textarea id="g-gotchas" v-model="draft.gotchas" :class="box" rows="3" />
      </div>

      <p
        v-if="trouble"
        class="m-0 rounded-2 border border-danger bg-danger-soft px-3 py-3 font-ui text-sm text-danger"
      >
        {{ trouble }}
      </p>

      <div class="flex flex-wrap items-center gap-3">
        <button class="btn primary" type="submit" :disabled="!ready || busy">
          {{ busy ? "Sending…" : follows ? "Send follow-up" : draft.team ? "Send guide" : "Save guide" }}
        </button>
        <NuxtLink to="/hub" class="btn">Cancel</NuxtLink>
        <span v-if="!ready" class="font-ui text-sm text-muted">
          A title, {{ follows ? "the context" : "the problem" }} and the steps are needed.
        </span>
      </div>
    </form>
  </HubShell>
</template>
