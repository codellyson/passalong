<!--
  What do you need? (docs/LOOP.md §1a, problem 2): a place to make a Passalong without an agent of
  your own. Write or paste anything; the agent — the reader — gives it its shape (task, bug or
  handover, with its sections), sends it to one of the team's groups and files it, with no confirm
  step. Its work is on the page the whole time: the panel beside the editor says, as you write, what
  this is, where it goes, what it has drafted and what already looks like it. Unsure, it still files
  its best reading and says what it would check. Filed, the panel says where it went, with move and undo.
-->
<script setup lang="ts">
usePage({
  title: "What do you need? · Passalong",
  description: "Say what you need; Passalong's agent files it for the right team.",
  noindex: true,
});
const { api, json, data } = useHub();

const teams = computed(() => data.value.me?.teams ?? []);
const team = ref("");
watchEffect(() => {
  if (!team.value) team.value = data.value.team?.slug || teams.value[0]?.slug || "";
});

/** What is written, as markdown from the editor; pictures travel inline in it. */
const text = ref("");
const writer = ref<{
  addPicture: (f: File) => Promise<void>;
  clear: () => void;
  insert: (t: string) => void;
} | null>(null);
const busy = ref(false);
const uploading = ref(false);
const problem = ref("");

const STARTERS = [
  { label: "Something's broken", text: "Something's broken: " },
  { label: "We need something built", text: "We need " },
  { label: "Hand work over", text: "Handing this over: " },
  { label: "A customer asked…", text: "A customer asked " },
];

interface Filed {
  id: string;
  kind: string;
  title: string;
  summary: string;
  route: { slug: string; name: string } | null;
  reason: string;
  /** What the reader was not sure of, filed anyway; "" when it was sure. */
  unsure: string;
  groups: { slug: string; name: string }[];
}
const filed = ref<Filed | null>(null);
const moving = ref(false);

async function attach(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = "";
  if (!f) return;
  uploading.value = true;
  problem.value = "";
  try {
    await writer.value?.addPicture(f);
  } finally {
    uploading.value = false;
  }
}

/** The team's people and groups, for `@` and `#` in the editor. */
const people = ref<{ handle: string; name: string }[]>([]);
const groups = ref<{ slug: string; name: string }[]>([]);
watch(
  team,
  async (slug) => {
    people.value = [];
    groups.value = [];
    if (!slug) return;
    const [t, g] = await Promise.all([
      api<{ members: { handle: string; name: string }[] }>(`/v1/teams/${slug}`).catch(() => null),
      api<{ groups: { slug: string; name: string }[] }>(`/v1/teams/${slug}/groups`).catch(
        () => null,
      ),
    ]);
    people.value = (t?.members ?? []).filter((m) => m.handle);
    groups.value = g?.groups ?? [];
  },
  { immediate: true },
);

/**
 * Read as it is written: a moment after typing stops, the agent says what this would become —
 * nothing is filed — and what already on the board looks like it, so nothing is filed twice.
 */
interface Preview {
  kind: string;
  title: string;
  route: { slug: string; name: string } | null;
  reason: string;
  sections: string[];
  question: string;
}
const preview = ref<Preview | null>(null);
const reading = ref(false);
const related = ref<{ id: string; title: string }[]>([]);
let timer: ReturnType<typeof setTimeout> | undefined;
let asked = 0;
watch([text, team], () => {
  clearTimeout(timer);
  if (filed.value) return;
  if (text.value.trim().length < 20) {
    preview.value = null;
    related.value = [];
    return;
  }
  timer = setTimeout(async () => {
    const mine = ++asked;
    reading.value = true;
    try {
      const got = await api<{ preview: Preview | null }>(
        "/v1/compose/preview",
        json("POST", { text: text.value, team: team.value }),
      );
      if (mine !== asked) return;
      preview.value = got?.preview ?? null;
      const q = preview.value?.title || "";
      const found = q
        ? await api<{ guides: { id: string; title: string; status: string }[] }>(
            `/v1/guides?q=${encodeURIComponent(q.split(" ").slice(0, 4).join(" "))}&scope=${encodeURIComponent(team.value || "all")}`,
          ).catch(() => null)
        : null;
      if (mine === asked)
        related.value = (found?.guides ?? []).filter((g) => g.status !== "consumed").slice(0, 3);
    } catch {
      if (mine === asked) preview.value = null;
    } finally {
      if (mine === asked) reading.value = false;
    }
  }, 1200);
});
onBeforeUnmount(() => clearTimeout(timer));

