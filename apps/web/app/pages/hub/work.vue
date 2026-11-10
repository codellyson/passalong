<!--
  /hub/work: the team board. Four columns — Draft, Ready, In progress, Done — with Ready's work
  grouped under who it is for (HubBoard). Everyone in the team sees the same board: where a card
  sits is the server's (`stage`, `lanes`), so it moves when the work moves and never because of who
  is looking. A project filter (`?project=`) and Only mine (`?mine=1`) narrow the cards without
  moving any of them. By person, the default, draws Ready's groups as columns of their own;
  `?by=status` keeps them inside Ready.

  `?done=all` shows every finished card.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import {
  BOARD_VIEW_KEY,
  type BoardView,
  nextView,
  readView,
  restoreView,
} from "~/utils/board-view";
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
/** The toggles as this browser last left them (utils/board-view.ts). Storage may be blocked. */
const loadView = (): BoardView => {
  try {
    return readView(localStorage.getItem(BOARD_VIEW_KEY));
  } catch {
    return {};
  }
};
const flip = (patch: Record<string, string | undefined>) => {
  try {
    localStorage.setItem(BOARD_VIEW_KEY, JSON.stringify(nextView(route.query, patch)));
  } catch {}
  return setQuery(patch);
};
// Arriving on a plain /hub/work: the view the person last chose, not the default every time.
onMounted(() => {
  const back = restoreView(route.query, loadView());
  if (back) setQuery(back);
});
const mineOnly = computed({
  get: () => route.query.mine === "1",
  set: (on: boolean) => flip({ mine: on ? "1" : undefined }),
});
/**
 * By person: a column per teammate and group with work waiting, instead of groups inside Ready.
 * On by default (2026-11-04: who has what is the first thing a team looks for). Turned off it is
 * `?by=status`, in the address so the view can be shared; `?by=person` from older links is the
 * default and reads as on.
 */
