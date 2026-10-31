<!--
  /hub/work: the team board. Four columns — Draft, To do, In progress, Done — with To do's work
  grouped under who it is for (HubBoard). Everyone in the team sees the same board: where a card
  sits is the server's (`stage`, `lanes`), so it moves when the work moves and never because of who
  is looking. A project filter (`?project=`) and Only mine (`?mine=1`) narrow the cards without
  moving any of them.

  `?done=all` shows every finished card.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { projectsFrom } from "~/utils/projects";

usePage({
  title: "Work · Passalong",
  description: "Everything your team is doing, on one board.",
  noindex: true,
});

const { data, updating, scopeChanging, projectsQ, api, signedIn } = useHub();

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
const setQuery = (patch: Record<string, string | undefined>) =>
  navigateTo({ query: { ...route.query, ...patch } }, { replace: true });
/** `?follows=<id>`: work naming it as its parent. */
const follows = computed(() => text(route.query.follows));
const followed = computed(() =>
  follows.value ? data.value.work.find((g) => g.id === follows.value) || null : null,
);
const mineOnly = computed({
  get: () => route.query.mine === "1",
  set: (on: boolean) => setQuery({ mine: on ? "1" : undefined }),
});
const project = computed({
  get: () => text(route.query.project),
  set: (id: string) => setQuery({ project: id || undefined }),
});
const projects = computed(() => projectsFrom(projectsQ.data.value?.projects ?? []));
const projectOptions = computed(() => [
  { value: "", label: "All projects" },
  ...projects.value.map((p) => ({ value: p.id, label: p.title })),
  { value: "none", label: "Not in a project" },
]);
const projectName = computed(() =>
  project.value === "none"
    ? "no project"
    : projects.value.find((p) => p.id === project.value)?.title || "this project",
);

// The board groups To do by teammate, so it is one team's: the only one, or the one picked.
const scope = useState<string>("hub:scope");
watchEffect(() => {
  const teams = data.value.me?.teams ?? [];
  if (!data.value.team && scope.value === "all" && teams.length === 1) scope.value = teams[0]!.slug;
});
const people = computed(() =>
  data.value.team
    ? data.value.team.members
        .filter((m) => m.id)
        .map((m) => ({
          id: m.id as string,
          label: m.display || personName(m.name, m.handle, m.id),
          to: `@${m.handle || m.id}`,
        }))
    : null,
);
/** The team's groups, for To do's drop targets. The same query Give to… reads. */
const teamSlug = computed(() => data.value.team?.slug ?? "");
const groupsQ = useQuery({
  queryKey: computed(() => ["assign-groups", teamSlug.value]),
  queryFn: async () =>
    (
      await api<{ groups: { slug: string; name: string }[] }>(
        `/v1/teams/${encodeURIComponent(teamSlug.value)}/groups`,
      ).catch(() => null)
    )?.groups ?? [],
  enabled: computed(() => signedIn.value && Boolean(teamSlug.value)),
});
const groups = computed(() => (groupsQ.data.value ?? []).filter((g) => !g.slug.startsWith("~")));
const me = computed(() => {
  const m = data.value.me;
  return m ? { id: m.account, to: `@${m.handle || m.account}` } : null;
});

const { unavailable, waiting, hasTeams, columns } = useWorkLists(q, follows, mineOnly, project);
const count = (id: string) => columns.value.find((c) => c.id === id)?.cards.length ?? 0;
const total = computed(() => columns.value.reduce((n, c) => n + c.cards.length, 0));
const filtering = computed(() =>
  Boolean(q.value.trim() || follows.value || mineOnly.value || project.value),
);
const changed = computed(
  () => columns.value.flatMap((c) => c.cards).filter((g) => g.changed).length,
);
/** The heading's one line: what is waiting and moving, and what changed. */
const summary = computed(() =>
  [
    count("todo") && `${count("todo")} to do`,
    count("working") && `${count("working")} in progress`,
    changed.value && `${changed.value} changed since you last looked`,
  ]
    .filter(Boolean)
    .join(" · "),
);
/** What the filters are, said back when they leave nothing. */
const emptyFor = computed(() => {
  if (q.value.trim()) return `Nothing matches “${q.value.trim()}”`;
  if (project.value) return `Nothing in ${projectName.value}${mineOnly.value ? " of yours" : ""}`;
  if (mineOnly.value) return "Nothing of yours on the board";
  return "Nothing here";
});
function clearFilters() {
  q.value = "";
  setQuery({
    q: undefined,
    follows: undefined,
    mine: undefined,
    project: undefined,
  });
}
</script>

<template>
  <HubShell>
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-1">
        <h1 class="m-0 flex flex-wrap items-center gap-2 text-h2 font-medium tracking-tight">
          Work<template v-if="hasTeams"> in <HubScopes /></template>
          <span v-if="updating || scopeChanging" role="status" class="font-ui text-sm font-normal text-muted">Updating…</span>
        </h1>
        <p v-if="!waiting && !unavailable && summary" class="m-0 font-ui text-sm text-pretty text-muted">{{ summary }}</p>
      </div>

      <!-- Named: the filter is only useful if you can see which work it is. -->
      <p v-if="follows" class="m-0 font-ui text-sm text-muted">
        Work from
        <b class="font-medium text-fg">{{ followed?.title || "this work" }}</b>
        ·
        <NuxtLink to="/hub/work">Show all work</NuxtLink>
      </p>

      <!-- The shell's banner says what failed and offers Try again; the board says only that it
           is not here, rather than drawing an empty board that was never loaded. -->
      <p v-if="unavailable" class="m-0 border-t border-fg py-6 font-ui text-sm text-muted">The board didn't load. Try again from the message above.</p>

      <template v-else>
        <!-- Nothing to filter on an empty board. -->
        <div v-if="waiting || total || filtering" class="flex flex-wrap items-center gap-x-4 gap-y-3">
          <AppSelect v-model="project" class="w-56" label="Project" :options="projectOptions" :short-at="28" />
          <label class="flex items-center gap-2 font-ui text-sm">
            <input v-model="mineOnly" type="checkbox" />
            Only mine
          </label>
          <div class="toolbar m-0 w-full sm:ml-auto sm:w-64">
            <input v-model="q" type="search" placeholder="Search work" aria-label="Search work" />
          </div>
        </div>

        <section
          class="transition-opacity motion-reduce:transition-none"
          :class="scopeChanging ? 'opacity-60' : ''"
          :aria-busy="waiting || scopeChanging"
          aria-label="Team board"
        >
          <HubSkeleton v-if="waiting" :rows="4" label="Loading the board" />

          <div v-else-if="!total && !filtering" class="flex flex-col items-start gap-3 border-t border-fg py-10">
            <p class="m-0 text-h3 font-medium">Nothing on the board</p>
            <p class="m-0 max-w-[36rem] font-ui text-sm text-muted">
              Work your team or its agents are doing shows here, from Draft to Done, grouped under
              who it is for.
            </p>
            <NuxtLink to="/hub/new" class="btn primary">New work</NuxtLink>
          </div>

          <div v-else-if="!total" class="flex flex-col items-start gap-3 border-t border-fg py-10">
            <p class="m-0 text-h3 font-medium">{{ emptyFor }}</p>
            <button class="btn sm" type="button" @click="clearFilters">Clear filter</button>
          </div>

          <HubBoard
            v-else
            :columns="columns"
            :people="people"
            :groups="groups"
            :me="me"
            :all-done="route.query.done === 'all'"
            :team="data.team?.name || data.team?.slug || ''"
          />
        </section>
      </template>
    </div>
  </HubShell>
</template>
