<!-- An invite link is the only entry that leads anywhere for someone with no team. -->
<script setup lang="ts">
defineProps<{ label: string }>();

function go(e: Event) {
  const code = field(e.target as HTMLFormElement, "invite")
    .split("/")
    .pop();
  if (code) location.assign(`/join/${encodeURIComponent(code)}`);
}
</script>

<template>
  <form class="invite-paste" @submit.prevent="go">
    <input
      class="grow"
      name="invite"
      placeholder="paste an invite link"
      :aria-label="label"
      spellcheck="false"
    />
    <button class="btn" type="submit">Join</button>
  </form>
</template>
