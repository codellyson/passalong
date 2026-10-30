<!--
  One customer request (docs/LOOP.md §1a): the conversation is the page, with the reply box pinned
  under it, and the facts beside it — who the customer is, where the request stands, its project,
  who is on it, and the work it became with where each piece stands. Move to a project, Give to…,
  Mark solved and Reopen happen here, in place. The work's own page (the document, every developer
  action) is one link away, never on this one.
-->
<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import type { Guide, GuideContext, SupportList, SupportRow, ThreadItem } from "~/types/hub";
import { age, byLine, projectsFrom, toneOf } from "~/utils/projects";

const route = useRoute();
const id = computed(() => String(route.params.id));
const queryClient = useQueryClient();
const { api, json, signedIn, markSeen, projectsQ } = useHub();
// Opening it is looking at it: what changed on it stops showing as changed.
watch(
  [id, signedIn],
  ([which, inside]) => {
    if (inside)
      void markSeen(which).then(() => queryClient.invalidateQueries({ queryKey: hubKeys.support }));
  },
  { immediate: true },
);

usePage({ title: "Support · Passalong", description: "One customer request.", noindex: true });

const ctxQ = useQuery({
  queryKey: computed(() => hubKeys.context(id.value)),
  queryFn: async () => (await api<GuideContext>(`/v1/guides/${id.value}/context`)) ?? null,
  enabled: signedIn,
});
const threadQ = useQuery({
  queryKey: computed(() => hubKeys.supportThread(id.value)),
  queryFn: async () =>
    (await api<{ thread: ThreadItem[] }>(`/v1/guides/${id.value}/thread`))?.thread ?? [],
  enabled: signedIn,
});
const { data: list } = useQuery({
  queryKey: hubKeys.support,
  queryFn: async () => (await api<SupportList>("/v1/support")) ?? { requests: [], teams: [] },
  enabled: signedIn,
});
const ctx = computed(() => ctxQ.data.value ?? null);
const row = computed(() => list.value?.requests.find((r) => r.id === id.value) ?? null);
const g = computed(() => ctx.value?.guide ?? null);
const customer = computed(() => ctx.value?.customer ?? null);
const name = computed(() => customer.value?.name || customer.value?.email || "the customer");
useHead({
  title: computed(() => (customer.value ? `${name.value} · Support` : "Support · Passalong")),
});

const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick = setInterval(() => (now.value = Date.now()), 60_000);
});
onBeforeUnmount(() => clearInterval(tick));

const STATE: Record<SupportRow["state"], string> = {
  new: "New",
  needs_reply: "Needs reply",
  with_development: "With development",
  waiting: "Waiting on customer",
  solved: "Solved",
};
const solved = computed(() => g.value?.status === "consumed");

/** Who has it: whoever holds it, else who it was given to. "Bola, an agent" for an agent. */
const onIt = computed(() => {
  const held = ctx.value?.claims[0];
  if (held) {
    return byLine(held.by.name || held.by.handle, held.agent ? "agent" : "");
  }
  const w = g.value;
  if (!w) return "";
  return w.to_name || w.to_group_name || (w.team_name ? `Everyone in ${w.team_name}` : "You");
});
const holding = computed(() => Boolean(ctx.value?.claims.length));
const quiet = computed(() => ctx.value?.claims[0]?.state === "stalled");
const addressed = computed(() => {
  const w = g.value;
  return w?.to ? `@${w.to}` : w?.to_group ? `#${w.to_group}` : "";
});

/** Work made from the request — a fix sent to development — each as a live row. */
const STAGE: Record<string, string> = {
  draft: "Draft",
  todo: "To do",
  working: "In progress",
  done: "Finished",
};
const work = computed(() =>
  (ctx.value?.children ?? []).map((c: Guide) => {
    const holder = c.held_by?.[0];
    return {
      id: c.id,
      title: c.title || "Untitled",
      stage:
        c.status === "consumed"
          ? c.outcome === "archived"
            ? "Archived"
            : "Finished"
          : STAGE[c.stage ?? ""] || "To do",
      who: holder ? byLine(holder.name, holder.agent ? "agent" : "") : "",
      changed: c.changed || "",
      at: c.updated || c.created,
      done: c.status === "consumed" && c.outcome !== "archived",
    };
  }),
);
/** Finished since the customer was last answered: telling them is what is left, when the team asked. */
const ready = computed(() => {
  if (!row.value?.tell) return [];
  const answered = (threadQ.data.value ?? [])
    .filter((m) => m.kind === "answered")
    .reduce((last, m) => (m.at > last ? m.at : last), "");
  return work.value.filter((w) => w.done && w.at > answered);
});
/** Why the reader sorted it the way it did: said once, quietly. */
const sortedNote = computed(
  () =>
    (threadQ.data.value ?? []).find(
      (m) => m.kind === "noted" && m.body.startsWith("Sorted by the reader"),
    )?.body ?? "",
);

