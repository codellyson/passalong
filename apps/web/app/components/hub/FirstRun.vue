<!--
  The first thing most people see: an account with nothing in it yet.

  Two steps, in the order they depend on each other. Teammates can only send work to you once they
  have something to call you, so step one asks for your name and suggests the @name from it. Step
  two is sending something — and it used to be a single `passalong share` command, which told a
  tester or a designer that the product was not for them. It now offers the browser first.
-->
<script setup lang="ts">
import type { Me } from "~/types/hub";

const { data, api, json, setMe } = useHub();

const me = computed(() => data.value.me);
const claimed = computed(() => Boolean(me.value?.handle));

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

      <li class="relative pl-10" :class="claimed ? '' : 'opacity-60'">
        <span
          :class="[step, 'border', claimed ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong text-muted']"
        >2</span>

        <h2 class="m-0 font-ui text-base font-semibold" :class="claimed ? 'text-fg' : 'text-muted'">
          Send your first guide
        </h2>
        <p class="mt-1 mb-0 font-ui text-sm text-muted">
          A guide is finished work written down so someone else can repeat it.
        </p>

        <div class="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
          <div class="flex flex-col gap-2 rounded-2 bg-raised shadow-edge p-4">
            <b class="font-ui text-sm text-fg">Write it here</b>
            <p class="m-0 font-ui text-sm text-muted">
              Describe the problem, what you did, and how someone checks it worked.
            </p>
            <NuxtLink to="/hub/write" class="btn primary sm mt-auto self-start">Write a guide</NuxtLink>
          </div>
          <div class="flex flex-col gap-2 rounded-2 bg-raised shadow-edge p-4">
            <b class="font-ui text-sm text-fg">From Claude Code or a terminal</b>
            <p class="m-0 font-ui text-sm text-muted">
              At the end of a session, say <b class="font-medium text-fg">“pass this along”</b> in
              Claude Code, or run the command below.
            </p>
            <button
              class="btn sm mt-auto self-start"
              type="button"
              @click="copy('passalong share', $event.currentTarget)"
            >
              <AppIcon name="copy" /><span data-label>Copy <code>passalong share</code></span>
            </button>
          </div>
        </div>
      </li>
    </ol>

    <!-- The one path that leads somewhere immediately: an invite is how most people who never
         open a terminal arrive. -->
    <div class="mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-6">
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
