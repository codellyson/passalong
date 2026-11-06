<!--
  Settings → Product news: whether the occasional mail about what's new in Passalong comes to this
  account (apps/api/src/announcements.ts). One switch for the account, not per device: it is mail.
  The same thing the "Stop product news" link in each of those mails turns off.
-->
<script setup lang="ts">
const { data, api, json, setMe } = useHub();
const on = computed(() => data.value.me?.news_mail !== false);
const saving = ref(false);
const problem = ref("");

async function set(next: boolean) {
  const me = data.value.me;
  if (!me) return;
  problem.value = "";
  saving.value = true;
  // Moves at once and goes back if the server says no, like every other switch in the hub.
  setMe({ ...me, news_mail: next });
  try {
    await api("/v1/me", json("PATCH", { news_mail: next }));
  } catch (e) {
    setMe({ ...me, news_mail: !next });
    problem.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="py-4">
  <label class="flex items-start gap-2 font-ui text-sm">
    <input
      type="checkbox"
      class="mt-1"
      :checked="on"
      :disabled="saving || !data.me"
      @change="set(($event.target as HTMLInputElement).checked)"
    />
    <span>
      Email me about new features
      <span class="block text-xs text-muted">
        {{ data.me?.email ? `Sent to ${data.me.email}.` : "Add an email under Profile to get these." }}
      </span>
    </span>
  </label>
  <p v-if="problem" role="alert" class="m-0 mt-2 font-ui text-sm text-danger">{{ problem }}</p>
  </div>
</template>
