<!--
  Guides as a table: handoffs and bugs you sent, and the finished ones on the Done tab. Same shape
  as Needs you, Taken and the task lists. A bug report is one row that opens to its bugs; everything
  a row can do sits on the row, and an answer it asks for opens in a row beneath it.
-->
<script setup lang="ts">
import type { LaneRow, SentEntry } from "~/utils/lanes";

defineProps<{
  entries: (SentEntry | LaneRow)[];
  /** A search is running: reports show what matched. */
  open?: boolean;
}>();
</script>

<template>
  <div class="rounded-3 bg-raised shadow-edge">
    <table class="rows stack m-0 w-full font-ui text-sm">
      <thead>
        <tr class="text-xs text-muted">
          <th class="w-8"><span class="sr-only">Select</span></th>
          <th>Guide</th>
          <th class="hidden md:table-cell">What it says</th>
          <th class="hidden md:table-cell">Who</th>
          <th>State</th>
          <th>Age</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="e in entries" :key="'g' in e ? e.g.id : 'row' in e ? e.row.g.id : `report-${e.group.report}`">
          <HubInboxRow v-if="'g' in e" :row="e" />
          <HubInboxRow v-else-if="'row' in e" :row="e.row" />
          <HubReportRow v-else :group="e.group" :open="open" />
        </template>
      </tbody>
    </table>
  </div>
</template>
