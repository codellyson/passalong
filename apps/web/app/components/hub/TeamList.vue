<!--
  Every team you are in, with the link that adds someone to it.

  This replaces a panel that showed one team — whichever the scope chips happened to be pointing
  at — which meant the answer to "who is in my other team" was to change a filter first. There is
  no endpoint for all of them at once, so it is one call per team, in parallel, on a page that is
  opened rarely and lists a handful.
-->
<script setup lang="ts">
import { useQueries } from "@tanstack/vue-query";
import type { TeamDetail } from "~/types/hub";

const { data, api, json, scope, createTeam, signedIn } = useHub();
const router = useRouter();

const teams = computed(() => data.value.me?.teams || []);

// Same reason as the token name: a `prompt()` throws where dialogs are blocked, and the button
// then does nothing with no explanation.
const naming = ref(false);
const name = ref("");
const field = ref<HTMLInputElement | null>(null);

async function ask() {
  naming.value = true;
  name.value = "";
  await nextTick();
  field.value?.focus();
}

async function make() {
  if (!name.value.trim()) return;
  await createTeam(name.value);
  naming.value = false;
  name.value = "";
}
const open = ref<string | null>(null);

// One query per team, keyed the same way as the plan section and the write form, so each team is
// fetched once however many parts of Settings show it.
const detailQueries = useQueries({
  queries: computed(() =>
    teams.value.map((t) => ({
      queryKey: hubKeys.team(t.slug),
      queryFn: async () =>
        (await api<TeamDetail>(`/v1/teams/${encodeURIComponent(t.slug)}`)) as TeamDetail,
      enabled: signedIn.value,
    })),
  ),
});
const details = computed(
  () => detailQueries.value.map((q) => q.data).filter(Boolean) as TeamDetail[],
);
const loadingDetails = computed(() => detailQueries.value.some((q) => q.isPending));

/** "Bo, Mira, Sol and you" — by name, you are always in it, and always last. */
function who(t: TeamDetail) {
  const me = data.value.me?.handle;
  const others = t.members
    .filter((m) => !(m.handle && m.handle === me))
    .map((m) => m.display || personName(m.name, m.handle));
  if (!others.length) return "just you";
  return `${others.join(", ")} and you`;
}

/** One click: mint a link and put it on the clipboard. Nobody wants to read it. */
async function invite(t: TeamDetail, el: EventTarget | null) {
  const made = await api<{ url: string }>(
    `/v1/teams/${encodeURIComponent(t.slug)}/invites`,
    json("POST"),
  );
  if (made) copy(made.url, el);
}

function guides(t: TeamDetail) {
  scope.value = t.slug;
  router.push("/hub");
}
</script>

<template>
  <div>
    <HubSkeleton
      v-if="loadingDetails && !details.length"
      variant="lines"
      :rows="3"
      label="Loading your teams"
    />
    <ul v-else class="m-0 flex list-none flex-col gap-3 p-0">
      <li v-for="t in details" :key="t.slug" class="flex flex-col">
        <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="m-0 font-ui text-base font-semibold text-fg">{{ t.name || t.slug }}</p>
          <p class="mt-0.5 mb-0 font-ui text-sm text-muted">
            {{ t.role }} · {{ plural(t.members.length, "member") }} · {{ who(t) }}
          </p>
        </div>

        <div class="relative flex shrink-0 items-center gap-2">
          <button
            class="btn sm"
            @click="invite(t, $event.currentTarget)"
          >
            <AppIcon name="copy" /><span data-label>Copy invite link</span>
          </button>
          <button
            class="btn icon"
            :aria-expanded="open === t.slug"
            aria-haspopup="menu"
            @click="open = open === t.slug ? null : t.slug"
          >
            <AppIcon name="more" />
          </button>
          <div v-if="open === t.slug" class="menu" @keydown.esc="open = null">
            <button class="menu-item" @click="guides(t)">See this team's guides</button>
            <p class="menu-note">
              {{ plural(t.guides, "guide") }} sent here
            </p>
          </div>
        </div>
        </div>

        <!-- Owners only: the channel is a credential for a room, and changing it is not something
             a member should be able to do quietly. -->
        <!-- Groups first: who is in this team and how they are addressed is what somebody came
             here to change. A channel is where the news goes, which is the later question. -->
        <HubTeamGroups v-if="t.role === 'owner'" :team="t" />
        <HubTeamChannel v-if="t.role === 'owner'" :team="t" />
      </li>
    </ul>

    <p v-if="!teams.length" class="mt-0 mb-3 font-ui text-sm text-muted">
      No team yet. A team is the people you send guides to.
    </p>

    <form v-if="naming" class="mt-3 flex flex-wrap items-end gap-3" @submit.prevent="make">
      <div class="grow basis-64">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="team-name">
          Name your team
        </label>
        <input id="team-name" ref="field" v-model="name" class="w-full" placeholder="Kreative Korna" required />
      </div>
      <button class="btn primary sm" type="submit" :disabled="!name.trim()">Create team</button>
      <button class="btn sm" type="button" @click="naming = false">Cancel</button>
    </form>
    <button v-else class="btn sm mt-3" @click="ask"><AppIcon name="plus" />New team</button>
  </div>
</template>
