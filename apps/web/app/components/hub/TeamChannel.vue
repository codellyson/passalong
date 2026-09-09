<!--
  A team's channel: where verdicts and handoffs arrive for everyone at once.

  Notifications already reach a person twice — a row in their feed and mail for the moments worth
  an inbox — and neither reaches a room. "Someone says your guide does not work" is the most
  valuable thing this product produces, and until now it landed where one person would see it
  eventually.

  The URL is write-only here for the same reason it is on the server: anyone holding it can post
  into that room, so it is the credential, not an address. Once set, this shows that one is set and
  offers to send a line so you can watch it arrive — which is the only way to tell a working
  channel from a typo.
-->
<script setup lang="ts">
import type { TeamDetail } from "~/types/hub";

const props = defineProps<{ team: TeamDetail; set: boolean }>();
const emit = defineEmits<{ (e: "changed", set: boolean): void }>();

const { api, json } = useHub();

const editing = ref(false);
const url = ref("");
const busy = ref(false);
const trouble = ref("");
const said = ref("");

async function save(next: string) {
  busy.value = true;
  trouble.value = "";
  said.value = "";
  try {
    await api(`/v1/teams/${props.team.slug}`, json("PATCH", { webhook_url: next }));
    emit("changed", Boolean(next));
    editing.value = false;
    url.value = "";
    said.value = next ? "Channel saved." : "Channel removed.";
  } catch (e) {
    trouble.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

/** Sending one line is the only way to tell a working channel from a plausible typo. */
async function test() {
  busy.value = true;
  trouble.value = "";
  said.value = "";
  try {
    const answer = await api<{ delivered: boolean; status: number }>(
      `/v1/teams/${props.team.slug}/channel-test`,
      json("POST"),
    );
    said.value = answer?.delivered
      ? "Sent — check the channel."
      : `The channel refused it (${answer?.status || "no answer"}). The URL may have been revoked.`;
  } catch (e) {
    trouble.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mt-2 rounded-2 border border-line bg-surface px-3 py-2.5">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span class="font-ui text-sm text-muted">
        <template v-if="set">
          Channel connected — verdicts and handoffs post to it.
        </template>
        <template v-else>
          No channel. Verdicts reach people by mail and in their feed, but not a room.
        </template>
      </span>
      <span class="ml-auto flex flex-wrap gap-2">
        <template v-if="set">
          <button type="button" class="btn sm" :disabled="busy" @click="test">Send a test line</button>
          <button type="button" class="btn sm" :disabled="busy" @click="editing = true">Replace</button>
          <button type="button" class="btn sm destructive" :disabled="busy" @click="save('')">
            Remove
          </button>
        </template>
        <button v-else type="button" class="btn sm" @click="editing = true">Connect a channel</button>
      </span>
    </div>

    <form v-if="editing" class="mt-3 flex flex-col gap-2" @submit.prevent="save(url.trim())">
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
          {{ busy ? "Saving…" : "Save channel" }}
        </button>
        <button type="button" class="btn sm" @click="editing = false; url = ''">Cancel</button>
      </div>
    </form>

    <p v-if="trouble" class="mt-2 mb-0 font-ui text-sm text-danger">{{ trouble }}</p>
    <p v-else-if="said" class="mt-2 mb-0 font-ui text-sm text-ok">{{ said }}</p>
  </div>
</template>
