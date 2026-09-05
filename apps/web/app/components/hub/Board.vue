<!-- The state of your transfers, in the order you can do something about them. -->
<script setup lang="ts">
const { data } = useHub();
const board = computed(() => data.value.board);
</script>

<template>
  <div v-if="board" class="board">
    <HubCard
      cls="failing"
      title="Not working"
      note="someone tried it and it does not hold up"
      :guides="board.failing"
      action="link"
    />
    <HubCard
      cls="waiting"
      title="Waiting on you"
      note="handed to you, not pulled yet"
      :guides="board.waiting"
      action="pull"
    />
    <HubCard
      cls="flight"
      title="In flight"
      note="handed over, nobody has taken it"
      :guides="board.in_flight"
      action="link"
    />
    <HubCard
      cls="landed"
      title="Landed"
      note="someone has it and hasn't said it shipped"
      :guides="board.landed"
      action="done"
    />
    <HubCard
      cls="promote"
      title="Worth keeping"
      note="pulled enough to graduate into a reference"
      :guides="board.promote"
      action="promote"
    />
  </div>
</template>
