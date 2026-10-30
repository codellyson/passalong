<!--
  Every team you are in, each under its own name: its members, its groups, its channels and its
  plan, as blocks one under the other (they were tabs inside a card, which hid a failing channel
  behind a tab nobody opened). Groups and channels are owners only — a channel is a credential for
  a room.

  One call per team, in parallel, under the same keys the plan block and the write form use.
-->
<script setup lang="ts">
import { useQueries, useQueryClient } from "@tanstack/vue-query";
import type { TeamDetail } from "~/types/hub";
import { age } from "~/utils/projects";

const { data, api, json, scope, createTeam, signedIn } = useHub();
const router = useRouter();

const teams = computed(() => data.value.me?.teams || []);
const queryClient = useQueryClient();
const meId = computed(() => data.value.me?.account || "");

type Member = TeamDetail["members"][number];
const addressOf = (m: Member) => m.handle || m.id || "";
/** Which row is asking "are you sure?", as team:person. */
const sure = ref("");
const keyOf = (t: TeamDetail, m: Member) => `${t.slug}:${addressOf(m)}`;
const reload = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["team-detail"] }),
    queryClient.invalidateQueries({ queryKey: hubKeys.me }),
  ]);

async function setRole(t: TeamDetail, m: Member, role: "admin" | "member") {
  await api(
    `/v1/teams/${encodeURIComponent(t.slug)}/members/${encodeURIComponent(addressOf(m))}`,
    json("PATCH", { role }),
  );
  await reload();
}
const trouble = ref("");
async function takeOut(t: TeamDetail, m: Member) {
  trouble.value = "";
  try {
    await api(
      `/v1/teams/${encodeURIComponent(t.slug)}/members/${encodeURIComponent(addressOf(m))}`,
      {
        method: "DELETE",
      },
    );
    sure.value = "";
    await reload();
  } catch (e) {
    trouble.value = (e as Error).message;
  }
}
const nameOf = (m: Member) => m.display || personName(m.name, m.handle);
const roleOf = (m: Member) =>
  m.role === "owner" ? (m.creator ? "Admin, made it" : "Admin") : "Member";

