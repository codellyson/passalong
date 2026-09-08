<!--
  The first thing most people see. A self-serve signup lands in a genuinely empty hub — guides are
  only made by `passalong share`, and this surface has no editor — so the empty state cannot be a
  sentence explaining that nothing is here. It has to be the two things that lead somewhere.

  They are ordered because they depend on each other: work handed over before you have a handle
  can be addressed to a team but not to you.
-->
<script setup lang="ts">
import type { Me } from "~/types/hub";

const { data, api, json, setMe } = useHub();

const me = computed(() => data.value.me);
const claimed = computed(() => Boolean(me.value?.handle));

const error = ref<string | null>(null);
const saving = ref(false);

const hint = "mt-1.5 mb-0 font-ui text-xs text-muted";
const label = "block font-ui text-sm font-medium text-fg mb-1.5";

async function claim(e: Event) {
  const f = e.target as HTMLFormElement;
  const body = { handle: field(f, "handle"), name: field(f, "name") };
  error.value = null;
  saving.value = true;
  try {
    const next = await api<Partial<Me>>("/v1/me", json("PATCH", body));
    if (me.value && next) setMe({ ...me.value, ...next });
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <ol class="m-0 list-none p-0">
      <!-- Step one: claim a handle. -->
      <li class="relative pb-8 pl-10">
        <span
          class="absolute top-0 left-0 flex h-7 w-7 items-center justify-center rounded-pill font-ui text-sm font-semibold"
          :class="claimed ? 'bg-ok text-bg' : 'bg-accent text-accent-fg'"
        ><AppIcon v-if="claimed" name="check" /><template v-else>1</template></span>
        <span class="absolute top-8 bottom-0 left-[13px] w-px bg-line" />

        <h2 class="m-0 font-ui text-base font-semibold text-fg">Claim a handle</h2>
        <p class="mt-1 mb-0 font-ui text-sm text-muted">
          Teammates hand work to a handle. Until you claim one, nothing can reach you.
        </p>

        <p v-if="claimed" class="mt-3 mb-0 font-ui text-sm text-fg">
          You are <b class="font-code font-semibold">@{{ me?.handle }}</b>.
          <NuxtLink to="/hub/settings">change it in settings</NuxtLink>
        </p>

        <form
          v-else
          class="mt-3 rounded-2 border border-line bg-raised p-4"
          @submit.prevent="claim"
        >
          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label :class="label" for="first-handle">Handle</label>
              <div
                class="flex items-center gap-1 rounded-1 border bg-raised pl-3 focus-within:border-accent"
                :class="error ? 'border-danger' : 'border-line-strong'"
              >
                <span class="font-code text-sm text-muted">@</span>
                <input
                  id="first-handle"
                  name="handle"
                  class="w-full border-0 bg-transparent px-0 py-2 pr-3 focus:outline-none"
                  placeholder="ada"
                  required
                  spellcheck="false"
                  pattern="[a-zA-Z0-9][a-zA-Z0-9-]{1,30}"
                  title="2–31 characters: letters, digits and dashes"
                />
              </div>
              <p :class="hint">lowercase, unique, hard to typo</p>
            </div>

            <div>
              <label :class="label" for="first-name">Name</label>
              <input
                id="first-name"
                name="name"
                class="w-full"
                :value="me?.name || ''"
                placeholder="Ada Lovelace"
              />
              <p :class="hint">shown next to your guides</p>
            </div>
          </div>

          <p v-if="error" class="mt-3 mb-0 font-ui text-sm text-danger">{{ error }}</p>

          <div class="mt-4 flex flex-wrap items-center gap-3">
            <button class="primary" type="submit" :disabled="saving">
              {{ saving ? "Claiming…" : "Claim it" }}
            </button>
            <span class="font-ui text-sm text-muted">
              <template v-if="me?.email">Signed in as {{ me.email }} · </template>
              <NuxtLink to="/hub/settings">change in settings</NuxtLink>
            </span>
          </div>
        </form>
      </li>

      <!-- Step two: hand something over. Dimmed until the first is done, because a guide shared
           before you have a handle cannot be addressed to you. -->
      <li class="relative pl-10" :class="claimed ? '' : 'opacity-60'">
        <span
          class="absolute top-0 left-0 flex h-7 w-7 items-center justify-center rounded-pill border font-ui text-sm font-semibold"
          :class="claimed ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong text-muted'"
        >2</span>

        <h2 class="m-0 font-ui text-base font-semibold" :class="claimed ? 'text-fg' : 'text-muted'">
          Hand over your first piece of work
        </h2>
        <p class="mt-1 mb-0 font-ui text-sm text-muted">
          Run this at the end of a session. Passalong writes up what you did and puts it on this
          board.
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-3">
          <code
            class="rounded-1 border border-line bg-surface px-3 py-2 font-code text-sm text-fg select-all"
          >passalong share</code>
          <span class="font-ui text-sm text-muted">
            or tell Claude Code <b class="font-medium text-fg">“pass this along”</b>
          </span>
        </div>

        <!-- What the board turns into. It is a drawing, not data: an empty state that describes a
             row is asking someone to imagine the product they have not used yet. -->
        <div class="mt-4 rounded-2 border border-line p-4">
          <p class="m-0 font-ui text-xs font-semibold tracking-widest text-muted uppercase">
            What lands here
          </p>
          <div class="mt-3 flex items-start gap-4 border-l-[3px] border-l-warn pl-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2.5">
                <span
                  class="rounded-1 bg-warn-soft px-1.5 py-0.5 font-ui text-xs font-semibold tracking-wide text-warn uppercase"
                >in flight</span>
                <span class="h-2 w-28 rounded-pill bg-line" />
              </div>
              <span class="mt-2.5 block h-2.5 w-3/5 rounded-pill bg-line-strong" />
              <span class="mt-2 block h-2 w-2/5 rounded-pill bg-line" />
            </div>
            <span class="h-8 w-20 shrink-0 rounded-1 border border-line" />
          </div>
          <p class="mt-3 mb-0 font-ui text-sm text-muted">
            One row per guide: who it went to, whether anyone pulled it, and whether it worked for
            them.
          </p>
        </div>
      </li>
    </ol>

    <!-- The one path that leads somewhere immediately: an invite is how testers, designers and
         anyone who has never opened a terminal arrives. -->
    <div class="mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-6">
      <div class="min-w-0 grow basis-72">
        <h2 class="m-0 font-ui text-base font-semibold text-fg">Someone sent you an invite instead?</h2>
        <p class="mt-1 mb-0 font-ui text-sm text-muted">
          Paste their link to join a team and see what is waiting on you.
        </p>
      </div>
      <HubInvitePaste label="invite link" />
    </div>
  </div>
</template>
