<!--
  /hub/work: the team board. Every piece of work in the team is a card, and everyone in the
  team sees the same board: in a team, Draft, To do, a column per teammate and group, In progress
  and Done, like a Trello board with a list per person; across all teams, the four stages. Where a
  card sits is the server's (`stage`, `lanes`), so it moves when the work moves and never because
  of who is looking. "Show only mine" narrows the cards without moving any of them.

  It used to be four tabs (Needs you, Being worked on, Open, Done) worked out for each viewer, so
  two teammates saw the same work in different places and counted it differently.

  /hub/guides, /hub/tasks and a /hub link carrying a work query redirect here with that query, so
  `?q=` and `?follows=` links still work. `?mine=1` opens the board narrowed to your cards; an old
  `?tab=needs` link does the same, since that tab was the cards about you.
-->
<script setup lang="ts">
import { ASKS } from "~/utils/asks";

usePage({
  title: "Work · Passalong",
  description: "Everything your team is doing, on one board.",
  noindex: true,
});

const { data, updating, scopeChanging } = useHub();

const route = useRoute();
const text = (v: unknown) => (typeof v === "string" ? v : "");
/** Seeded from the URL so a link elsewhere can open a search; watched, because a link on this page
    changes the query without remounting it. */
const q = ref(text(route.query.q));
watch(
  () => route.query.q,
  (v) => {
    q.value = text(v);
  },
);
/** `?follows=<id>`: work naming it as its parent. */
const follows = computed(() => text(route.query.follows));
const followed = computed(() =>
  follows.value ? data.value.guides.find((g) => g.id === follows.value) || null : null,
);
const mineOnly = computed({
  get: () => route.query.mine === "1" || route.query.tab === "needs",
  set: (on: boolean) =>
    navigateTo(
      { query: { ...route.query, mine: on ? "1" : undefined, tab: undefined } },
      { replace: true },
    ),
});
// The board has a column per teammate, so it is one team's: the only one, or the one picked.
const scope = useState<string>("hub:scope");
watchEffect(() => {
  const teams = data.value.me?.teams ?? [];
  if (!data.value.team && scope.value === "all" && teams.length === 1) scope.value = teams[0]!.slug;
});
/** On by default; off (`?by=stage`) snaps the board back to the four stages, everyone's together. */
const byPerson = computed({
  get: () => route.query.by !== "stage",
  set: (on: boolean) =>
    navigateTo({ query: { ...route.query, by: on ? undefined : "stage" } }, { replace: true }),
});
const people = computed(() =>
  byPerson.value && data.value.team
    ? data.value.team.members
        .filter((m) => m.id)
        .map((m) => ({
          id: m.id as string,
          label: m.display || personName(m.name, m.handle, m.id),
          to: `@${m.handle || m.id}`,
        }))
    : null,
);
const searching = computed(() => Boolean(q.value.trim() || follows.value || mineOnly.value));
function clearSearch() {
  q.value = "";
  navigateTo(
    {
      query: { ...route.query, q: undefined, follows: undefined, mine: undefined, tab: undefined },
    },
    { replace: true },
  );
}
const { unavailable, waiting, hasTeams, columns } = useWorkLists(q, follows, mineOnly);
const empty = computed(() => columns.value.every((c) => !c.cards.length));
</script>

<template>
  <HubShell>
    <div class="flex flex-col gap-6">
      <h1 class="m-0 flex flex-wrap items-center gap-2 text-h2">
        Work<template v-if="hasTeams"> in <HubScopes /></template>
        <span v-if="updating || scopeChanging" role="status" class="font-ui text-sm font-normal text-muted">Updating…</span>
      </h1>

      <!-- Named: the filter is only useful if you can see which work it is. -->
      <p v-if="follows" class="m-0 font-ui text-sm text-muted">
        Work from
        <b class="font-medium text-fg">{{ followed?.title || "this work" }}</b>
        ·
        <NuxtLink to="/hub/work">Show all work</NuxtLink>
      </p>

      <!-- A list that failed to load draws nothing rather than its empty state: the shell's banner
           already says what happened and offers Try again. -->
      <template v-if="!unavailable">
        <div class="flex flex-wrap items-center gap-3">
          <div class="toolbar m-0 w-full min-w-[12rem] sm:w-auto sm:max-w-xs">
            <input v-model="q" type="search" placeholder="Search work" aria-label="Search work" />
          </div>
          <label class="flex items-center gap-2 font-ui text-sm">
            <input v-model="mineOnly" type="checkbox" />
            Show only mine
          </label>
          <label v-if="data.team" class="flex items-center gap-2 font-ui text-sm">
            <input v-model="byPerson" type="checkbox" />
            By person
          </label>
        </div>

        <section
          class="transition-opacity"
          :class="scopeChanging ? 'opacity-60' : ''"
          :aria-busy="waiting || scopeChanging"
          aria-label="Team board"
        >
          <HubSkeleton v-if="waiting" :rows="3" label="Loading work" />
          <template v-else>
            <p v-if="empty" class="m-0 mb-4 font-ui text-sm text-muted">
              {{ searching ? "Nothing matches." : "Nothing on the board yet." }}
              <button v-if="searching" class="linkish" type="button" @click="clearSearch">Clear search</button>
              <button v-else class="linkish" type="button" @click="copy(ASKS.work, $event.currentTarget)">
                <span data-label>Copy a prompt for your agent</span>
              </button>
            </p>
            <HubBoard :columns="columns" :people="people" />
            <HubBulkBar />
          </template>
        </section>
      </template>
    </div>
  </HubShell>
</template>
