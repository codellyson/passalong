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
  <div class="mt-2 rounded-2 border border-line bg-surface px-3 py-2.5">
    <p class="m-0 font-ui text-sm text-muted">
      <template v-if="channels.length">
        Verdicts and handoffs post to
        {{ channels.length }} channel{{ channels.length === 1 ? "" : "s" }}.
      </template>
      <template v-else>
        No channels. Verdicts reach people by mail and in their feed, but not a room.
      </template>
    </p>

    <ul v-if="channels.length" class="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
      <li
        v-for="channel in channels"
        :key="channel.id"
        class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-1 border border-line bg-raised px-3 py-2"
      >
        <span class="font-ui text-sm font-medium text-fg">{{ channel.name || "Unnamed" }}</span>
        <span class="font-code text-xs text-muted">{{ channel.host }}</span>
        <!-- A revoked webhook fails silently forever, so a failing one has to say so here. -->
        <span v-if="channel.failures" class="font-ui text-xs text-danger">
          failing — {{ channel.last_error }} ({{ channel.failures }}×)
        </span>
        <span v-if="said[channel.id]" class="font-ui text-xs text-ok">{{ said[channel.id] }}</span>
        <span class="ml-auto flex flex-wrap gap-2">
          <button type="button" class="btn sm" :disabled="busy" @click="test(channel.id)">
            Test
          </button>
          <template v-if="removing === channel.id">
            <button type="button" class="btn sm destructive" @click="remove(channel.id)">
              Remove
            </button>
            <button type="button" class="btn sm" @click="removing = null">Keep</button>
          </template>
          <button v-else type="button" class="btn sm" @click="removing = channel.id">Remove</button>
        </span>
      </li>
    </ul>

    <form v-if="adding" class="mt-3 flex flex-col gap-2" @submit.prevent="add">
      <label class="flex flex-col gap-1.5">
        <span class="font-ui text-xs font-semibold tracking-wide text-muted uppercase">Name</span>
        <input v-model="name" type="text" placeholder="QA space" required>
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="font-ui text-xs font-semibold tracking-wide text-muted uppercase">
          Webhook URL
        </span>
        <input v-model="url" type="url" placeholder="https://chat.googleapis.com/v1/spaces/…" required>
        <span class="font-ui text-xs text-muted">
          An incoming webhook from Google Chat, Slack or Discord, or any address that accepts a
          POST. In Google Chat it is <b>Manage webhooks</b> in the space's menu. It is only ever
          written here — anyone holding it can post to that room, so it is not shown again.
        </span>
      </label>
      <div class="flex gap-2">
        <button type="submit" class="btn primary sm" :disabled="busy">
          {{ busy ? "Adding…" : "Add channel" }}
        </button>
        <button type="button" class="btn sm" @click="adding = false; name = ''; url = ''">
          Cancel
        </button>
      </div>
    </form>
    <button v-else type="button" class="btn sm mt-2" @click="adding = true">Add a channel</button>

    <p v-if="trouble" class="mt-2 mb-0 font-ui text-sm text-danger">{{ trouble }}</p>
  </div>
</template>
