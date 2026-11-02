<!--
  One block of Settings: a title at 550 over the block's one ink rule, a line saying what it is
  for, then its rows. Registers inside a block put a hairline under their column labels, because
  the block's ink rule already heads them: one ink rule per block. `level` is 3 for a block inside
  a team, whose own name is the h2.
-->
<script setup lang="ts">
withDefaults(defineProps<{ id: string; title: string; blurb?: string; level?: 2 | 3 }>(), {
  blurb: "",
  level: 2,
});
</script>

<template>
  <section :id="id" class="flex scroll-mt-20 flex-col" :aria-labelledby="`${id}-h`">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-fg pb-2">
      <component
        :is="`h${level}`"
        :id="`${id}-h`"
        class="m-0 font-ui font-semibold tracking-normal text-fg"
        :class="level === 2 ? 'text-base' : 'text-sm'"
      >{{ title }}</component>
      <slot name="action" />
    </div>
    <p v-if="blurb" class="m-0 mt-3 max-w-[44rem] font-ui text-sm text-muted">{{ blurb }}</p>
    <div class="flex min-w-0 flex-col" :class="blurb ? 'mt-1' : ''">
      <slot />
    </div>
  </section>
</template>
