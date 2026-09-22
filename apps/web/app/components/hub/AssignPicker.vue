<!--
  Who something is for, and the choice to give it to someone else in its team — open to its author,
  and to whoever it is assigned to.

  The choices are the team as a whole, each teammate, and each group. A teammate with no @name is
  picked by their account id, which the server accepts as an address. Choosing
  calls POST /v1/guides/:id/assign; whoever held it and is left out has it taken back and is told,
  which the note under the list says before anyone presses anything.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { TeamDetail } from "~/types/hub";

const props = defineProps<{ id: string; team: string; to?: string }>();
const emit = defineEmits<{ done: [] }>();
const { api, onAssign, signedIn } = useHub();

const detail = useQuery({
  queryKey: computed(() => hubKeys.team(props.team)),
  queryFn: async () =>
    (await api<TeamDetail>(`/v1/teams/${encodeURIComponent(props.team)}`)) as TeamDetail,
  enabled: signedIn,
});
const groups = useQuery({
  queryKey: computed(() => ["assign-groups", props.team]),
  queryFn: async () =>
    (
      await api<{ groups: { slug: string; name: string }[] }>(
        `/v1/teams/${encodeURIComponent(props.team)}/groups`,
      ).catch(() => null)
    )?.groups ?? [],
  enabled: signedIn,
});

const choices = computed(() => {
  const d = detail.data.value;
  const seen = new Set<string>();
  const people = (d?.members ?? [])
    .filter((m) => m.handle || m.id)
    .map((m) => ({
      to: `@${m.handle || m.id}`,
      label: m.display || personName(m.name, m.handle, m.id),
      hint: m.handle ? `@${m.handle}` : "no @name",
    }));
  const teams = (groups.data.value ?? [])
    .filter((g) => !seen.has(g.slug) && seen.add(g.slug))
    .map((g) => ({ to: `#${g.slug}`, label: g.name || g.slug, hint: `#${g.slug}` }));
  return [
    { to: "", label: `Everyone in ${d?.name || props.team}`, hint: "the team" },
    ...people,
    ...teams,
  ];
});

const busy = ref(false);
async function pick(to: string) {
  if (to === (props.to ?? "") || busy.value) return emit("done");
  busy.value = true;
  await onAssign(props.id, to);
  busy.value = false;
  emit("done");
}
</script>

<template>
  <div class="flex flex-col gap-0.5" role="group" aria-label="Give it to">
    <p class="menu-note mt-0 mb-1">Give it to:</p>
    <p v-if="detail.isPending.value" class="menu-note">Loading the team…</p>
    <button
      v-for="c in choices"
      :key="c.to || 'team'"
      type="button"
      class="menu-item justify-between"
      :aria-current="c.to === (props.to ?? '') ? 'true' : undefined"
      :disabled="busy"
      @click="pick(c.to)"
    >
      <span class="flex min-w-0 items-center gap-2">
        <AppIcon v-if="c.to === (props.to ?? '')" name="check" class="shrink-0 text-ok" />
        <span class="truncate" :class="c.to === (props.to ?? '') ? 'font-semibold' : ''">{{ c.label }}</span>
      </span>
      <span class="shrink-0 font-code text-xs text-muted">{{ c.hint }}</span>
    </button>
    <p class="menu-note">Whoever has it now and is left out gets it taken back, and is told.</p>
  </div>
</template>
