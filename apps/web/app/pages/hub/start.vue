<!--
  Setting up (docs/LOOP.md §0, build order step 3): run once by whoever starts the team. Seven
  steps — the team, who's on it, who does what, what you work on, what to know about each project,
  where work comes in, and connecting agents — each with one line of why, its controls, Continue
  and Skip.

  A page of its own rather than a state of Needs you: it has an address, so "Finish setting up" on
  Needs you, a link in a chat and a second device all land on the same step (`?step=`), and Needs
  you stays a register of what waits. Where the person got to is the server's (`account.setup`,
  apps/api/src/setup.ts), so it resumes anywhere; everything a step makes goes through the routes
  that already exist — teams, invites, groups, folders, documents, inbound, connectors.

  Continue is the step's act and is offered only when there is something to act on; Skip is always
  there and is remembered as skipped, so Needs you can say what is left.
-->
<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { TeamDetail } from "~/types/hub";
import { projectsFrom } from "~/utils/projects";
import {
  draftBody,
  type KnowDraft,
  NO_SETUP,
  newDraft,
  resumeAt,
  type SetupState,
  type SetupStep,
  STEPS,
  toneForName,
  typed,
} from "~/utils/setup";

usePage({
  title: "Set up · Passalong",
  description: "Set up your team: its people, groups, projects and where work comes in.",
  noindex: true,
});

const { data, api, json, setMe, refresh, projectsQ, scope, signedIn } = useHub();
const route = useRoute();
const router = useRouter();
const { connect } = useSettingsUi();

const me = computed(() => data.value.me);
const setup = computed<SetupState>(() => me.value?.setup ?? NO_SETUP);
const step = computed<SetupStep>(() => {
  const q = route.query.step;
  return STEPS.some((s) => s.id === q) ? (q as SetupStep) : resumeAt(setup.value);
});
const index = computed(() => STEPS.findIndex((s) => s.id === step.value));
const current = computed(() => STEPS[index.value]!);
const doneCount = computed(() => setup.value.done.length);

/** The team setup is for: the one this person runs. Someone only invited has nothing to set up. */
const team = computed(() => me.value?.teams.find((t) => t.role === "owner") ?? null);
const invitedOnly = computed(() => !team.value && Boolean(me.value?.teams.length));
const slug = computed(() => team.value?.slug ?? "");
const enc = (s: string) => encodeURIComponent(s);