// Same reason as the token name: a `prompt()` throws where dialogs are blocked.
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
const failedDetails = computed(() => detailQueries.value.find((q) => q.error)?.error ?? null);
const retry = () => queryClient.invalidateQueries({ queryKey: ["team-detail"] });

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
  <div class="flex flex-col gap-12">
    <HubSkeleton v-if="loadingDetails && !details.length" variant="lines" :rows="4" label="Loading your teams" />
    <div v-else-if="failedDetails && !details.length" role="alert" class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
      <p class="m-0 min-w-0 grow font-ui text-sm text-danger">Your teams didn't load. {{ failedDetails.message }}</p>
      <button class="btn outline danger sm" type="button" @click="retry">Try again</button>
    </div>

    <section
      v-for="t in details"
      :id="`team-${t.slug}`"
      :key="t.slug"
      class="flex scroll-mt-20 flex-col gap-8"
      :aria-labelledby="`team-${t.slug}-h`"
    >
      <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div class="min-w-0">
          <h2 :id="`team-${t.slug}-h`" class="m-0 text-h3 font-medium tracking-tight">{{ t.name || t.slug }}</h2>
          <p class="m-0 mt-1 font-ui text-sm text-muted">
            {{ t.role === "owner" ? "You're an admin" : "You're a member" }} · {{ t.members.length }} {{ t.members.length === 1 ? "person" : "people" }} ·
            {{ t.guides }} {{ t.guides === 1 ? "piece of work" : "pieces of work" }}
          </p>
        </div>
        <button class="btn sm" type="button" @click="guides(t)">See its work</button>
      </div>

      <HubSettingsSection
        :id="`team-${t.slug}-people`"
        :level="3"
        title="Members"
        :blurb="`Anyone with an invite link joins ${t.name || t.slug}. Each copy is a new link.`"
      >
        <template #action>
          <button class="btn sm" type="button" @click="invite(t, $event.currentTarget)">
            <AppIcon name="copy" /><span data-label>Copy invite link</span>
          </button>
        </template>
        <div class="@container">
          <div aria-hidden="true" class="register-label hidden grid-cols-[minmax(0,1fr)_9rem_8rem_3.5rem_11rem] gap-x-4 border-b border-line pt-3 pb-2 @2xl:grid">
            <span>Name</span><span>@name</span><span>Role</span><span class="text-right">Joined</span><span />
          </div>
          <ul class="m-0 list-none p-0">
            <li v-for="m in t.members" :key="m.id || m.handle || m.joined" class="border-b border-line py-3 last:border-b-0">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-sm @2xl:grid @2xl:gap-x-4 @2xl:grid-cols-[minmax(0,1fr)_9rem_8rem_3.5rem_11rem]">
                <span class="min-w-0 grow basis-full font-medium break-words text-fg @2xl:basis-auto">
                  {{ nameOf(m) }}<span v-if="m.id === meId" class="font-normal text-muted"> (you)</span>
                </span>
                <span class="min-w-0 truncate text-muted @2xl:text-fg">{{ m.handle ? `@${m.handle}` : "no @name yet" }}</span>
                <span class="text-muted @2xl:text-fg"><span class="@2xl:hidden" aria-hidden="true">· </span>{{ roleOf(m) }}</span>
                <span class="text-muted tabular-nums @2xl:text-right @2xl:text-fg"><span class="@2xl:hidden" aria-hidden="true">· joined </span>{{ age(m.joined) }}</span>
                <span v-if="!m.creator && (t.role === 'owner' || m.id === meId)" class="flex basis-full flex-wrap justify-start gap-2 pt-1 @2xl:basis-auto @2xl:justify-end @2xl:pt-0">
                  <template v-if="!m.creator && t.role === 'owner' && m.id !== meId">
                    <button v-if="m.role !== 'owner'" class="btn sm" type="button" @click="setRole(t, m, 'admin')">Make admin</button>
                    <button v-else class="btn sm" type="button" @click="setRole(t, m, 'member')">Make member</button>
                  </template>
                  <button
                    v-if="!m.creator && (t.role === 'owner' || m.id === meId) && sure !== keyOf(t, m)"
                    class="btn sm"
                    type="button"
                    @click="sure = keyOf(t, m)"
                  >{{ m.id === meId ? "Leave…" : "Remove…" }}</button>
                </span>
              </div>
              <!-- Two presses to break something, and the first says what breaks. -->
              <div v-if="sure === keyOf(t, m)" class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2" role="alert">
                <p class="m-0 min-w-0 grow basis-64 font-ui text-sm">
                  <template v-if="m.id === meId">Leave {{ t.name }}? What you hold there goes back to waiting and you leave its groups; what you wrote stays. You need a new invite to come back.</template>
                  <template v-else>Remove {{ nameOf(m) }} from {{ t.name }}? What they hold goes back to waiting and they leave its groups; what they wrote stays in the team.</template>
                </p>
                <button class="btn sm outline danger" type="button" @click="takeOut(t, m)">{{ m.id === meId ? "Leave" : "Remove" }}</button>
                <button class="btn sm" type="button" @click="sure = ''">{{ m.id === meId ? "Stay" : "Keep them" }}</button>
              </div>
            </li>
          </ul>
          <p v-if="trouble" class="m-0 mt-2 font-ui text-sm text-danger" role="alert">{{ trouble }}</p>
        </div>
      </HubSettingsSection>

      <HubSettingsSection
        v-if="t.role === 'owner'"
        :id="`team-${t.slug}-groups`"
        :level="3"
        title="Groups"
        blurb="The people who do a thing, addressable as one: work sent to #frontend reaches everyone in it, and the first to take it takes it off the others' lists."
      >
        <HubTeamGroups :team="t" />
      </HubSettingsSection>

      <HubSettingsSection
        v-if="t.role === 'owner'"
        :id="`team-${t.slug}-channels`"
        :level="3"
        title="Channels"
        blurb="A chat room where work being sent, taken and finished arrives for everyone at once."
      >
        <HubTeamChannel :team="t" />
      </HubSettingsSection>

      <HubSettingsSection :id="`team-${t.slug}-plan`" :level="3" title="Plan">
        <HubPlan :slug="t.slug" />
      </HubSettingsSection>
    </section>

    <div v-if="!teams.length" class="flex flex-col items-start gap-2 border-b border-fg pb-6">
      <p class="m-0 text-h3 font-medium">No team yet.</p>
      <p class="m-0 font-ui text-sm text-muted">A team is the people you send work to. Make one, or open an invite link someone sent you.</p>
    </div>

    <form v-if="naming" id="new-team" class="flex flex-wrap items-end gap-3" @submit.prevent="make">
      <div class="grow basis-64">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="team-name">Name your team</label>
        <input id="team-name" ref="field" v-model="name" class="w-full" placeholder="Name it after the people, e.g. Checkout squad" required>
      </div>
      <button class="btn primary" type="submit" :disabled="!name.trim()">Create team</button>
      <button class="btn" type="button" @click="naming = false">Cancel</button>
    </form>
    <button v-else id="new-team" class="btn sm self-start" type="button" @click="ask"><AppIcon name="plus" />New team</button>
  </div>
</template>
