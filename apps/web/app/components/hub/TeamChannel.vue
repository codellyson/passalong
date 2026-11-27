<!--
  A team's channels: where work being sent, taken and finished arrives for everyone at once.

  More than one, because a team with a space for QA and a space for the people who fix things has
  two rooms, not one. Each is named, because "which of these stopped working" is unanswerable when
  they are all the same anonymous string.

  A channel is a room (news people read) or an app (every move on the team's work, as signed JSON,
  for a ticketing system or anything else that drives its own screen from Passalong). An app's
  signing secret is shown once, when it is added, like a token.

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
  kind: "room" | "app";
}

const props = defineProps<{ team: TeamDetail }>();

const { api, json, signedIn } = useHub();
const { copy, state: copied } = useCopy();
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
const kind = ref<"room" | "app">("room");
/** An app's signing secret, from the answer that added it. Never readable again. */
const secret = ref("");
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
    const added = await api<{ secret?: string }>(
      `/v1/teams/${props.team.slug}/channels`,
      json("POST", { name: name.value.trim(), url: url.value.trim(), kind: kind.value }),
    );
    secret.value = added?.secret ?? "";
    adding.value = false;
    name.value = "";
    url.value = "";
    kind.value = "room";
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
        ? channels.value.find((ch) => ch.id === id)?.kind === "app"
          ? "Sent a test event. Check your app received it."
          : "Sent. Check the room."
        : `It didn't go through: ${answer?.error || "no answer came back"}`,
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
              <span v-if="channel.name || channel.kind === 'app'" class="block font-code text-xs text-muted">{{ channel.kind === "app" ? "App · " : "" }}{{ channel.host }}</span>
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
              <button class="btn sm" type="button" :disabled="busy" @click="test(channel.id)">{{ channel.kind === "app" ? "Send a test event" : "Send a test line" }}</button>
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

    <div v-if="secret" class="appears mt-3 flex flex-col gap-2 border-b border-line pb-3" role="status">
      <p class="m-0 font-ui text-sm text-fg">
        Your app's signing secret. Copy it now: Passalong won't show it again. Each post carries a
        <code>Passalong-Signature</code> header your app checks with it.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <code class="min-w-0 break-all font-code text-sm">{{ secret }}</code>
        <button class="btn sm" type="button" @click="copy(secret, $event.currentTarget as HTMLElement)"><AppIcon name="copy" />{{ copied === "copied" ? "Copied" : "Copy" }}</button>
        <button class="btn sm" type="button" @click="secret = ''">Done</button>
      </div>
    </div>

    <form v-if="adding" class="appears mt-3 flex flex-wrap items-end gap-3" @submit.prevent="add">
      <div class="flex basis-full flex-wrap gap-2" role="radiogroup" aria-label="What this channel is">
        <label class="chip-pick font-ui text-sm">
          <input v-model="kind" type="radio" name="channel-kind" value="room">A chat room
        </label>
        <label class="chip-pick font-ui text-sm">
          <input v-model="kind" type="radio" name="channel-kind" value="app">An app
        </label>
      </div>
      <div class="grow basis-40">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="channel-name">{{ kind === "app" ? "Which app?" : "Which room?" }}</label>
        <input id="channel-name" v-model="name" class="w-full" :placeholder="kind === 'app' ? 'Support desk' : 'QA space'" required>
      </div>
      <div class="grow basis-72">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="channel-url">{{ kind === "app" ? "Address it receives events at" : "Webhook URL" }}</label>
        <input id="channel-url" v-model="url" class="w-full" type="url" :placeholder="kind === 'app' ? 'https://your-app.example/passalong' : 'https://chat.googleapis.com/v1/spaces/…'" required>
      </div>
      <button class="btn primary" type="submit" :disabled="busy || !url.trim()">
        {{ busy ? "Adding…" : "Add channel" }}
      </button>
      <button class="btn" type="button" @click="adding = false; name = ''; url = ''; kind = 'room'">Cancel</button>
      <p v-if="kind === 'app'" class="m-0 basis-full font-ui text-xs text-muted">
        Your app is sent every move on this team's work (taken, progress, asked, handed in, done) as signed JSON,
        with ids and status only. It reads the rest with its own Passalong token.
      </p>
      <p v-else class="m-0 basis-full font-ui text-xs text-muted">
        In Google Chat this is <b class="font-medium text-fg">Manage webhooks</b> in the space's menu. Passalong
        won't show it again, because anyone who has it can post to that room.
      </p>
    </form>
    <button v-else class="btn tonal sm mt-3 self-start" type="button" @click="adding = true">
      <AppIcon name="plus" />New channel
    </button>

    <p v-if="trouble" class="mt-2 mb-0 font-ui text-sm text-danger" role="alert">{{ trouble }}</p>
  </div>
</template>
