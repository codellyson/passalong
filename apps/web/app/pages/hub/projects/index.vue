<!--
  Projects: one per product or repo (docs/LOOP.md §0), each with its line colour, what it is in a
  line, its open work, its documents and when it last changed, as a register like Needs you. A
  project is a top-level folder; folders inside it count towards it and are reached from its page.

  Coral is the one meaning it has in the hub: something in the project changed since you last
  looked — news on its work, or a document someone else saved since you last opened it.
-->
<script setup lang="ts">
import type { Folder } from "~/types/folder";
import { newProjectAsk } from "~/utils/asks";
import { age, projectsFrom } from "~/utils/projects";

usePage({
  title: "Projects · Passalong",
  description: "Each product or repo, with what to know about it and the work in it.",
  noindex: true,
});

const { api, json, data, projectsQ } = useHub();
const route = useRoute();

const projects = computed(() => projectsFrom(projectsQ.data.value?.folders ?? []));
const teams = computed(() => data.value.me?.teams ?? []);
const changedCount = computed(() => projects.value.filter((p) => p.changed).length);
const openCount = computed(() => projects.value.reduce((n, p) => n + p.open, 0));
const summary = computed(() => {
  const n = projects.value.length;
  const parts = [`${n} project${n === 1 ? "" : "s"}`];
  if (openCount.value) parts.push(`${openCount.value} open work`);
  if (changedCount.value) parts.push(`${changedCount.value} changed since you last looked`);
  return parts.join(" · ");
});
const prompt = computed(() => newProjectAsk(teams.value[0]?.name));

const now = ref(Date.now());
const creating = ref(false);
const busy = ref(false);
const problem = ref("");
const notice = ref("");

// A project deleted from its own page lands here: say so, then drop the query so a reload is quiet.
onMounted(() => {
  const deleted = route.query.deleted;
  if (typeof deleted === "string" && deleted) {
    notice.value = `Deleted ${deleted} and everything in it.`;
    navigateTo({ query: {} }, { replace: true });
  }
});

