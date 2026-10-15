<!-- Local review page; remove before committing. -->
<script setup lang="ts">
const folderScope = ref("all");
const linkedGuide = ref("");
</script>

<template>
  <main class="mx-auto flex max-w-[75rem] flex-col gap-8 px-6 py-10">
    <div>
      <p class="m-0 font-ui text-sm text-muted">Local preview · sample data</p>
      <h1 class="m-0 text-h2">Work in Khaime</h1>
    </div>
    <section class="rounded-3 bg-surface-raised p-5 shadow-edge">
      <h2 class="mt-0 text-h3">Folder controls</h2>
      <div class="flex items-center gap-2 font-ui text-sm text-muted">Show
        <AppSelect v-model="folderScope" class="min-w-36" label="Show folders in" :options="[{ value: 'all', label: 'All folders' }, { value: 'mine', label: 'Only me' }, { value: 'khaime', label: 'Khaime' }]" />
      </div>
      <div class="mt-6 max-w-72">
        <h3 class="text-h3">Guides</h3>
        <p class="font-ui text-sm text-muted">Link a task or handoff that uses this folder.</p>
        <div class="flex gap-2"><AppSelect v-model="linkedGuide" class="min-w-0 flex-1" label="Guide to link" placeholder="Choose a guide" :options="[{ value: 'shipment', label: 'Sales order shipment and delivery note visibility' }, { value: 'support', label: 'Support inbox handoff' }]" :short-at="20" /><button class="btn" type="button" :disabled="!linkedGuide">Link</button></div>
      </div>
    </section>
  </main>
</template>