const byPerson = computed({
  get: () => route.query.by !== "status",
  set: (on: boolean) => flip({ by: on ? undefined : "status" }),
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

// The board groups Ready by teammate, so it is one team's: the only one, or the one picked.
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
/** The team's groups, for Ready's drop targets. The same query Give to… reads. */
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
/** The same board with no filter on, to say how much the filters are hiding. */
const { columns: unfiltered } = useWorkLists(ref(""), ref(""), ref(false), ref(""));
const hidden = computed(() => unfiltered.value.reduce((n, c) => n + c.cards.length, 0));

/** Each filter that is on, to take off one at a time. */
const activeFilters = computed(
  () =>
    [
      q.value.trim() && { key: "q", label: `“${q.value.trim()}”` },
      follows.value && {
        key: "follows",
        label: `From ${followed.value?.title || "one piece of work"}`,
      },
      project.value && {
        key: "project",
        label: project.value === "none" ? "Not in a project" : projectName.value,
      },
      mineOnly.value && { key: "mine", label: "Only mine" },
    ].filter(Boolean) as { key: string; label: string }[],
);
function dropFilter(key: string) {
  if (key === "q") q.value = "";
  setQuery({ [key]: undefined });
}

/**
 * What the filters are, said back when they leave nothing: why, and what would put work here. It
 * was a heading and a lone Clear filter button in a wide empty space, which said what was missing
 * but not why, which filter did it, or what to do about it (2026-11-06).
 */
const emptyFor = computed<{
  icon: "search" | "project" | "filter";
  title: string;
  hint: string;
}>(() => {
  const words = q.value.trim();
  // Several at once: naming one of them as the reason would be a guess, since any could be it.
  if (activeFilters.value.length > 1)
    return {
      icon: "filter",
      title: "Nothing matches these filters together",
      hint: "Each one alone may have work in it. Take one off to see more.",
    };
  if (words)
    return {
      icon: "search",
      title: `Nothing matches “${words}”`,
      hint: "Search looks at titles, summaries, people and tags. Check the spelling, or try fewer words.",
    };
  if (project.value)
    return {
      icon: "project",
      title: `Nothing in ${projectName.value}${mineOnly.value ? " of yours" : ""}`,
      hint:
        project.value === "none"
          ? "Every piece of work on this board is filed in a project."
          : "Work filed in this project shows here. File a piece of work in it from its page.",
    };
  if (mineOnly.value)
    return {
      icon: "filter",
      title: "Nothing of yours on the board",
      hint: "Work you wrote, work sent to you, and work your agents are doing shows here.",
    };
  return {
    icon: "filter",
    title: "Nothing here",
    hint: "No work on this board matches these filters.",
  };
});

/**
 * On a phone the filters fold behind one button beside the search: laid out in full they took
 * three rows, most of the first screen, before a single card (2026-11-06). The button says how many
 * are set, so a folded filter is never a hidden one.
 */
const filtersOpen = ref(false);
const filtersOn = computed(
  () => [project.value, mineOnly.value, people.value && !byPerson.value].filter(Boolean).length,
);
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
      <p v-if="unavailable" class="m-0 border-t border-line-strong py-6 font-ui text-sm text-muted">The board didn't load. Try again from the message above.</p>

      <template v-else>
        <!-- Nothing to filter on an empty board. -->
        <div v-if="waiting || total || filtering" class="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div class="toolbar m-0 min-w-0 flex-1 md:order-last md:ml-auto md:w-64 md:flex-none">
            <input v-model="q" type="search" placeholder="Search work" aria-label="Search work" />
          </div>
          <button
            class="btn shrink-0 md:hidden"
            type="button"
            aria-controls="board-filters"
            :aria-expanded="filtersOpen"
            @click="filtersOpen = !filtersOpen"
          >
            <AppIcon name="filter" />Filters
            <span v-if="filtersOn" class="grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 text-xs font-semibold tabular-nums text-accent-fg">{{ filtersOn }}</span>
          </button>
          <div id="board-filters" class="contents" :class="filtersOpen ? '' : 'max-md:hidden'">
            <AppSelect v-model="project" class="w-56 max-md:w-full" label="Project" :options="projectOptions" :short-at="28" />
            <label class="flex items-center gap-2 font-ui text-sm">
              <input v-model="mineOnly" type="checkbox" />
              Only mine
            </label>
            <label v-if="people" class="flex items-center gap-2 font-ui text-sm">
              <input v-model="byPerson" type="checkbox" />
              By person
            </label>
          </div>
        </div>

        <section
          class="transition-opacity motion-reduce:transition-none"
          :class="scopeChanging ? 'opacity-60' : ''"
          :aria-busy="waiting || scopeChanging"
          aria-label="Team board"
        >
          <HubSkeleton v-if="waiting" :rows="4" label="Loading the board" />

          <div v-else-if="!total && !filtering" class="flex flex-col items-start gap-3 border-t border-line-strong py-10">
            <p class="m-0 text-h3 font-medium">Nothing on the board</p>
            <p class="m-0 max-w-[36rem] font-ui text-sm text-muted">
              Work your team or its agents are doing shows here, from Draft to Done, grouped under
              who it is for.
            </p>
            <NuxtLink to="/hub/new" class="btn primary">New work</NuxtLink>
          </div>

          <!-- Filters that leave nothing: why, which filters did it, and how much they hide. -->
          <div
            v-else-if="!total"
            class="flex flex-col items-center gap-4 rounded-3 border border-dashed border-line-strong px-6 py-12 text-center"
            role="status"
          >
            <span class="grid size-11 place-items-center rounded-full bg-surface text-muted" aria-hidden="true">
              <AppIcon :name="emptyFor.icon" :size="20" />
            </span>
            <div class="flex max-w-[34rem] flex-col gap-1.5">
              <p class="m-0 text-h3 font-medium">{{ emptyFor.title }}</p>
              <p class="m-0 font-ui text-sm text-pretty text-muted">{{ emptyFor.hint }}</p>
            </div>
            <!-- Only with two or more: one filter is the checkbox just above, and Show all work. -->
            <ul v-if="activeFilters.length > 1" class="m-0 flex list-none flex-wrap justify-center gap-2 p-0" aria-label="Filters on">
              <li v-for="f in activeFilters" :key="f.key">
                <button
                  class="inline-flex items-center gap-1.5 rounded-pill border border-line-strong bg-raised py-1 pr-2 pl-3 font-ui text-sm text-fg hover:border-fg"
                  type="button"
                  :aria-label="`Remove the filter: ${f.label}`"
                  @click="dropFilter(f.key)"
                >
                  <span class="max-w-[16rem] truncate">{{ f.label }}</span>
                  <AppIcon name="x" :size="14" class="text-muted" />
                </button>
              </li>
            </ul>
            <div class="flex flex-col items-center gap-1.5">
              <button class="btn" type="button" @click="clearFilters">Show all work</button>
              <p v-if="hidden" class="m-0 font-ui text-xs text-muted">
                {{ hidden }} {{ hidden === 1 ? "piece" : "pieces" }} of work on this board {{ hidden === 1 ? "is" : "are" }} hidden by {{ activeFilters.length === 1 ? "this filter" : "these filters" }}.
              </p>
            </div>
          </div>

          <HubBoard
            v-else
            :columns="columns"
            :people="people"
            :groups="groups"
            :me="me"
            :all-done="route.query.done === 'all'"
            :team="data.team?.name || data.team?.slug || ''"
            :by-person="byPerson && Boolean(people)"
          />
        </section>
      </template>
    </div>
  </HubShell>
</template>
