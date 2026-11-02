<!--
  A team's channels: where work being sent, taken and finished arrives for everyone at once.

  More than one, because a team with a space for QA and a space for the people who fix things has
  two rooms, not one. Each is named, because "which of these stopped working" is unanswerable when
  they are all the same anonymous string.

  A URL is never shown after it is saved. Anyone holding it can post into that room, so it is the
  credential rather than an address — what is listed instead is the name, the host, and whether the
  last post was refused, which is what a list of channels actually has to answer.
-->
<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import type { TeamDetail } from "~/types/hub";

interface Channel {
  id: string;
  name: string;
  created: string;
  failures: number;
  last_error: string;
  host: string;
}

const props = defineProps<{ team: TeamDetail }>();

const { api, json, signedIn } = useHub();
const queryClient = useQueryClient();

const key = computed(() => ["channels", props.team.slug] as const);
const {
  data: loaded,
  isPending: loadingChannels,
  error: loadFailed,
} = useQuery({
  queryKey: key,
  queryFn: async () =>
    (await api<{ channels: Channel[] }>(`/v1/teams/${props.team.slug}/channels`))?.channels ?? [],
  enabled: signedIn,
});
const channels = computed(() => loaded.value ?? []);
const adding = ref(false);
const name = ref("");
const url = ref("");
const busy = ref(false);
const trouble = ref("");
/** Per channel, so testing one does not blank the answer about another. */
const said = ref<Record<string, string>>({});
const removing = ref<string | null>(null);

const load = () => queryClient.invalidateQueries({ queryKey: key.value });
watch(loadFailed, (e) => {
  if (e) trouble.value = e.message;
});

async function add() {
  if (busy.value) return;
  busy.value = true;
  trouble.value = "";
  try {
    await api(
      `/v1/teams/${props.team.slug}/channels`,
      json("POST", { name: name.value.trim(), url: url.value.trim() }),
    );
    adding.value = false;
    name.value = "";
    url.value = "";
    await load();
  } catch (e) {
    trouble.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function remove(id: string) {
  try {
    await api(`/v1/teams/${props.team.slug}/channels/${id}`, { method: "DELETE" });
    removing.value = null;
    await load();
  } catch (e) {
    trouble.value = (e as Error).message;
  }
}

/** Sending one line is the only way to tell a working channel from a plausible typo. */
async function test(id: string) {
  busy.value = true;
  said.value = { ...said.value, [id]: "" };
  try {
    const answer = await api<{ delivered: boolean; status: number; error: string }>(
      `/v1/teams/${props.team.slug}/channels/${id}/test`,
      json("POST"),
    );
    said.value = {
      ...said.value,
      [id]: answer?.delivered
        ? "Sent — check the room."
        : `Refused: ${answer?.error || "no answer"}`,
    };
    await load();
  } catch (e) {
    trouble.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="@container flex flex-col">
    <HubSkeleton v-if="loadingChannels" variant="lines" :rows="1" label="Loading channels" />
    <template v-else-if="channels.length">
      <div aria-hidden="true" class="register-label hidden grid-cols-[12rem_minmax(0,1fr)_auto] gap-x-4 border-b border-line pt-3 pb-2 @2xl:grid">
        <span>Room</span><span>State</span><span />
      </div>
      <ul class="m-0 list-none p-0">
        <li v-for="channel in channels" :key="channel.id" class="border-b border-line py-3">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-sm @2xl:grid @2xl:gap-x-4 @2xl:grid-cols-[12rem_minmax(0,1fr)_auto]">
            <span class="min-w-0 basis-full @2xl:basis-auto">
              <span class="block font-medium break-words text-fg">{{ channel.name || channel.host }}</span>
              <span v-if="channel.name" class="block font-code text-xs text-muted">{{ channel.host }}</span>
            </span>
            <!-- A revoked webhook fails silently forever, so a failing one has to say so here. -->
            <span class="min-w-0 grow">
              <span v-if="channel.failures" class="flex items-center gap-2 text-danger">
                <span class="size-1.5 shrink-0 rounded-pill bg-danger" aria-hidden="true" />Failing · {{ channel.last_error }}
              </span>
              <span v-else class="text-muted @2xl:text-fg">Posting</span>
              <span v-if="said[channel.id]" class="block text-xs text-muted" role="status">{{ said[channel.id] }}</span>
            </span>
            <span class="flex basis-full flex-wrap gap-2 pt-1 @2xl:basis-auto @2xl:justify-end @2xl:pt-0">
              <button class="btn sm" type="button" :disabled="busy" @click="test(channel.id)">Send a test line</button>
              <button v-if="removing !== channel.id" class="btn sm" type="button" @click="removing = channel.id">Remove…</button>
            </span>
          </div>
          <div v-if="removing === channel.id" class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2" role="alert">
            <p class="m-0 min-w-0 grow basis-64 font-ui text-sm">Remove {{ channel.name || channel.host }}? Nothing posts there again; to bring it back, add the webhook again.</p>
            <button class="btn sm outline danger" type="button" @click="remove(channel.id)">Remove</button>
            <button class="btn sm" type="button" @click="removing = null">Keep it</button>
          </div>
        </li>
      </ul>
    </template>
    <p v-else class="m-0 border-b border-line py-3 font-ui text-sm text-muted">
      No channel yet. News reaches people by mail and in their feed, but not a room.
    </p>

    <form v-if="adding" class="appears mt-3 flex flex-wrap items-end gap-3" @submit.prevent="add">
      <div class="grow basis-40">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="channel-name">Which room?</label>
        <input id="channel-name" v-model="name" class="w-full" placeholder="QA space" required>
      </div>
      <div class="grow basis-72">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="channel-url">Webhook URL</label>
        <input id="channel-url" v-model="url" class="w-full" type="url" placeholder="https://chat.googleapis.com/v1/spaces/…" required>
      </div>
      <button class="btn primary" type="submit" :disabled="busy || !url.trim()">
        {{ busy ? "Adding…" : "Add channel" }}
      </button>
      <button class="btn" type="button" @click="adding = false; name = ''; url = ''">Cancel</button>
      <p class="m-0 basis-full font-ui text-xs text-muted">
        In Google Chat this is <b class="font-medium text-fg">Manage webhooks</b> in the space's menu. It is
        only ever written here — anyone holding it can post to that room.
      </p>
    </form>
    <button v-else class="btn sm mt-3 self-start" type="button" @click="adding = true">
      <AppIcon name="plus" />New channel
    </button>

    <p v-if="trouble" class="mt-2 mb-0 font-ui text-sm text-danger" role="alert">{{ trouble }}</p>
  </div>
</template>
