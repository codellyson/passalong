<!-- The team you are looking at: who is in it, and the link that adds someone. -->
<script setup lang="ts">
const { data, api, json, load } = useHub();

const team = computed(() => data.value.team);
const invite = ref<{ url: string } | null>(null);

async function make() {
  if (!team.value) return;
  invite.value = await api<{ url: string }>(
    `/v1/teams/${encodeURIComponent(team.value.slug)}/invites`,
    json("POST"),
  );
  await load();
}
</script>

<template>
  <section v-if="team" class="team">
    <div class="head">
      <h2>{{ team.name }}</h2>
      <span class="meta">
        <span>{{ plural(team.members.length, "member") }}</span>
        <span>{{ plural(team.guides, "guide") }}</span>
        <span>you are {{ team.role }}</span>
      </span>
    </div>
    <ul class="members">
      <li v-for="m in team.members" :key="m.handle || m.joined">
        <b>{{ m.handle ? `@${m.handle}` : "(no handle yet)" }}</b>{{ m.name ? ` ${m.name}` : "" }}
        <span class="muted"> · {{ m.role }} · joined {{ rel(m.joined) }}</span>
      </li>
    </ul>
    <div class="actions">
      <button class="btn" @click="make">new invite link</button>
      <span v-if="invite" class="invite">
        <code>{{ invite.url }}</code>
        <button class="btn" @click="copy(invite.url, $event.target)">copy</button>
      </span>
      <span v-else class="muted">
        hand a teammate the link; they join in the browser, no install
      </span>
    </div>
  </section>
</template>
