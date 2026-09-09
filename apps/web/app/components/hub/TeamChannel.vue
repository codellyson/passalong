<!--
  A team's channels: where verdicts and handoffs arrive for everyone at once.

  More than one, because a team with a space for QA and a space for the people who fix things has
  two rooms, not one. Each is named, because "which of these stopped working" is unanswerable when
  they are all the same anonymous string.

  A URL is never shown after it is saved. Anyone holding it can post into that room, so it is the
  credential rather than an address — what is listed instead is the name, the host, and whether the
  last post was refused, which is what a list of channels actually has to answer.
-->
<script setup lang="ts">
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

const { api, json } = useHub();

const channels = ref<Channel[]>([]);
const adding = ref(false);
const name = ref("");
const url = ref("");
const busy = ref(false);
const trouble = ref("");
/** Per channel, so testing one does not blank the answer about another. */
const said = ref<Record<string, string>>({});
const removing = ref<string | null>(null);

async function load() {
  try {
    const answer = await api<{ channels: Channel[] }>(`/v1/teams/${props.team.slug}/channels`);
    channels.value = answer?.channels || [];
  } catch (e) {
    trouble.value = (e as Error).message;
  }
}
onMounted(load);

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
  <!-- No box. This sits inside a team's row, and wrapping it made a card inside a card inside a
       section — three borders deep, on a page where nothing else has any. A hairline and an indent
       say "belongs to the team above" without building another container to say it. -->
  <div class="mt-2 border-t border-line pt-2 pl-3">
    <ul v-if="channels.length" class="m-0 flex list-none flex-col gap-1 p-0">
      <li
        v-for="channel in channels"
        :key="channel.id"
        class="flex flex-wrap items-center gap-x-3 gap-y-1"
      >
        <span class="font-ui text-sm text-fg">{{ channel.name || channel.host }}</span>
        <span v-if="channel.name" class="font-code text-xs text-muted">{{ channel.host }}</span>
        <!-- A revoked webhook fails silently forever, so a failing one has to say so here. -->
        <span v-if="channel.failures" class="font-ui text-sm text-danger">
          failing · {{ channel.last_error }}
        </span>
        <span v-if="said[channel.id]" class="font-ui text-sm text-ok">{{ said[channel.id] }}</span>
        <span class="ml-auto flex flex-wrap items-center gap-2">
          <button class="btn sm" :disabled="busy" @click="test(channel.id)">send a test line</button>
          <template v-if="removing === channel.id">
            <span class="font-ui text-sm text-muted">Nothing posts there again.</span>
            <button class="btn outline danger sm" @click="remove(channel.id)">Remove it</button>
            <button class="btn sm" @click="removing = null">Cancel</button>
          </template>
          <button v-else class="btn destructive sm" @click="removing = channel.id">remove</button>
        </span>
      </li>
    </ul>
    <p v-else class="m-0 font-ui text-sm text-muted">
      No channel — verdicts reach people by mail and in their feed, but not a room.
    </p>

    <form v-if="adding" class="mt-2 flex flex-wrap items-end gap-3" @submit.prevent="add">
      <div class="grow basis-40">
        <label class="mb-1.5 block font-ui text-sm font-medium text-fg" for="channel-name">
          Which room?
        </label>
        <input id="channel-name" v-model="name" class="w-full" placeholder="QA space" required>
      </div>
      <div class="grow basis-72">
        <label class="mb-1.5 block font-ui text-sm font-medium text-fg" for="channel-url">
          Webhook URL
        </label>
        <input
          id="channel-url"
          v-model="url"
          class="w-full"
          type="url"
          placeholder="https://chat.googleapis.com/v1/spaces/…"
          required
        >
      </div>
      <button class="btn primary sm" type="submit" :disabled="busy || !url.trim()">
        {{ busy ? "Adding…" : "Add channel" }}
      </button>
      <button class="btn sm" type="button" @click="adding = false; name = ''; url = ''">
        Cancel
      </button>
      <p class="basis-full m-0 font-ui text-sm text-muted">
        In Google Chat this is <b>Manage webhooks</b> in the space's menu. It is only ever written
        here — anyone holding it can post to that room.
      </p>
    </form>
    <button v-else class="btn sm mt-2" @click="adding = true">
      <AppIcon name="plus" />new channel
    </button>

    <p v-if="trouble" class="mt-2 mb-0 font-ui text-sm text-danger">{{ trouble }}</p>
  </div>
</template>