/** What the person gave it that is kept as it came: the agent says so, so nobody wonders. */
const evidence = computed(() =>
  [
    /```/.test(text.value) && "Your error, kept as it came",
    /!\[[^\]]*\]\([^)]*\/v1\/shots\//.test(text.value) && "Your pictures, attached",
  ].filter((s): s is string => Boolean(s)),
);

/** Where the agent is, in one word a person reads first. */
const state = computed(() =>
  filed.value
    ? { label: "Filed", tone: "ok" }
    : reading.value
      ? { label: "Reading…", tone: "quiet" }
      : preview.value
        ? { label: "Ready to file", tone: "ok" }
        : { label: "Waiting for you", tone: "quiet" },
);

/** What the agent filed for this account here, newest first. */
const recent = ref<{ id: string; title: string; kind: string; created: string; routed: string }[]>(
  [],
);
const loadRecent = () =>
  api<{ filed: typeof recent.value }>("/v1/compose/recent")
    .then((r) => (recent.value = r?.filed ?? []))
    .catch(() => {});
onMounted(loadRecent);

async function file() {
  if (!text.value.trim() || busy.value) return;
  busy.value = true;
  problem.value = "";
  try {
    const got = await api<Filed>(
      "/v1/compose",
      json("POST", { text: text.value, team: team.value }),
    );
    if (got) {
      filed.value = got;
      loadRecent();
    }
  } catch (err) {
    problem.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

async function move(slug: string) {
  if (!filed.value) return;
  moving.value = false;
  problem.value = "";
  try {
    await api(`/v1/guides/${filed.value.id}/assign`, json("POST", { to: slug ? `#${slug}` : "" }));
    const g = filed.value.groups.find((x) => x.slug === slug);
    filed.value = { ...filed.value, route: g ? { slug: g.slug, name: g.name } : null };
    loadRecent();
  } catch (err) {
    problem.value = (err as Error).message;
  }
}

async function undo() {
  if (!filed.value) return;
  problem.value = "";
  try {
    await api(`/v1/guides/${filed.value.id}`, { method: "DELETE" });
    filed.value = null;
    loadRecent();
  } catch (err) {
    problem.value = (err as Error).message;
  }
}

function again() {
  filed.value = null;
  preview.value = null;
  related.value = [];
  writer.value?.clear();
  text.value = "";
}

const groupName = (g: { slug: string; name: string }) => g.name || `#${g.slug}`;
const toneDot: Record<string, string> = {
  ok: "bg-[var(--ok)]",
  quiet: "bg-[var(--line-strong)]",
};
</script>