async function create(form: HTMLFormElement) {
  const title = field(form, "title").trim();
  if (!title) return;
  busy.value = true;
  problem.value = "";
  try {
    const got = await api<{ folder: Folder }>(
      "/v1/folders",
      json("POST", {
        title,
        description: field(form, "description").trim(),
        team: field(form, "space"),
      }),
    );
    await projectsQ.refetch();
    if (got?.folder.id) await navigateTo(`/hub/projects/${got.folder.id}`);
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

const label = "font-ui text-[0.6875rem] font-medium tracking-wider text-muted uppercase";
const cols = "@2xl:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_minmax(0,15rem)]";
</script>

<template>
  <HubShell>
    <section aria-labelledby="projects-h" class="@container flex min-w-0 flex-col">
      <!-- The title and its one act share a line; the summary sits under them, and the list starts a
           clear step lower, so the head reads as the page's and not as the table's. -->
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 id="projects-h" class="m-0 text-h2 font-medium tracking-tight">Projects</h1>
        <button
          v-if="projects.length"
          type="button"
          class="btn primary sm"
          :aria-expanded="creating"
          aria-controls="new-project"
          @click="creating = !creating"
        >
          New project
        </button>
      </div>
      <p v-if="projects.length" class="m-0 mt-1 font-ui text-sm text-muted">{{ summary }}</p>
      <div class="h-8" aria-hidden="true" />

      <p v-if="notice" role="status" class="m-0 mb-4 border-t border-line pt-3 font-ui text-sm">{{ notice }}</p>

      <!-- The plain way: a name, a line saying what it is, and whose it is. -->
      <form
        v-if="creating || (projectsQ.isSuccess.value && !projects.length)"
        id="new-project"
        class="mb-8 flex flex-col gap-3 rounded-3 border border-line bg-raised px-4 py-4"
        :class="!projects.length ? 'order-last' : ''"
        @submit.prevent="create($event.target as HTMLFormElement)"
      >
        <h2 class="m-0 border-b border-fg pb-2 font-ui text-sm font-semibold tracking-normal">
          {{ projects.length ? "New project" : "Or start one yourself" }}
        </h2>
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_12rem]">
          <label class="flex flex-col gap-2 font-ui text-sm">
            <span class="text-muted">Name</span>
            <input name="title" maxlength="100" required placeholder="Billing app" />
          </label>
          <label class="flex flex-col gap-2 font-ui text-sm">
            <span class="text-muted">What it is, in a line</span>
            <input name="description" maxlength="400" placeholder="The app customers pay us through" />
          </label>
          <label class="flex flex-col gap-2 font-ui text-sm">
            <span class="text-muted">Who sees it</span>
            <select name="space">
              <option v-for="t in teams" :key="t.slug" :value="t.slug">{{ t.name || t.slug }}</option>
              <option value="">Only me</option>
            </select>
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <button class="btn primary sm" type="submit" :disabled="busy">{{ busy ? "Starting…" : "Start project" }}</button>
          <button v-if="projects.length" class="btn sm" type="button" @click="creating = false">Cancel</button>
          <p v-if="problem" role="alert" class="m-0 font-ui text-sm text-danger">{{ problem }}</p>
        </div>
      </form>

      <HubSkeleton v-if="projectsQ.isPending.value" :rows="4" label="Loading projects" />

      <div
        v-else-if="projectsQ.isError.value && !projects.length"
        role="alert"
        class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3"
      >
        <div class="min-w-0 grow basis-64">
          <p class="m-0 font-ui text-sm font-semibold text-danger">Your projects didn't load</p>
          <p class="mt-1 mb-0 font-ui text-sm text-muted">{{ projectsQ.error.value?.message }}</p>
        </div>
        <button class="btn outline danger sm" type="button" @click="projectsQ.refetch()">Try again</button>
      </div>

      <div v-else-if="!projects.length" class="flex flex-col gap-4 border-t border-fg py-10">
        <p class="m-0 text-h3 font-medium">Start with one product.</p>
        <p class="m-0 max-w-[40rem] font-ui text-sm text-muted">
          A project holds what to know about a product — its README, a page per area, the files that
          go with it — and the work on it. The quickest start is your agent: it knows the product and
          writes the first pages.
        </p>
        <div class="flex max-w-[44rem] flex-wrap items-center gap-3 rounded-2 border border-line bg-field px-4 py-3">
          <p class="m-0 min-w-0 flex-1 font-ui text-sm">“{{ prompt }}”</p>
          <button class="btn sm" type="button" @click="copy(prompt, $event.currentTarget)"><span data-label>Copy</span></button>
        </div>
        <p class="m-0 font-ui text-sm text-muted">No agent connected yet? <a href="/connect">Connect one</a>.</p>
      </div>

      <template v-else>
        <!-- Labels once, quiet: a hairline under them, so the list belongs to the page. -->
        <div aria-hidden="true" class="hidden gap-x-3 border-b border-line px-4 pb-2 @2xl:grid" :class="[cols, label]">
          <span>Project</span><span class="text-right">Open work</span><span class="text-right">Documents</span><span class="text-right">Last change</span>
        </div>
        <ol class="m-0 list-none border-t border-line p-0 @2xl:border-t-0">
          <!-- The whole row opens the project: the title's link is stretched over it. The project's
               colour bar already marks each row, so a change is said in words, not a second bar. -->
          <li
            v-for="p in projects"
            :key="p.id"
            class="relative flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line px-4 py-3 hover:bg-raised @2xl:grid @2xl:items-baseline"
            :class="cols"
          >
            <div class="min-w-0 basis-full @2xl:basis-auto">
              <p class="m-0 flex flex-wrap items-baseline gap-x-2 font-ui text-sm">
                <span class="project-mark h-3.5 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="p.tone" aria-hidden="true" />
                <NuxtLink :to="`/hub/projects/${p.id}`" class="font-medium text-fg no-underline after:absolute after:inset-0">{{ p.title }}</NuxtLink>
              </p>
              <p v-if="p.changed || p.description" class="m-0 mt-0.5 pl-[11px] font-ui text-xs text-muted">
                <span v-if="p.changed" class="font-medium text-changed">Changed · {{ p.changed }}</span><span v-if="p.changed && p.description" aria-hidden="true"> · </span>{{ p.description }}
              </p>
            </div>
            <span class="order-2 pl-[11px] font-ui text-xs text-muted tabular-nums @2xl:order-none @2xl:col-start-2 @2xl:row-start-1 @2xl:pl-0 @2xl:text-right @2xl:text-sm @2xl:text-fg">
              {{ p.open }}<span class="@2xl:hidden"> open</span>
            </span>
            <span class="order-2 font-ui text-xs text-muted tabular-nums @max-2xl:-ml-2 @2xl:order-none @2xl:col-start-3 @2xl:row-start-1 @2xl:text-right @2xl:text-sm @2xl:text-fg">
              <span class="mr-1 @2xl:hidden" aria-hidden="true">·</span>{{ p.documents }}<span class="@2xl:hidden">&nbsp;{{ p.documents === 1 ? "document" : "documents" }}</span>
            </span>
            <!-- On a phone the last change is a line of its own, under the counts, on the title's edge. -->
            <span class="order-2 min-w-0 basis-full pl-[11px] font-ui text-xs break-words text-muted @2xl:order-none @2xl:col-start-4 @2xl:row-start-1 @2xl:basis-auto @2xl:pl-0 @2xl:text-right @2xl:text-sm @2xl:text-fg">
              <template v-if="p.last">{{ p.last.name }}, by {{ p.last.by }} · <span class="tabular-nums">{{ age(p.last.at, now) }}</span></template><template v-else-if="p.updated"><span class="tabular-nums">{{ age(p.updated, now) }}</span></template><template v-else>—</template>
            </span>
          </li>
        </ol>

        <section class="mt-10 flex max-w-[44rem] flex-col gap-2" aria-labelledby="agent-h">
          <h2 id="agent-h" class="m-0 font-ui text-sm font-semibold tracking-normal">Start one with your agent</h2>
          <div class="flex flex-wrap items-center gap-3 rounded-2 border border-line bg-field px-4 py-3">
            <p class="m-0 min-w-0 flex-1 font-ui text-sm">“{{ prompt }}”</p>
            <button class="btn sm" type="button" @click="copy(prompt, $event.currentTarget)"><span data-label>Copy</span></button>
          </div>
        </section>
      </template>
    </section>
  </HubShell>
</template>
