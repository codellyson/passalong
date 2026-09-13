<!--
  Writing a guide in the browser.

  Until this existed a guide could only come from `passalong share` or an agent, so anyone without
  a terminal could receive work and never send any. The questions are the guide format's sections
  asked as a person would ask them — what was wrong, what did you do, how would someone else do it,
  how do they know it worked — and the answers become exactly the document the CLI writes.

  Who it goes to is picked from the team's members by name. A teammate who has never set a handle
  cannot be addressed yet (the server resolves `to:` by handle), so they are listed and explained
  rather than silently missing.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { TeamDetail } from "~/types/hub";

usePage({
  title: "Write a guide · Passalong",
  description: "Write down finished work so someone else can repeat it.",
  noindex: true,
});

const { data, api, json, refresh, signedIn } = useHub();
const router = useRouter();

const teams = computed(() => data.value.me?.teams ?? []);
const draft = reactive(blankDraft());
/** Minted once per visit, so a retried publish updates the same guide instead of making two. */
const id = newId();

watch(
  teams,
  (list) => {
    if (!draft.team && list.length === 1) draft.team = list[0]?.slug ?? "";
  },
  { immediate: true },
);

// A different team means a different set of people, so whoever was picked is cleared.
watch(
  () => draft.team,
  () => {
    draft.to = "";
  },
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
    await api(`/v1/guides/${id}`, json("PUT", { markdown: draftMarkdown(id, draft) }));
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
  <HubShell heading="Write a guide">
    <template #sub>
      Write down what you finished so someone else can repeat it. They'll tell you whether it worked.
    </template>

    <form class="flex max-w-2xl flex-col gap-6" @submit.prevent="send">
      <div>
        <label :class="label" for="g-title">What is it?</label>
        <p :class="hint">A title someone would recognise in a list.</p>
        <input
          id="g-title"
          v-model="draft.title"
          class="w-full"
          required
          maxlength="140"
          placeholder="Invoice PDFs: download link and email attachment"
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
        <label :class="label" for="g-problem">What was the problem?</label>
        <p :class="hint">What was broken or missing, and where.</p>
        <textarea id="g-problem" v-model="draft.problem" :class="box" rows="4" required />
      </div>

      <div>
        <label :class="label" for="g-solution">What did you do? <span class="font-normal text-muted">Optional</span></label>
        <p :class="hint">The approach in a few sentences, and why you chose it.</p>
        <textarea id="g-solution" v-model="draft.solution" :class="box" rows="3" />
      </div>

      <div>
        <label :class="label" for="g-steps">How would someone else do it?</label>
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
          {{ busy ? "Sending…" : draft.team ? "Send guide" : "Save guide" }}
        </button>
        <NuxtLink to="/hub" class="btn">Cancel</NuxtLink>
        <span v-if="!ready" class="font-ui text-sm text-muted">
          A title, the problem and the steps are needed.
        </span>
      </div>
    </form>
  </HubShell>
</template>
