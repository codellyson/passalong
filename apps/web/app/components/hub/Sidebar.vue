<!--
  The hub's places, on a solid ink rail: what needs you, each project with its line colour and its
  open work, the team's work and support, the box, and you at the foot.

  A project is a top-level folder for now. The light dot beside one means something in it changed
  since you last looked. Coral is where you are, and the box.
-->
<script setup lang="ts">
import { projectsFrom } from "~/utils/projects";

const { needsQ, projectsQ, signedIn } = useHub();
const route = useRoute();

const waiting = computed(() => needsQ.data.value?.rows.length ?? 0);
const projects = computed(() => projectsFrom(projectsQ.data.value?.folders ?? []));

const item =
  "flex min-h-8 items-center gap-3 rounded-1 px-3 py-1 font-ui text-sm leading-5 no-underline transition-colors";
const tone = (on: boolean) =>
  on
    ? "bg-rail-current font-medium text-coral"
    : "text-on-rail-muted hover:bg-rail-hover hover:text-on-rail";

const at = {
  needs: computed(() => route.path === "/hub"),
  work: computed(
    () =>
      route.path === "/hub/work" ||
      route.path.startsWith("/hub/g/") ||
      route.path.startsWith("/hub/answer"),
  ),
  support: computed(() => route.path.startsWith("/hub/support")),
  projects: computed(() => route.path === "/hub/projects"),
  settings: computed(() => route.path.startsWith("/hub/settings")),
};
/** The project on the rail that holds the page: a project inside another lights its top one. */
const currentProject = computed(() => {
  const open = route.path.match(/^\/hub\/projects\/([^/]+)/)?.[1] || "";
  const byId = new Map((projectsQ.data.value?.folders ?? []).map((f) => [f.id, f]));
  let f = byId.get(open);
  for (let hops = 0; f?.parent_id && byId.has(f.parent_id) && hops < 64; hops++)
    f = byId.get(f.parent_id);
  return f?.id || open;
});
const isProject = (id: string) => currentProject.value === id;
</script>

<template>
  <div class="rail flex h-full flex-col gap-4 bg-rail px-3 pt-4 pb-3 text-on-rail">
    <a class="flex items-center gap-2 px-3 py-1 font-ui text-sm font-semibold text-on-rail no-underline" href="/hub">
      <img src="/favicon.svg" alt="" class="size-6" />
      <span>Passalong</span>
    </a>
    <HubGoTo v-if="signedIn" />

    <nav class="flex min-h-0 flex-1 flex-col gap-4" aria-label="Hub">
      <NuxtLink to="/hub" :class="[item, tone(at.needs.value)]" :aria-current="at.needs.value ? 'page' : undefined">
        <AppIcon name="inbox" />
        <span class="grow">Needs you</span>
        <span v-if="signedIn && waiting" class="text-xs tabular-nums">{{ waiting }}</span>
      </NuxtLink>

      <section aria-labelledby="rail-projects" class="flex min-h-0 flex-col gap-1">
        <NuxtLink
          id="rail-projects"
          to="/hub/projects"
          class="px-3 font-ui text-xs font-medium tracking-wide uppercase no-underline hover:text-on-rail"
          :class="at.projects.value ? 'text-coral' : 'text-on-rail-muted'"
          :aria-current="at.projects.value ? 'page' : undefined"
        >
          Projects
        </NuxtLink>
        <ul v-if="projects.length" class="m-0 flex min-h-0 list-none flex-col gap-0 overflow-y-auto p-0 [scrollbar-width:thin]">
          <li v-for="p in projects" :key="p.id" class="m-0">
            <NuxtLink
              :to="`/hub/projects/${p.id}`"
              :class="[item, tone(isProject(p.id))]"
              :aria-current="isProject(p.id) ? 'page' : undefined"
            >
              <span class="project-mark h-3.5 w-[3px] shrink-0 rounded-[1px]" :data-tone="p.tone" aria-hidden="true" />
              <span class="min-w-0 grow break-words">{{ p.title }}</span>
              <span v-if="p.changed" class="size-1.5 shrink-0 rounded-full bg-changed" role="img" aria-label="Changed since you last looked" />
              <span v-if="p.open" class="text-xs tabular-nums">{{ p.open }}</span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else-if="projectsQ.isSuccess.value" class="m-0 px-3 font-ui text-xs text-on-rail-muted">
          No projects yet. <NuxtLink to="/hub/projects" class="text-on-rail">Start one</NuxtLink>
        </p>
      </section>

      <ul class="m-0 flex list-none flex-col gap-0 p-0">
        <li class="m-0">
          <NuxtLink to="/hub/work" :class="[item, tone(at.work.value)]" :aria-current="at.work.value ? 'page' : undefined">
            <AppIcon name="board" />
            <span class="grow">Work</span>
          </NuxtLink>
        </li>
        <li class="m-0">
          <NuxtLink to="/hub/support" :class="[item, tone(at.support.value)]" :aria-current="at.support.value ? 'page' : undefined">
            <AppIcon name="support" />
            <span class="grow">Support</span>
          </NuxtLink>
        </li>
      </ul>

      <!-- The box: say it in your own words and the agent files it. -->
      <NuxtLink
        to="/hub/new"
        class="btn border-accent bg-accent text-accent-fg hover:border-accent hover:bg-accent hover:opacity-90"
        :aria-current="route.path === '/hub/new' ? 'page' : undefined"
      >
        <AppIcon name="plus" />New
      </NuxtLink>
    </nav>

    <div class="flex flex-col gap-0 border-t border-rail-line pt-3">
      <NuxtLink to="/hub/settings" :class="[item, tone(at.settings.value)]" :aria-current="at.settings.value ? 'page' : undefined">
        <AppIcon name="gear" />
        <span class="grow">Settings</span>
      </NuxtLink>
      <HubAccountMenu v-if="signedIn" />
    </div>
  </div>
</template>
