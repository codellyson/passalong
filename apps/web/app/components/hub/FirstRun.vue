<!--
  The first thing most people see: an account with nothing in it yet.

  Two steps, in the order they depend on each other. Teammates can only send work to you once they
  have something to call you, so step one asks for your name and suggests the @name from it. Step
  two is giving an agent its first task. Passalong is agent first, so that is a sentence to say to
  your agent, not a form: the agent that has the context writes the guide.
-->
<script setup lang="ts">
import type { Me } from "~/types/hub";
import { ASKS, bugAsk, CONNECT, teamTaskAsk } from "~/utils/asks";

const { data, api, json, setMe } = useHub();

const me = computed(() => data.value.me);
const claimed = computed(() => Boolean(me.value?.handle));
/** The team they belong to, if any: what arrives from an invite, and where their issues should go. */
const team = computed(() => me.value?.teams?.[0] ?? null);

const name = ref(me.value?.name || "");
const handle = ref("");
const handleTouched = ref(false);
const editingHandle = ref(false);
watch(
  name,
  (typed) => {
    if (!handleTouched.value) handle.value = handleFrom(typed);
  },
  { immediate: true },
);

const error = ref<string | null>(null);
const saving = ref(false);

async function claim() {
  error.value = null;
  saving.value = true;
  try {
    const next = await api<Partial<Me>>(
      "/v1/me",
      json("PATCH", { handle: handle.value, name: name.value.trim() }),
    );
    if (me.value && next) setMe({ ...me.value, ...next });
  } catch (err) {
    error.value = (err as Error).message;
    editingHandle.value = true;
  } finally {
    saving.value = false;
  }
}

const step =
  "absolute top-0 left-0 flex h-7 w-7 items-center justify-center rounded-pill font-ui text-sm font-semibold";
</script>

<template>
  <div>
    <ol class="m-0 list-none p-0">
      <li class="relative pb-8 pl-10">
        <span :class="[step, claimed ? 'bg-ok text-bg' : 'bg-accent text-accent-fg']">
          <AppIcon v-if="claimed" name="check" /><template v-else>1</template>
        </span>
        <span class="absolute top-8 bottom-0 left-[13px] w-px bg-line" />

        <template v-if="claimed">
          <h2 class="m-0 font-ui text-base font-semibold text-fg">You're set up as {{ meName(me) }}</h2>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">
            Teammates send you work as <b class="font-medium text-fg">@{{ me?.handle }}</b>.
            <NuxtLink to="/hub/settings">Change it in Settings</NuxtLink>
          </p>
        </template>

        <template v-else>
          <h2 class="m-0 font-ui text-base font-semibold text-fg">Tell your team who you are</h2>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">
            Nothing can be sent to you until teammates have something to call you.
          </p>

          <form class="mt-3 flex max-w-md flex-col gap-3 rounded-2 bg-raised shadow-edge p-4" @submit.prevent="claim">
            <div>
              <label class="mb-2 block font-ui text-sm font-medium text-fg" for="first-name">Your name</label>
              <input id="first-name" v-model="name" class="w-full" required placeholder="Ada Okafor" autocomplete="name" />
            </div>

            <p v-if="!editingHandle" class="m-0 font-ui text-sm text-muted">
              Teammates can send you work as <b class="font-medium text-fg">@{{ handle || "your-name" }}</b>.
              <button class="linkish" type="button" @click="editingHandle = true">Change</button>
            </p>
            <div v-else>
              <label class="mb-2 block font-ui text-sm font-medium text-fg" for="first-handle">
                How teammates mention you
              </label>
              <div class="affix">
                <span class="affix-mark" aria-hidden="true">@</span>
                <input
                  id="first-handle"
                  v-model="handle"
                  required
                  spellcheck="false"
                  pattern="[a-z0-9][a-z0-9-]{1,30}"
                  title="2 to 31 lowercase letters, numbers or dashes"
                  @input="handleTouched = true"
                />
              </div>
              <p class="mt-2 mb-0 font-ui text-xs text-muted">2 to 31 lowercase letters, numbers or dashes.</p>
            </div>

            <p v-if="error" class="m-0 font-ui text-sm text-danger">{{ error }}</p>

            <div>
              <button class="btn primary" type="submit" :disabled="saving || !name.trim()">
                {{ saving ? "Saving…" : "Save" }}
              </button>
            </div>
          </form>
        </template>
      </li>

      <!-- Connecting comes before asking an agent for anything, and it was a grey line under the
           task prompt. Everybody needs it, so it is a step. -->
      <li class="relative pb-8 pl-10" :class="claimed ? '' : 'opacity-60'">
        <span
          :class="[step, 'border', claimed ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong text-muted']"
        >2</span>
        <span class="absolute top-8 bottom-0 left-[13px] w-px bg-line" />

        <h2 class="m-0 font-ui text-base font-semibold" :class="claimed ? 'text-fg' : 'text-muted'">
          Connect your Claude Code
        </h2>
        <p class="mt-1 mb-0 font-ui text-sm text-muted">
          Run these in a terminal, once. <code>passalong login</code> opens a page here to approve;
          nothing to type or paste.
        </p>
        <div class="mt-3 flex flex-col gap-2">
          <HubAsk v-for="c in CONNECT" :key="c" :text="c" />
          <p class="m-0 font-ui text-xs text-muted">
            Using Codex, ChatGPT or Claude instead?
            <NuxtLink to="/connect">How to connect them</NuxtLink>
          </p>
        </div>
      </li>

      <li class="relative pl-10" :class="claimed ? '' : 'opacity-60'">
        <span
          :class="[step, 'border', claimed ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong text-muted']"
        >3</span>

        <template v-if="team">
          <h2 class="m-0 font-ui text-base font-semibold" :class="claimed ? 'text-fg' : 'text-muted'">
            Record your first issue for {{ team.name }}
          </h2>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">
            Say this in Claude Code. Name the team: an issue filed without one is private to you, and
            {{ team.name }} will not see it.
          </p>
          <div class="mt-3 flex flex-col gap-2">
            <HubAsk :text="bugAsk(team.slug)" />
            <p class="m-0 font-ui text-xs text-muted">
              For work to be done rather than something broken:
              <code>{{ teamTaskAsk(team.slug) }}</code>
            </p>
          </div>
        </template>

        <template v-else>
          <h2 class="m-0 font-ui text-base font-semibold" :class="claimed ? 'text-fg' : 'text-muted'">
            Give an agent its first task
          </h2>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">
            Your agent writes it, in the repo it is for. Say this in Claude Code, or any agent with the
            Passalong tools. It waits here as a draft until you have read it.
          </p>
          <div class="mt-3 flex flex-col gap-2">
            <HubAsk :text="ASKS.task" />
            <p class="m-0 font-ui text-xs text-muted">
              Finished something someone else should repeat? Say <b class="font-medium text-fg">“{{ ASKS.handoff }}”</b>
              at the end of the session.
            </p>
          </div>
        </template>
      </li>
    </ol>

    <!-- The one path that leads somewhere immediately: an invite is how most people who never
         open a terminal arrive. -->
    <div v-if="!team" class="mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-6">
      <div class="min-w-0 grow basis-72">
        <h2 class="m-0 font-ui text-base font-semibold text-fg">Someone sent you an invite?</h2>
        <p class="mt-1 mb-0 font-ui text-sm text-muted">
          Paste the link to join their team and see what's waiting for you.
        </p>
      </div>
      <HubInvitePaste label="Invite link" />
    </div>
  </div>
</template>