const busy = ref(false);
const problem = ref("");
/** Run a step's act, then remember the step and move on. A refusal stays on the step, said. */
async function act(fn: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  problem.value = "";
  try {
    await fn();
    await mark("done");
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function mark(as: "done" | "skipped") {
  // Read before saving: with no `?step=`, the step is where setup resumes, which this save moves.
  const at = index.value;
  const got = await api<{ setup: SetupState }>(
    "/v1/me/setup",
    json("PUT", { step: STEPS[at]!.id, as }),
  );
  if (got && me.value) setMe({ ...me.value, setup: got.setup });
  const next = STEPS[at + 1];
  if (next) await router.push({ query: { step: next.id } });
  else await navigateTo({ path: "/hub", query: { setup: "done" } });
}
/** Skip on "What to know" with words typed asks first, naming whose words would go. */
const skipAsk = ref(false);
async function skip() {
  problem.value = "";
  if (step.value === "know" && unsaved.value.length && !skipAsk.value) {
    skipAsk.value = true;
    return;
  }
  skipAsk.value = false;
  try {
    await mark("skipped");
  } catch (e) {
    problem.value = (e as Error).message;
  }
}
watch(step, () => {
  problem.value = "";
  skipAsk.value = false;
  if (import.meta.client) window.scrollTo({ top: 0 });
});
/** On a phone the steps are a row that scrolls sideways: keep the current one in view in it. */
const rail = ref<HTMLElement | null>(null);
watch([rail, step], () =>
  nextTick(() => {
    const at = rail.value?.querySelector<HTMLElement>('[aria-current="step"]');
    if (rail.value && at) rail.value.scrollLeft = at.parentElement?.offsetLeft ?? 0;
  }),
);

// ---- 1. Your team ----------------------------------------------------------------------------
const teamName = ref("");
const name = ref("");
const handle = ref("");
const handleTouched = ref(false);
const editingHandle = ref(false);
watch(
  me,
  (m) => {
    if (!m || name.value) return;
    name.value = m.name || "";
    if (m.handle) {
      handle.value = m.handle;
      handleTouched.value = true;
    }
  },
  { immediate: true },
);
watch(name, (typed) => {
  if (!handleTouched.value) handle.value = handleFrom(typed);
});
const handleOk = computed(() => /^[a-z0-9][a-z0-9-]{1,30}$/.test(handle.value));
const teamReady = computed(
  () => (team.value || teamName.value.trim().length >= 2) && name.value.trim() && handleOk.value,
);
const saveTeam = () =>
  act(async () => {
    const patch: Record<string, string> = {};
    if (name.value.trim() !== (me.value?.name || "")) patch.name = name.value.trim();
    if (handle.value !== (me.value?.handle || "")) patch.handle = handle.value;
    if (Object.keys(patch).length) await api("/v1/me", json("PATCH", patch));
    if (!team.value) {
      const made = await api<{ slug: string }>(
        "/v1/teams",
        json("POST", { name: teamName.value.trim() }),
      );
      if (made) scope.value = made.slug;
    }
    await refresh(hubKeys.me);
  });

// ---- 2. Who's on it --------------------------------------------------------------------------
const linkCopied = ref(false);
const emails = ref("");
const sent = ref<{ to: string; url: string; mailed: boolean }[]>([]);
async function copyInvite(el: EventTarget | null) {
  problem.value = "";
  try {
    const made = await api<{ url: string }>(`/v1/teams/${enc(slug.value)}/invites`, json("POST"));
    if (made) {
      copy(made.url, el);
      linkCopied.value = true;
    }
  } catch (e) {
    problem.value = (e as Error).message;
  }
}
const addresses = computed(() =>
  emails.value
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean),
);
async function sendInvites() {
  for (const to of addresses.value) {
    const r = await api<{ url: string; mailed: boolean }>(
      `/v1/teams/${enc(slug.value)}/invites`,
      json("POST", { email: to }),
    );
    if (r) sent.value.push({ to, url: r.url, mailed: r.mailed });
  }
  emails.value = "";
}
const sendNow = async () => {
  if (busy.value) return;
  busy.value = true;
  problem.value = "";
  try {
    await sendInvites();
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
};
const unmailed = computed(() => sent.value.filter((s) => !s.mailed));
const peopleReady = computed(
  () => linkCopied.value || addresses.value.length > 0 || sent.value.length > 0,
);
const savePeople = () =>
  act(async () => {
    if (addresses.value.length) await sendInvites();
  });

// ---- 3. Who does what -----------------------------------------------------------------------
interface Group {
  id: string;
  slug: string;
  name: string;
  members: string[];
}
const groupsQ = useQuery({
  queryKey: computed(() => ["groups", slug.value] as const),
  queryFn: async () =>
    (await api<{ groups: Group[] }>(`/v1/teams/${enc(slug.value)}/groups`))?.groups ?? [],
  enabled: computed(() => signedIn.value && Boolean(slug.value)),
});
const detailQ = useQuery({
  queryKey: computed(() => hubKeys.team(slug.value)),
  queryFn: async () => (await api<TeamDetail>(`/v1/teams/${enc(slug.value)}`)) as TeamDetail,
  enabled: computed(() => signedIn.value && Boolean(slug.value)),
});
const groups = computed(() => groupsQ.data.value ?? []);
const members = computed(() =>
  (detailQ.data.value?.members ?? []).filter((m): m is typeof m & { handle: string } =>
    Boolean(m.handle),
  ),
);
const memberName = (m: { handle: string; name: string | null; display?: string }) =>
  m.display || personName(m.name, m.handle);
/** How the server will spell a group's address: lowercase, words joined by a dash. */
const slugOf = (n: string) =>
  n
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const starters = ref(
  ["Developers", "Support", "Marketing"].map((n) => ({
    name: n,
    on: true,
    people: [] as string[],
  })),
);
/** A starter the team already has is shown as made, not offered again. */
const offered = computed(() =>
  starters.value.filter((s) => !groups.value.some((g) => g.slug === slugOf(s.name))),
);
const togglePerson = (s: { people: string[] }, h: string) => {
  s.people = s.people.includes(h) ? s.people.filter((x) => x !== h) : [...s.people, h];
};
const groupsReady = computed(
  () => groups.value.length > 0 || offered.value.some((s) => s.on && slugOf(s.name)),
);
const saveGroups = () =>
  act(async () => {
    for (const s of offered.value.filter((x) => x.on && slugOf(x.name))) {
      const made = await api<{ group: Group }>(
        `/v1/teams/${enc(slug.value)}/groups`,
        json("POST", { slug: s.name, name: s.name.trim() }),
      );
      if (made && s.people.length)
        await api(
          `/v1/teams/${enc(slug.value)}/groups/${made.group.id}/members`,
          json("PUT", { handles: s.people }),
        );
    }
    await groupsQ.refetch();
  });

// ---- 4. What you work on --------------------------------------------------------------------
const folders = computed(() => projectsQ.data.value?.folders ?? []);
/** This team's projects (or your own, with no team): the top-level folders in that space. */
const projects = computed(() => {
  const ids = new Set(
    folders.value.filter((f) => (f.team_slug || "") === slug.value).map((f) => f.id),
  );
  return projectsFrom(folders.value)
    .filter((p) => ids.has(p.id))
    .map((p) => {
      const f = folders.value.find((x) => x.id === p.id);
      return { ...p, color: f?.color || "", repo: f?.repo || "" };
    });
});
const MAX = 5;
const rows = ref([{ title: "", line: "", repo: "" }]);
const room = computed(() => Math.max(0, MAX - projects.value.length));
const filled = computed(() => rows.value.filter((r) => r.title.trim()).slice(0, room.value));
const projectsReady = computed(() => projects.value.length > 0 || filled.value.length > 0);
const saveProjects = () =>
  act(async () => {
    for (const r of filled.value) {
      await api(
        "/v1/folders",
        json("POST", {
          title: r.title.trim(),
          description: r.line.trim(),
          repo: r.repo.trim(),
          team: slug.value,
          // The colour its mark showed while it was being named, so it keeps it.
          color: toneForName(r.title),
        }),
      );
    }
    rows.value = [{ title: "", line: "", repo: "" }];
    await projectsQ.refetch();
  });

// ---- 5. What to know ------------------------------------------------------------------------
/** What the person typed per project, kept here so Continue writes them all and Skip can ask. */
const drafts = reactive<Record<string, KnowDraft>>({});
const draftOf = (id: string) => {
  drafts[id] ??= newDraft();
  return drafts[id];
};
/** Projects whose typed words have not been written yet. */
const unsaved = computed(() =>
  projects.value.filter((p) => drafts[p.id] && !drafts[p.id]!.written && typed(drafts[p.id]!)),
);
const knowReady = computed(() =>
  projects.value.some((p) => {
    const d = drafts[p.id];
    return Boolean(d && (d.copied || d.written || typed(d)));
  }),
);
const saveKnow = () =>
  act(async () => {
    for (const p of unsaved.value) {
      const d = drafts[p.id]!;
      await api(
        `/v1/folders/${p.id}/documents`,
        json("POST", { name: "README", body: draftBody(p.title, d, p.description) }),
      );
      d.written = true;
    }
  });
const list = (xs: string[]) =>
  xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

// ---- 6. Where work comes in -----------------------------------------------------------------
const inbound = ref<{
  available: boolean;
  addresses: { new: string; support: string } | null;
} | null>(null);
async function loadInbound() {
  problem.value = "";
  try {
    inbound.value = await api("/v1/inbound");
  } catch (e) {
    problem.value = (e as Error).message;
  }
}
watch(
  step,
  (s) => {
    if (s === "inbox" && !inbound.value && import.meta.client) loadInbound();
    if (s === "agents" && !connect.value.open) connect.value = { open: true, app: "claude-code" };
  },
  { immediate: true },
);
/** `key+new+team@…`: what arrives files onto the team's board rather than staying yours. */
const withTeam = (a: string) => (slug.value && a ? a.replace("@", `+${slug.value}@`) : a);
const inboxRows = computed(() =>
  inbound.value?.addresses
    ? [
        {
          id: "new",
          label: "Anything",
          hint: "Forward an email, send a note or a screenshot: the agent files it as work and sorts it.",
          value: withTeam(inbound.value.addresses.new),
        },
        {
          id: "support",
          label: "Customer support",
          hint: "Forward your support inbox here. Customers get a tracking number; you answer from the hub.",
          value: withTeam(inbound.value.addresses.support),
        },
      ]
    : [],
);
const makeAddresses = async () => {
  if (busy.value) return;
  busy.value = true;
  problem.value = "";
  try {
    await api("/v1/inbound", json("POST"));
    await loadInbound();
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
};
const saveInbox = () => act(async () => {});

// ---- 7. Connect your agents -----------------------------------------------------------------
const { data: apps } = useConnectors();
/** An app signed in, or a CLI token: something can act as this person. Otherwise it stays left. */
const connected = computed(() => (apps.value?.length ?? 0) > 0 || data.value.tokens.length > 0);
const finish = () => (connected.value ? act(async () => {}) : skip());

const ready = computed<Record<SetupStep, boolean>>(() => ({
  team: Boolean(teamReady.value),
  people: Boolean(slug.value) && peopleReady.value,
  groups: Boolean(slug.value) && groupsReady.value,
  projects: projectsReady.value,
  know: knowReady.value,
  inbox: Boolean(inbound.value?.addresses),
  agents: true,
}));
const onContinue = () =>
  ({
    team: saveTeam,
    people: savePeople,
    groups: saveGroups,
    projects: saveProjects,
    know: saveKnow,
    inbox: saveInbox,
    agents: finish,
  })[step.value]();

/** An address in the parts it may break between: after each `+`, and before the `@`. */
const unitsOf = (a: string) => a.split(/(?<=\+)|(?=@)/);

const stateOf = (id: SetupStep) =>
  setup.value.done.includes(id) ? "done" : setup.value.skipped.includes(id) ? "skipped" : "";
const label = "font-ui text-sm font-medium text-fg";
</script>

<template>
  <HubShell>
    <div class="flex flex-col gap-8">
      <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div class="min-w-0">
          <h1 class="m-0 text-h2 font-medium tracking-tight">Set up {{ team?.name || "your team" }}</h1>
          <p class="m-0 mt-1 font-ui text-sm text-muted">
            <span class="tabular-nums">{{ doneCount }} of {{ STEPS.length }}</span> done · skip anything, it's saved as you go
          </p>
        </div>
        <NuxtLink to="/hub" class="font-ui text-sm text-muted">Finish later</NuxtLink>
      </div>

      <div v-if="invitedOnly" class="flex flex-col gap-3 border-t border-fg py-8">
        <p class="m-0 text-h3 font-medium">Setup is for whoever started the team.</p>
        <p class="m-0 max-w-[36rem] font-ui text-sm text-muted">
          You're in {{ me?.teams[0]?.name }}. Work sent to you arrives on Needs you.
        </p>
        <div><NuxtLink to="/hub" class="btn primary">Go to Needs you</NuxtLink></div>
      </div>

      <div v-else class="grid grid-cols-[minmax(0,1fr)] items-start gap-x-12 gap-y-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <!-- The steps: a side list from 768px, a row that scrolls sideways on a phone. -->
        <nav aria-label="Setup steps" class="min-w-0 md:sticky md:top-6">
          <ol ref="rail" class="setup-rail relative m-0 flex snap-x snap-mandatory list-none gap-1 overflow-x-auto border-b border-line p-0 pr-8 md:snap-none md:flex-col md:gap-0 md:overflow-visible md:border-b-0 md:border-l md:pr-0">
            <li v-for="(s, i) in STEPS" :key="s.id" class="shrink-0 snap-start">
              <NuxtLink
                :to="{ query: { step: s.id } }"
                :aria-current="s.id === step ? 'step' : undefined"
                class="relative flex h-10 items-center gap-2 px-2 font-ui text-sm whitespace-nowrap no-underline md:h-8 md:pl-4"
                :class="s.id === step ? 'font-medium text-fg' : stateOf(s.id) === 'done' ? 'text-fg hover:underline' : 'text-muted hover:text-fg'"
              >
                <span
                  v-if="s.id === step"
                  class="absolute inset-x-0 bottom-0 h-[2px] bg-fg md:inset-x-auto md:inset-y-1 md:-left-px md:h-auto md:w-[2px]"
                  aria-hidden="true"
                />
                <span class="flex w-4 shrink-0 justify-center tabular-nums" :class="stateOf(s.id) === 'done' ? 'text-fg' : 'text-muted'">
                  <AppIcon v-if="stateOf(s.id) === 'done'" name="check" />
                  <template v-else>{{ i + 1 }}</template>
                </span>
                <span>{{ s.name }}</span>
                <span v-if="stateOf(s.id) === 'done'" class="sr-only">, done</span>
                <span v-else-if="stateOf(s.id) === 'skipped'" class="text-xs font-normal text-muted">Skipped</span>
              </NuxtLink>
            </li>
          </ol>
        </nav>

        <section :key="step" class="settle flex max-w-[44rem] min-w-0 flex-col" aria-labelledby="step-h">
          <h2 id="step-h" class="m-0 text-h3 font-medium tracking-tight">{{ current.name }}</h2>

          <!-- 1 -->
          <template v-if="step === 'team'">
            <p class="m-0 mt-1 font-ui text-sm text-muted">
              Your team is everyone you hand work to. People are called by their @name when work is sent to them.
            </p>
            <form id="step-form" class="mt-6 flex flex-col gap-5" @submit.prevent="teamReady && saveTeam()">
              <div v-if="!team" class="flex flex-col gap-2">
                <label :class="label" for="setup-team">Team name</label>
                <input id="setup-team" v-model="teamName" class="w-full" placeholder="Acme" maxlength="60" autocomplete="organization">
              </div>
              <p v-else class="m-0 font-ui text-sm">
                <span class="text-muted">Team</span> <span class="font-medium text-fg">{{ team.name }}</span>
              </p>
              <div class="flex flex-col gap-2">
                <label :class="label" for="setup-name">Your name</label>
                <input id="setup-name" v-model="name" class="w-full" placeholder="Ada Okafor" autocomplete="name">
              </div>
              <p v-if="!editingHandle" class="m-0 font-ui text-sm text-muted">
                Teammates send you work as <b class="font-medium text-fg">@{{ handle || "your-name" }}</b>.
                <button class="linkish" type="button" @click="editingHandle = true">Change</button>
              </p>
              <div v-else class="flex flex-col gap-2">
                <label :class="label" for="setup-handle">Your @name</label>
                <div class="affix">
                  <span class="affix-mark" aria-hidden="true">@</span>
                  <input id="setup-handle" v-model="handle" spellcheck="false" @input="handleTouched = true">
                </div>
                <p class="m-0 font-ui text-xs text-muted">2 to 31 lowercase letters, numbers or dashes.</p>
              </div>
            </form>
          </template>

          <!-- 2 -->
          <template v-else-if="step === 'people'">
            <p class="m-0 mt-1 font-ui text-sm text-muted">
              Work only reaches people who are in the team. Anyone with the link joins; nothing to install.
            </p>
            <div class="mt-6 flex flex-col">
              <HubSettingRow label="Invite link" hint="Each copy is a new link. Send it however you talk.">
                <div>
                  <button class="btn" type="button" :disabled="!slug" @click="copyInvite($event.currentTarget)">
                    <AppIcon name="copy" /><span data-label>Copy invite link</span>
                  </button>
                </div>
              </HubSettingRow>
              <HubSettingRow label="Or by email" hint="Separate addresses with commas or new lines." for="setup-emails">
                <textarea id="setup-emails" v-model="emails" class="min-h-[4.5rem] w-full resize-none [field-sizing:content]" :disabled="!slug" placeholder="kemi@acme.com, bola@acme.com" />
                <div>
                  <button class="btn sm" type="button" :disabled="busy || !addresses.length" @click="sendNow">Send invites</button>
                </div>
                <ul v-if="sent.length" class="m-0 flex list-none flex-col p-0">
                  <li v-for="s in sent" :key="s.url" class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 first:border-t-0">
                    <span class="min-w-0 grow break-all text-fg">{{ s.to }}</span>
                    <span class="text-muted">{{ s.mailed ? "Emailed" : "Not emailed" }}</span>
                    <button v-if="!s.mailed" class="btn sm" type="button" @click="copy(s.url, $event.currentTarget)">
                      <AppIcon name="copy" /><span data-label>Copy their link</span>
                    </button>
                  </li>
                </ul>
                <p v-if="unmailed.length" class="m-0 text-muted">
                  Email isn't set up on this server, so nothing was sent. Each address has its own link: copy it and send it yourself.
                </p>
              </HubSettingRow>
            </div>
          </template>

          <!-- 3 -->
          <template v-else-if="step === 'groups'">
            <p class="m-0 mt-1 font-ui text-sm text-muted">
              A group is the people who do one thing. Work sent to it reaches all of them, and the first to take it has it.
            </p>
            <div class="mt-6 flex flex-col">
              <ul v-if="groups.length" class="m-0 flex list-none flex-col border-b border-line p-0">
                <li v-for="g in groups" :key="g.id" class="flex flex-wrap items-baseline gap-x-3 border-t border-line py-3 font-ui text-sm first:border-t-0">
                  <AppIcon name="check" class="self-center text-fg" />
                  <span class="font-medium text-fg">#{{ g.slug }}</span>
                  <span class="text-muted">{{ g.members.length ? g.members.map((h) => `@${h}`).join(", ") : "Nobody yet" }}</span>
                </li>
              </ul>
              <ul class="m-0 flex list-none flex-col p-0">
                <li v-for="(s, i) in offered" :key="i" class="flex flex-col gap-3 border-b border-line py-4">
                  <div class="flex items-center gap-3">
                    <input :id="`setup-g-on-${i}`" v-model="s.on" type="checkbox" class="shrink-0" :aria-label="`Make ${s.name || 'this group'}`">
                    <label class="sr-only" :for="`setup-g-${i}`">Group name</label>
                    <input :id="`setup-g-${i}`" v-model="s.name" class="min-w-0 grow" :disabled="!s.on" maxlength="40">
                  </div>
                  <div v-if="s.on && members.length" class="flex flex-wrap items-center gap-2 pl-7">
                    <span class="font-ui text-xs text-muted">Who's in it</span>
                    <button
                      v-for="m in members"
                      :key="m.handle"
                      type="button"
                      class="chip-pick font-ui text-sm"
                      :aria-pressed="s.people.includes(m.handle)"
                      @click="togglePerson(s, m.handle)"
                    >{{ memberName(m) }}</button>
                  </div>
                </li>
              </ul>
              <div class="mt-3 flex flex-wrap items-center gap-3">
                <button v-if="starters.length < 8" class="btn sm" type="button" @click="starters.push({ name: '', on: true, people: [] })">
                  <AppIcon name="plus" />Add a group
                </button>
                <span class="font-ui text-xs text-muted">People who join later are added in Settings, Teams.</span>
              </div>
            </div>
          </template>

          <!-- 4 -->
          <template v-else-if="step === 'projects'">
            <p class="m-0 mt-1 font-ui text-sm text-muted">
              One project per product or repo. Every piece of work and every document lives in one; a marketing project needs no repo.
            </p>
            <div class="mt-6 flex flex-col">
              <ul v-if="projects.length" class="m-0 flex list-none flex-col border-b border-line p-0">
                <li v-for="p in projects" :key="p.id" class="flex min-w-0 items-baseline gap-2 border-t border-line py-3 font-ui text-sm first:border-t-0">
                  <span class="project-mark h-3.5 w-[3px] shrink-0 self-center rounded-[1px]" :data-tone="p.tone" aria-hidden="true" />
                  <span class="font-medium text-fg">{{ p.title }}</span>
                  <span v-if="p.description" class="min-w-0 truncate text-muted">{{ p.description }}</span>
                </li>
              </ul>
              <div v-if="room" class="flex flex-col">
                <fieldset v-for="(r, i) in rows.slice(0, room)" :key="i" class="m-0 grid gap-3 border-0 border-b border-line px-0 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <legend class="sr-only">Project {{ projects.length + i + 1 }}</legend>
                  <label class="flex flex-col gap-2 font-ui text-sm">
                    <span class="flex items-center gap-2 font-medium text-fg">
                      <!-- Its line colour from the moment it has a name, kept when it is made. -->
                      <span v-if="r.title.trim()" class="project-mark h-3.5 w-[3px] shrink-0 rounded-[1px]" :data-tone="toneForName(r.title)" aria-hidden="true" />
                      Name
                    </span>
                    <input v-model="r.title" maxlength="100" :placeholder="i ? 'Website' : 'Billing app'">
                  </label>
                  <label class="flex flex-col gap-2 font-ui text-sm">
                    <span class="font-medium text-fg">What it is, in a line</span>
                    <input v-model="r.line" maxlength="400" :placeholder="i ? 'Where people first hear of us' : 'The app customers pay us through'">
                  </label>
                  <label class="flex flex-col gap-2 font-ui text-sm md:col-span-2">
                    <span class="font-medium text-fg">Repo <span class="font-normal text-muted">· if it has one</span></span>
                    <input v-model="r.repo" class="code-field" spellcheck="false" maxlength="200" :placeholder="i ? 'Leave empty if it has none' : 'github.com/acme/billing'">
                  </label>
                </fieldset>
                <div class="mt-3">
                  <button v-if="rows.length < room" class="btn sm" type="button" @click="rows.push({ title: '', line: '', repo: '' })">
                    <AppIcon name="plus" />Add another project
                  </button>
                </div>
              </div>
              <p v-else class="m-0 py-3 font-ui text-sm text-muted">That's five. Add more from Projects whenever you like.</p>
            </div>
          </template>

          <!-- 5 -->
          <template v-else-if="step === 'know'">
            <p class="m-0 mt-1 font-ui text-sm text-muted">
              Each project's README says what it is, who uses it and the words you use. Every person and agent who picks up its work reads it first.
            </p>
            <div class="mt-6 flex flex-col">
              <HubSetupKnow v-for="p in projects" :key="p.id" :project="p" :draft="draftOf(p.id)" />
              <p v-if="!projects.length" class="m-0 border-t border-line py-3 font-ui text-sm text-muted">
                No projects yet. <NuxtLink :to="{ query: { step: 'projects' } }">Add one</NuxtLink> first, then come back.
              </p>
            </div>
          </template>

          <!-- 6 -->
          <template v-else-if="step === 'inbox'">
            <p class="m-0 mt-1 font-ui text-sm text-muted">
              Two addresses take work in from outside, so nothing that arrives by email gets dropped.
            </p>
            <div class="mt-6 flex flex-col">
              <HubSkeleton v-if="!inbound && !problem" variant="lines" :rows="2" label="Loading your addresses" />
              <p v-else-if="inbound && !inbound.available" class="m-0 border-t border-line py-3 font-ui text-sm text-muted">
                Email in isn't set up on this server yet, so there are no addresses to give you. Skip this; Settings, Integrations has them once it is.
              </p>
              <HubSettingRow v-else-if="inbound && !inbound.addresses" label="Addresses" hint="One for anything, one for customers.">
                <div>
                  <button class="btn" type="button" :disabled="busy" @click="makeAddresses">
                    {{ busy ? "Making…" : "Get your addresses" }}
                  </button>
                </div>
              </HubSettingRow>
              <template v-else>
                <HubSettingRow v-for="k in inboxRows" :key="k.id" :label="k.label" :hint="k.hint">
                  <div class="flex flex-wrap items-center gap-2">
                    <!-- Breaks only between its parts: after each +, and before the @. -->
                    <code class="block min-h-[var(--control-h)] min-w-0 flex-1 basis-64 rounded-2 border border-line-strong bg-field px-3 py-2 font-code text-sm leading-6 text-fg"><template v-for="(u, n) in unitsOf(k.value)" :key="n"><wbr v-if="n">{{ u }}</template></code>
                    <button class="btn" type="button" @click="copy(k.value, $event.currentTarget)">
                      <AppIcon name="copy" /><span data-label>Copy</span>
                    </button>
                  </div>
                </HubSettingRow>
                <HubSettingRow label="From a phone">
                  <p class="m-0 text-muted">
                    Share a screenshot to Mail and send it to the Anything address; the agent reads the picture.
                    On Android, add the hub to your home screen and it shows up in the Share menu.
                  </p>
                </HubSettingRow>
              </template>
            </div>
          </template>

          <!-- 7 -->
          <template v-else>
            <p class="m-0 mt-1 font-ui text-sm text-muted">
              Your agents take work and read each project's documents through Passalong. They run where you already use them; each teammate connects their own.
            </p>
            <div class="mt-6">
              <HubConnectors />
            </div>
          </template>

          <div v-if="problem" role="alert" class="mt-6 rounded-2 border border-danger bg-danger-soft px-4 py-3">
            <p class="m-0 font-ui text-sm text-danger">{{ problem }}</p>
          </div>

          <!-- Skipping words someone typed asks first, in place. -->
          <div v-if="skipAsk" class="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-5" role="alert">
            <p class="m-0 min-w-0 grow basis-64 font-ui text-sm">Skip and lose what you wrote for {{ list(unsaved.map((p) => p.title)) }}?</p>
            <button class="btn outline danger" type="button" @click="skip">Skip and lose it</button>
            <button class="btn" type="button" @click="skipAsk = false">Keep writing</button>
          </div>
          <div v-else class="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <button class="btn primary" type="button" :disabled="busy || !ready[step]" @click="onContinue">
              {{ busy ? "Saving…" : step !== "agents" ? "Continue" : connected ? "Finish" : "Finish without an agent" }}
            </button>
            <!-- With nothing connected, "Finish without an agent" is the skip: one control per act. -->
            <button v-if="step !== 'agents' || connected" class="btn" type="button" :disabled="busy" @click="skip">Skip</button>
            <span v-if="step === 'agents' && !connected" class="font-ui text-sm text-muted">
              Connect one any time from Settings, Agents.
            </span>
            <span v-if="(step === 'people' || step === 'groups') && !slug" class="font-ui text-sm text-muted">
              This needs a team. <NuxtLink :to="{ query: { step: 'team' } }">Name it first</NuxtLink>.
            </span>
          </div>
          <!-- The one door for someone who was meant to join a team, not start one. -->
          <div v-if="step === 'team' && !team" class="mt-10 flex flex-col gap-2 border-t border-line pt-5">
            <p class="m-0 font-ui text-sm text-muted">Someone sent you an invite? Join their team instead.</p>
            <HubInvitePaste label="Invite link" />
          </div>
        </section>
      </div>
    </div>
  </HubShell>
</template>
