<!--
  The hub's places, on a solid ink rail, top to bottom: the box; the places (what needs you, the
  team's work, support); then each project with its line colour and its open work, taking the rest
  of the rail and scrolling inside it; and you at the foot. The projects used to sit between Needs
  you and the other places, with the box after them all, so the places read as two lists and the
  box moved down as projects were added (2026-11-04).

  A project is a top-level project for now. The light dot beside one means something in it changed
  since you last looked. Coral is where you are, and the box.

  On a desktop it folds to a strip of icons (`small`, kept by HubShell), giving the page the room:
  the places as their icons, each project as its line and first letter, the box as +, and every one
  says its name on hover. A phone's rail is a drawer and never folds, so everything folded is `md:`.
-->
<script setup lang="ts">
import { projectsFrom } from "~/utils/projects";

const props = defineProps<{ small?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const { needsQ, projectsQ, signedIn } = useHub();
const route = useRoute();

const waiting = computed(() => needsQ.data.value?.rows.length ?? 0);
const projects = computed(() => projectsFrom(projectsQ.data.value?.projects ?? []));

const item =
  "flex min-h-8 items-center gap-3 rounded-1 px-3 py-1 font-ui text-sm leading-5 no-underline transition-colors";
const tone = (on: boolean) =>
  on
    ? "bg-rail-current font-medium text-coral"
    : "text-on-rail-muted hover:bg-rail-hover hover:text-on-rail";

const at = {
  needs: computed(() => route.path === "/hub"),
  work: computed(() => route.path === "/hub/work" || route.path.startsWith("/hub/w/")),
  projects: computed(() => route.path === "/hub/projects"),
  settings: computed(() => route.path.startsWith("/hub/settings")),
};
/** The project on the rail that holds the page: a project inside another lights its top one. */
const currentProject = computed(() => {
  const open = route.path.match(/^\/hub\/projects\/([^/]+)/)?.[1] || "";
  const byId = new Map((projectsQ.data.value?.projects ?? []).map((f) => [f.id, f]));
  let f = byId.get(open);
  for (let hops = 0; f?.parent_id && byId.has(f.parent_id) && hops < 64; hops++)
    f = byId.get(f.parent_id);
  return f?.id || open;
});
const isProject = (id: string) => currentProject.value === id;

/** What folding changes, desktop only. A label hidden this way is still read aloud. */
const hide = computed(() => (props.small ? "md:sr-only" : ""));
const fold = computed(() => (props.small ? "md:justify-center md:px-0" : ""));
/** A name said on hover when only an icon shows. */
const tip = (name: string) => (props.small ? name : undefined);

/** Opened, with the cursor in Go to: from the search icon, or ⌘K while folded. */
async function openGoTo() {
  if (props.small) emit("toggle");
  await nextTick();
  document.querySelector<HTMLInputElement>("#hub-goto")?.focus();
}
function onKey(e: KeyboardEvent) {
  if (props.small && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") openGoTo();
}
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <div
    class="rail flex h-full flex-col gap-4 border-r border-rail-line bg-rail px-3 pt-4 pb-3 text-on-rail"
    :class="small ? 'md:px-2' : ''"
  >
    <a
      class="flex items-center gap-2 px-3 py-1 font-ui text-sm font-semibold text-on-rail no-underline"
      :class="fold"
      href="/hub"
      :title="tip('Passalong')"
    >
      <img src="/favicon.svg" alt="" class="size-6" />
      <span :class="hide">Passalong</span>
    </a>
    <HubGoTo v-if="signedIn" :class="small ? 'md:hidden' : ''" />
    <button
      v-if="signedIn && small"
      type="button"
      class="hidden h-8 cursor-pointer items-center justify-center rounded-1 border border-rail-line bg-rail-hover text-on-rail-muted hover:text-on-rail md:flex"
      title="Go to… (⌘K)"
      aria-label="Go to work by its id"
      @click="openGoTo"
    >
      <AppIcon name="search" />
    </button>

    <nav class="flex min-h-0 flex-1 flex-col gap-4" aria-label="Hub">
      <!-- The box: say it in your own words and the agent files it. -->
      <NuxtLink
        to="/hub/new"
        class="btn border-accent bg-accent text-accent-fg hover:border-accent hover:bg-accent hover:opacity-90"
        :class="small ? 'md:px-0' : ''"
        :title="tip('New')"
        :aria-current="route.path === '/hub/new' ? 'page' : undefined"
      >
        <AppIcon name="plus" /><span :class="hide">New</span>
      </NuxtLink>

      <ul class="m-0 flex list-none flex-col gap-0 p-0">
        <li class="m-0">
          <NuxtLink to="/hub" :class="[item, tone(at.needs.value), fold, 'relative']" :title="tip('Needs you')" :aria-current="at.needs.value ? 'page' : undefined">
            <AppIcon name="inbox" />
            <span class="grow" :class="hide">Needs you</span>
            <!-- Folded, the count stays: a badge on the icon, since it is the reason to look. -->
            <span
              v-if="signedIn && waiting"
              class="text-xs tabular-nums"
              :class="small ? 'md:absolute md:top-0 md:right-1 md:rounded-full md:bg-coral md:px-1 md:text-[10px] md:leading-4 md:text-accent-fg' : ''"
            >{{ waiting }}</span>
          </NuxtLink>
        </li>
        <li class="m-0">
          <NuxtLink to="/hub/work" :class="[item, tone(at.work.value), fold]" :title="tip('Work')" :aria-current="at.work.value ? 'page' : undefined">
            <AppIcon name="board" />
            <span class="grow" :class="hide">Work</span>
          </NuxtLink>
        </li>
      </ul>

      <section aria-labelledby="rail-projects" class="flex min-h-0 flex-1 flex-col gap-1">
        <NuxtLink
          id="rail-projects"
          to="/hub/projects"
          class="px-3 font-ui text-xs font-medium tracking-wide uppercase no-underline hover:text-on-rail"
          :class="[at.projects.value ? 'text-coral' : 'text-on-rail-muted', small ? 'md:flex md:justify-center md:px-0' : '']"
          :title="tip('Projects')"
          :aria-current="at.projects.value ? 'page' : undefined"
        >
          <AppIcon v-if="small" name="project" class="hidden md:block" />
          <span :class="hide">Projects</span>
        </NuxtLink>
        <ul v-if="projects.length" class="m-0 flex min-h-0 list-none flex-col gap-0 overflow-y-auto p-0 [scrollbar-width:thin]">
          <li v-for="p in projects" :key="p.id" class="m-0">
            <NuxtLink
              :to="`/hub/projects/${p.id}`"
              :class="[item, tone(isProject(p.id)), small ? 'md:justify-center md:gap-1.5 md:px-0' : '']"
              :title="small ? p.title : undefined"
              :aria-current="isProject(p.id) ? 'page' : undefined"
            >
              <span class="project-mark h-3.5 w-[3px] shrink-0 rounded-[1px]" :data-tone="p.tone" aria-hidden="true" />
              <!-- Folded: the project's first letter beside its line, its name on hover. -->
              <span v-if="small" class="hidden font-medium md:inline" aria-hidden="true">{{ p.title.trim().charAt(0).toUpperCase() }}</span>
              <!-- One line, as every rail row is: a long name ends in "…" and says itself in full on hover.
                   It used to wrap, so one long name took three rows and pushed the list down. -->
              <span class="min-w-0 grow truncate" :class="hide" :title="p.title">{{ p.title }}</span>
              <span v-if="p.changed" class="size-1.5 shrink-0 rounded-full bg-changed" :class="small ? 'md:hidden' : ''" role="img" aria-label="Changed since you last looked" />
              <span v-if="p.open" class="shrink-0 text-xs tabular-nums" :class="small ? 'md:hidden' : ''">{{ p.open }}</span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else-if="projectsQ.isSuccess.value" class="m-0 px-3 font-ui text-xs text-on-rail-muted" :class="small ? 'md:hidden' : ''">
          No projects yet. <NuxtLink to="/hub/projects" class="text-on-rail">Start one</NuxtLink>
        </p>
      </section>
    </nav>

    <div class="flex flex-col gap-0 border-t border-rail-line pt-3">
      <!-- Folding is a desktop thing: a phone's rail is a drawer, closed with the page. -->
      <button
        type="button"
        class="hidden cursor-pointer border-0 bg-transparent text-left md:flex"
        :class="[item, tone(false), fold]"
        :title="small ? 'Expand the sidebar' : undefined"
        :aria-label="small ? 'Expand the sidebar' : 'Collapse the sidebar'"
        :aria-expanded="!small"
        aria-controls="hub-rail"
        @click="emit('toggle')"
      >
        <AppIcon name="rail" />
        <span class="grow" :class="hide">Collapse</span>
      </button>
      <NuxtLink to="/hub/settings" :class="[item, tone(at.settings.value), fold]" :title="tip('Settings')" :aria-current="at.settings.value ? 'page' : undefined">
        <AppIcon name="gear" />
        <span class="grow" :class="hide">Settings</span>
      </NuxtLink>
      <HubAccountMenu v-if="signedIn" :small="small" />
    </div>
  </div>
</template>