/** One at a time: the request waiting on us longest, after this one. */
const next = computed(() => {
  const r = (list.value?.requests ?? [])
    .filter((x) => x.id !== id.value && x.waiting_since)
    .sort((a, b) => a.waiting_since.localeCompare(b.waiting_since))[0];
  return r ? { id: r.id, name: r.customer.name || r.customer.email } : null;
});
const solvedHere = ref(false);
watch(id, () => (solvedHere.value = false));

const refresh = () =>
  Promise.all(
    [
      hubKeys.context(id.value),
      hubKeys.supportThread(id.value),
      hubKeys.support,
      hubKeys.needs,
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );

/** The one act open on the panel at a time, and what it said back. */
const open = ref<"" | "project" | "give" | "reopen">("");
const busy = ref(false);
const problem = ref("");
async function act(fn: () => Promise<unknown>) {
  busy.value = true;
  problem.value = "";
  try {
    await fn();
    open.value = "";
    await refresh();
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const project = computed(() => row.value?.project ?? null);
/** Only projects in the request's own space: the server refuses a link across teams. */
const projects = computed(() =>
  projectsFrom(
    (projectsQ.data.value?.folders ?? []).filter(
      (f) => (f.team_slug || "") === (g.value?.team || ""),
    ),
  ),
);
/** Into the new project first, then out of where it was, so a refusal leaves it where it was. */
const moveTo = (to: string) =>
  act(async () => {
    if (to !== project.value?.id)
      await api(`/v1/folders/${encodeURIComponent(to)}/guides`, json("POST", { guide: id.value }));
    for (const f of ctx.value?.folders ?? [])
      if (f.id !== to)
        await api(`/v1/folders/${encodeURIComponent(f.id)}/guides/${id.value}`, {
          method: "DELETE",
        });
    await queryClient.invalidateQueries({ queryKey: hubKeys.projects });
  });
const leaveProjects = () =>
  act(async () => {
    for (const f of ctx.value?.folders ?? [])
      await api(`/v1/folders/${encodeURIComponent(f.id)}/guides/${id.value}`, { method: "DELETE" });
    await queryClient.invalidateQueries({ queryKey: hubKeys.projects });
  });

const mayClose = computed(() => Boolean(ctx.value?.owner || ctx.value?.admin));
const markSolved = () =>
  act(async () => {
    await api(`/v1/guides/${id.value}/status`, json("PATCH", { status: "consumed" }));
    solvedHere.value = true;
  });
/**
 * Solved by hand is archived, and archived work comes back through Draft — straight on to Ready
 * here, because a waiting customer must not sit in a draft that reaches nobody. Finished work
 * reopens with the reason at its top, and whoever finished it is told.
 */
const archived = computed(() => g.value?.outcome === "archived" || !g.value?.outcome);
const unarchive = () =>
  act(async () => {
    await api(`/v1/guides/${id.value}/status`, json("PATCH", { status: "draft" }));
    await api(`/v1/guides/${id.value}/status`, json("PATCH", { status: "published" }));
  });
async function reopen(form: HTMLFormElement) {
  const why = field(form, "why").trim();
  if (!why) return;
  await act(() => api(`/v1/guides/${encodeURIComponent(id.value)}/reopen`, json("POST", { why })));
}
const gave = () => {
  open.value = "";
  void refresh();
};

const label = "m-0 font-ui text-[0.6875rem] font-medium tracking-wider text-muted uppercase";
const fact = "flex flex-col gap-1 border-b border-line py-3 last:border-b-0";
</script>

<template>
  <HubShell>
    <div
      v-if="ctxQ.isError.value && !ctx"
      role="alert"
      class="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3"
    >
      <div class="min-w-0 grow basis-64">
        <p class="m-0 font-ui text-sm font-semibold text-danger">This request didn't load</p>
        <p class="mt-1 mb-0 font-ui text-sm text-muted">
          {{ ctxQ.error.value?.message }} <NuxtLink to="/hub/support">Back to Support</NuxtLink>
        </p>
      </div>
      <button class="btn outline danger sm" type="button" @click="ctxQ.refetch()">Try again</button>
    </div>

    <article v-else-if="ctx && g" class="flex flex-col gap-6">
      <header class="m-0 flex flex-col gap-2 border-b-0 p-0">
        <NuxtLink to="/hub/support" class="inline-flex items-center gap-1 self-start font-ui text-sm text-muted no-underline hover:text-fg"><AppIcon name="back" :size="14" />Support</NuxtLink>
        <h1 class="m-0 text-h2 font-medium tracking-tight break-words">{{ g.title }}</h1>
        <p class="m-0 flex flex-wrap items-baseline gap-x-2 font-ui text-sm text-muted">
          <span class="text-fg">{{ name }}</span>
          <template v-if="row">
            <span aria-hidden="true">·</span>
            <span class="font-medium text-fg">{{ STATE[row.state] }}</span>
          </template>
          <template v-if="row?.waiting_since">
            <span aria-hidden="true">·</span>
            <span class="font-medium text-fg tabular-nums">waiting {{ age(row.waiting_since, now) }}</span>
          </template>
        </p>
      </header>

      <div class="grid items-start gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_19rem]">
        <HubConversation
          :guide-id="id"
          :thread="threadQ.data.value ?? null"
          :name="name"
          :ready="ready"
          :state="row?.state"
          :next="next"
          @sent="refresh"
        />

        <aside class="flex min-w-0 flex-col rounded-3 border border-line bg-raised px-4 pt-3 pb-1 lg:sticky lg:top-6" aria-labelledby="facts-h">
          <h2 id="facts-h" class="m-0 border-b border-fg pb-2 font-ui text-sm font-semibold tracking-normal">Request</h2>

          <div :class="fact">
            <p :class="label">Customer</p>
            <p class="m-0 font-ui text-sm font-medium break-words">{{ customer?.name || customer?.email }}</p>
            <p v-if="customer?.name" class="m-0 font-ui text-sm break-all text-muted">{{ customer.email }}</p>
            <p v-if="customer?.ref" class="m-0 font-ui text-xs text-muted">
              Tracking number <span class="font-code text-fg">{{ customer.ref }}</span>
            </p>
            <p class="m-0 font-ui text-xs text-muted">Their address is shown only to your team.</p>
          </div>

          <div :class="fact">
            <p :class="label">Project</p>
            <div class="flex items-baseline justify-between gap-3 font-ui text-sm">
              <span v-if="project" class="flex min-w-0 items-baseline gap-2">
                <span class="project-mark h-3.5 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="toneOf(project)" aria-hidden="true" />
                <NuxtLink :to="`/hub/projects/${project.id}`" class="min-w-0 break-words text-fg">{{ project.title }}</NuxtLink>
              </span>
              <span v-else class="text-muted">Not in a project</span>
              <button type="button" class="btn sm h-7 shrink-0 px-2 text-xs" :aria-expanded="open === 'project'" @click="open = open === 'project' ? '' : 'project'">Move…</button>
            </div>
            <div v-if="open === 'project'" class="menu !static !mt-1 !w-full" role="group" aria-label="Move to project">
              <p class="menu-note mt-0 mb-1">Move to:</p>
              <button
                v-for="p in projects"
                :key="p.id"
                type="button"
                class="menu-item"
                :aria-current="p.id === project?.id ? 'true' : undefined"
                :disabled="busy"
                @click="moveTo(p.id)"
              >
                <span class="project-mark h-3.5 w-[3px] shrink-0 rounded-[1px]" :data-tone="p.tone" aria-hidden="true" />
                <span class="min-w-0 grow break-words" :class="p.id === project?.id ? 'font-medium' : ''">{{ p.title }}</span>
                <AppIcon v-if="p.id === project?.id" name="check" class="shrink-0" />
              </button>
              <p v-if="!projects.length" class="menu-note">
                No project it can go in. A request goes in a project of its own team{{ g.team ? "" : ", and this one is in none" }}.
              </p>
              <p v-if="problem" class="menu-note !text-danger" role="alert">{{ problem }}</p>
              <template v-if="ctx.folders.length">
                <div class="menu-rule" />
                <button type="button" class="menu-item text-muted" :disabled="busy" @click="leaveProjects">Not in a project</button>
              </template>
            </div>
          </div>

          <div :class="fact">
            <p :class="label">{{ holding ? "On it" : "For" }}</p>
            <div class="flex items-baseline justify-between gap-3 font-ui text-sm">
              <span class="min-w-0 break-words"><span v-if="quiet" class="font-medium">Went quiet · </span>{{ onIt }}</span>
              <button v-if="g.team && !solved" type="button" class="btn sm h-7 shrink-0 px-2 text-xs" :aria-expanded="open === 'give'" @click="open = open === 'give' ? '' : 'give'">Give to…</button>
            </div>
            <div v-if="open === 'give' && g.team" class="menu !static !mt-1 !w-full">
              <HubAssignPicker :id="id" :team="g.team" :to="addressed" @done="gave" />
            </div>
          </div>

          <div v-if="work.length" :class="fact">
            <p :class="label">Work made from it</p>
            <ul class="m-0 flex list-none flex-col p-0">
              <li v-for="w in work" :key="w.id" class="relative flex flex-col gap-0.5 border-t border-line py-2 pl-3 first:border-t-0 first:pt-1">
                <span v-if="w.changed" class="absolute inset-y-0 left-0 w-[3px] bg-changed" aria-hidden="true" />
                <NuxtLink :to="`/hub/g/${w.id}`" class="font-ui text-sm font-medium break-words text-fg no-underline hover:underline">{{ w.title }}</NuxtLink>
                <span class="font-ui text-xs text-muted">
                  <span class="text-fg">{{ w.stage }}</span><template v-if="w.who"> · {{ w.who }}</template>
                </span>
                <span v-if="w.changed" class="font-ui text-xs font-medium text-changed">Changed · {{ w.changed }}</span>
              </li>
            </ul>
          </div>

          <div v-if="ready.length" :class="fact">
            <p :class="label">Finished since you last answered</p>
            <p v-for="w in ready" :key="w.id" class="m-0 font-ui text-sm">
              <NuxtLink :to="`/hub/g/${w.id}`">{{ w.title }}</NuxtLink>
            </p>
          </div>

          <div :class="fact">
            <p :class="label">The work</p>
            <NuxtLink :to="`/hub/g/${id}`" class="font-ui text-sm">Open its page</NuxtLink>
            <p v-if="sortedNote" class="m-0 font-ui text-xs text-muted">{{ sortedNote }}</p>
          </div>

          <div v-if="solved || mayClose" :class="fact">
            <template v-if="solved">
              <div class="flex items-baseline justify-between gap-3 font-ui text-sm">
                <span class="text-muted">Solved{{ g.updated ? ` ${age(g.updated, now)} ago` : "" }}</span>
                <button v-if="archived" type="button" class="btn sm h-7 shrink-0 px-2 text-xs" :disabled="busy" @click="unarchive">{{ busy ? "Reopening…" : "Reopen" }}</button>
                <button v-else type="button" class="btn sm h-7 shrink-0 px-2 text-xs" :aria-expanded="open === 'reopen'" @click="open = open === 'reopen' ? '' : 'reopen'">Reopen</button>
              </div>
              <form v-if="open === 'reopen'" class="mt-1 flex gap-2" @submit.prevent="reopen($event.target as HTMLFormElement)">
                <label class="sr-only" for="why-reopen">Why reopen it?</label>
                <input id="why-reopen" name="why" class="h-8 min-w-0 grow text-sm" placeholder="What's still open" required />
                <button class="btn primary sm" type="submit" :disabled="busy">{{ busy ? "Reopening…" : "Reopen" }}</button>
              </form>
              <p v-if="open === 'reopen' && problem" class="m-0 font-ui text-sm text-danger" role="alert">{{ problem }}</p>
              <NuxtLink v-if="solvedHere && next" :to="`/hub/support/${next.id}`" class="btn sm mt-1 self-start" role="status">
                Next waiting · {{ next.name }}
              </NuxtLink>
            </template>
            <template v-else-if="mayClose">
              <button type="button" class="btn sm self-start" :disabled="busy" @click="markSolved">Mark solved</button>
              <p class="m-0 font-ui text-xs text-muted">If they write again it opens by itself.</p>
            </template>
          </div>
          <p v-if="problem && !open" class="m-0 mb-3 font-ui text-sm text-danger" role="alert">{{ problem }}</p>
        </aside>
      </div>
    </article>

    <div v-else class="flex flex-col gap-6" aria-busy="true">
      <HubSkeleton variant="lines" :rows="2" label="Loading the request" />
      <HubSkeleton variant="lines" :rows="6" label="Loading the conversation" />
    </div>
  </HubShell>
</template>