<template>
  <HubShell>
    <div class="flex flex-col gap-6">
      <header class="m-0 flex flex-col gap-2 border-b-0 p-0">
        <h1 class="m-0">What do you need?</h1>
        <p class="m-0 max-w-[40rem] font-ui text-base text-muted">
          Say it however it comes. Passalong's agent turns it into a task, a bug or a handover, sends
          it to the right team, and files it.
        </p>
      </header>

      <div v-if="!filed" class="flex flex-wrap gap-2" role="group" aria-label="Start from">
        <button
          v-for="s in STARTERS"
          :key="s.label"
          type="button"
          class="btn sm"
          @mousedown.prevent @click="writer?.insert(s.text)"
        >{{ s.label }}</button>
      </div>

      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form class="flex min-w-0 flex-col gap-2" @submit.prevent="file">
          <!-- The editor exists only in the browser; the server draws an empty field of its size. -->
          <ClientOnly>
            <HubWriter
              ref="writer"
              placeholder="Write it however it comes. Paste a screenshot, an error or a link."
              :people="people"
              :groups="groups"
              :disabled="Boolean(filed)"
              @change="text = $event"
              @problem="problem = $event"
            >
              <template #footer>
                <span class="flex flex-wrap items-center gap-2">
                  <label class="btn sm cursor-pointer" :class="filed ? 'pointer-events-none opacity-50' : ''">
                    <input type="file" accept="image/*" class="sr-only" :disabled="Boolean(filed)" @change="attach" />
                    {{ uploading ? "Adding…" : "Picture" }}
                  </label>
                  <button type="button" class="btn sm" :disabled="Boolean(filed)" @mousedown.prevent @click="writer?.insert('@')">@ person</button>
                  <button type="button" class="btn sm" :disabled="Boolean(filed)" @mousedown.prevent @click="writer?.insert('#')"># group</button>
                </span>
                <button
                  v-if="!filed"
                  class="btn primary"
                  :disabled="busy || !text.trim()"
                >{{ busy ? "Filing…" : "File it" }}</button>
              </template>
            </HubWriter>
            <template #fallback>
              <div class="writer-shell"><div class="writer" aria-hidden="true" /></div>
            </template>
          </ClientOnly>
          <label v-if="teams.length > 1 && !filed" class="flex items-center gap-2 font-ui text-sm">
            <span class="text-muted">For</span>
            <select v-model="team">
              <option v-for="t in teams" :key="t.slug" :value="t.slug">{{ t.name }}</option>
            </select>
          </label>
          <p v-if="problem" class="m-0 font-ui text-sm text-danger" role="alert">{{ problem }}</p>
        </form>

        <aside class="flex flex-col gap-4 rounded-3 bg-raised px-5 py-4 shadow-edge" aria-live="polite" aria-labelledby="agent-h">
          <div class="flex items-center justify-between gap-3">
            <h2 id="agent-h" class="m-0 font-ui text-base font-medium">Agent</h2>
            <span class="flex items-center gap-2 font-ui text-xs text-muted">
              <span class="size-2 rounded-pill" :class="toneDot[state.tone]" aria-hidden="true" />{{ state.label }}
            </span>
          </div>

          <!-- Filed: where it went, and the two ways to change that. -->
          <template v-if="filed">
            <div class="flex flex-col gap-1 font-ui">
              <span class="text-xs text-muted">Filed as</span>
              <span class="flex items-start gap-2 text-base">
                <span
                  v-if="kindBadge(filed.kind)"
                  class="mt-0.5 rounded-1 border px-2 py-0.5 text-xs font-medium tracking-wide uppercase"
                  :class="kindBadge(filed.kind)?.class"
                >{{ kindBadge(filed.kind)?.label }}</span>
                <NuxtLink :to="`/hub/g/${filed.id}`" class="text-fg">{{ filed.title }}</NuxtLink>
              </span>
            </div>
            <div class="flex flex-col gap-1 font-ui">
              <span class="text-xs text-muted">Sent to</span>
              <span class="text-base">
                <b class="font-medium">{{ filed.route ? groupName(filed.route) : "The whole team" }}</b>
              </span>
            </div>
            <p v-if="filed.unsure" class="m-0 font-ui text-sm">
              <span class="text-muted">Worth checking:</span> {{ filed.unsure }}
            </p>
            <div class="flex flex-wrap gap-2">
              <NuxtLink :to="`/hub/g/${filed.id}`" class="btn primary sm no-underline">Open it</NuxtLink>
              <button v-if="filed.groups.length" type="button" class="btn sm" :aria-expanded="moving" @click="moving = !moving">Send elsewhere</button>
              <button type="button" class="btn sm" @click="undo">Undo</button>
              <button type="button" class="btn sm" @click="again">Write another</button>
            </div>
            <div v-if="moving" class="flex flex-wrap gap-2" role="group" aria-label="Send to">
              <button
                v-for="g in filed.groups"
                :key="g.slug"
                type="button"
                class="btn sm"
                :class="filed.route?.slug === g.slug ? 'primary' : ''"
                @click="move(g.slug)"
              >{{ groupName(g) }}</button>
              <button type="button" class="btn sm" :class="!filed.route ? 'primary' : ''" @click="move('')">The whole team</button>
            </div>
          </template>

          <!-- Reading: what it has made of the writing so far. -->
          <template v-else-if="preview">
            <div class="flex flex-col gap-1 font-ui" :class="reading ? 'opacity-60' : ''">
              <span class="text-xs text-muted">This is</span>
              <span class="flex items-start gap-2 text-base">
                <span
                  v-if="kindBadge(preview.kind)"
                  class="mt-0.5 rounded-1 border px-2 py-0.5 text-xs font-medium tracking-wide uppercase"
                  :class="kindBadge(preview.kind)?.class"
                >{{ kindBadge(preview.kind)?.label }}</span>
                <span>{{ preview.title }}</span>
              </span>
            </div>
            <div class="flex flex-col gap-1 font-ui" :class="reading ? 'opacity-60' : ''">
              <span class="text-xs text-muted">Goes to</span>
              <span class="text-base">
                <b class="font-medium">{{ preview.route ? groupName(preview.route) : "The whole team" }}</b>
              </span>
              <span v-if="preview.reason" class="text-sm text-muted">{{ preview.reason }}</span>
            </div>
            <div v-if="preview.sections.length || evidence.length" class="flex flex-col gap-2 font-ui text-sm">
              <span class="text-xs text-muted">Drafting</span>
              <ul class="m-0 flex list-none flex-col gap-2 p-0">
                <li v-for="s in [...preview.sections, ...evidence]" :key="s" class="flex items-center gap-2">
                  <AppIcon name="check" class="shrink-0 text-ok" />{{ s }}
                </li>
              </ul>
            </div>
            <p v-if="preview.question" class="m-0 font-ui text-sm">Not sure yet, will file anyway: {{ preview.question }}</p>
            <p v-if="related.length" class="m-0 border-t border-line pt-3 font-ui text-sm text-muted">
              Already on the board:
              <template v-for="(r, i) in related" :key="r.id"
                ><NuxtLink :to="`/hub/g/${r.id}`">{{ r.title }}</NuxtLink
                ><template v-if="i < related.length - 1">, </template></template
              >
            </p>
          </template>

          <!-- Waiting: what it is about to do, so the first look says there is an agent here. -->
          <ul v-else class="m-0 flex list-none flex-col gap-2 p-0 font-ui text-sm text-muted">
            <li>Works out whether it's a task, a bug or a handover</li>
            <li>Sends it to the team that should act</li>
            <li>Drafts what it needs, so nobody starts cold</li>
            <li>Files it anyway when unsure, and says what to check</li>
          </ul>
        </aside>
      </div>

      <section v-if="recent.length" class="flex flex-col gap-2" aria-labelledby="recent-h">
        <h2 id="recent-h" class="m-0 font-ui text-base font-medium">Filed by the agent for you</h2>
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          <li v-for="r in recent" :key="r.id">
            <NuxtLink
              :to="`/hub/g/${r.id}`"
              class="flex items-center justify-between gap-3 rounded-2 bg-raised px-4 py-3 font-ui text-sm text-fg no-underline shadow-edge"
            >
              <span class="min-w-0 truncate">
                <span class="text-muted">{{ kindBadge(r.kind)?.label ?? r.kind }} ·</span> {{ r.title }}
                <span v-if="r.routed" class="text-muted">→ {{ r.routed }}</span>
              </span>
              <span class="shrink-0 text-muted">{{ rel(r.created) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>
  </HubShell>
</template>
