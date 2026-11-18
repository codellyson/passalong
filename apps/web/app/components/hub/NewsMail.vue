<!--
  Settings: one switch for a mail to this account, not per device: it is mail. `news_mail` is the
  occasional mail about what's new in Passalong (apps/api/src/announcements.ts), the same thing the
  "Stop product news" link in each of those mails turns off; `week_mail` is Monday's mail of what was
  finished last week (apps/api/src/week.ts).
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{ field?: "news_mail" | "week_mail"; label?: string }>(), {
  field: "news_mail",
  label: "Email me about new features",
});
const { data, api, json, setMe } = useHub();
const on = computed(() => data.value.me?.[props.field] !== false);
const saving = ref(false);
const problem = ref("");

async function set(next: boolean) {
  const me = data.value.me;
  if (!me) return;
  problem.value = "";
  saving.value = true;
  // Moves at once and goes back if the server says no, like every other switch in the hub.
  setMe({ ...me, [props.field]: next });
  try {
    await api("/v1/me", json("PATCH", { [props.field]: next }));
  } catch (e) {
    setMe({ ...me, [props.field]: !next });
    problem.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
  <label class="flex items-start gap-2 font-ui text-sm">
    <input
      type="checkbox"
      class="mt-1"
      :checked="on"
      :disabled="saving || !data.me"
      @change="set(($event.target as HTMLInputElement).checked)"
    />
    <span>
      {{ label }}
      <span class="block text-xs text-muted">
        {{ data.me?.email ? `Sent to ${data.me.email}.` : "Add an email under Profile to get these." }}
      </span>
    </span>
  </label>
  <p v-if="problem" role="alert" class="m-0 mt-2 font-ui text-sm text-danger">{{ problem }}</p>
  </div>
</template>
