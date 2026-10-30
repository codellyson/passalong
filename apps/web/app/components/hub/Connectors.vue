<!--
  Connected apps: what uses Passalong as you, and how to add one.

  Connecting starts from the app, not from a form. Every app's requirements are known — Claude
  signs itself in, ChatGPT wants a client ID and no secret, Claude Code and Codex run locally — so
  they are stated up front from utils/connect-apps.ts, and only the steps that are yours are left.
  The old form asked every app the same two questions, a callback address and whether it "keeps a
  secret", and the reasonable-looking answer to the second made a ChatGPT connector that was
  refused at every sign-in.

  While an app that signs itself in is being connected, the list is polled and the progress shows:
  approved, signed in, first tool call — and if the token exchange is refused, why.

  A connector gets its own credential, reaching only the MCP endpoint and revocable on its own,
  which is why it is listed here beside tokens: a credential you cannot see is one you cannot revoke.
-->
<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import {
  APPS,
  appById,
  appForHost,
  type ConnectApp,
  connectorState,
  handshake,
  MCP_URL,
  markForHost,
} from "~/utils/connect-apps";
import { age } from "~/utils/projects";

const { api, json } = useHub();
const queryClient = useQueryClient();
const { connect } = useSettingsUi();

const app = computed<ConnectApp>(() => appById(connect.value.app));
/** When the sheet was opened for this app: connections approved after it are this connection. */
const since = ref(new Date().toISOString());
const stepsFor = (id: string) => {
  connect.value = { open: true, app: id };
};
watch(
  () => [connect.value.open, connect.value.app],
  () => {
    since.value = new Date(Date.now() - 5000).toISOString();
  },
);

// Whether to poll depends on the clients the poll returns, so the two cannot be declared in one
// order: the query read `watching` while setting itself up, before `clients` existed, and threw.
// A plain ref breaks the loop — the query is made first, and `watching` is fed in afterwards.
const polling = ref(false);
const { data: loaded, isPending: loadingClients, error: loadFailed } = useConnectors(polling);
const clients = computed(() => loaded.value ?? []);
const progress = computed(() => handshake(clients.value, since.value));
const watching = computed(
  () => connect.value.open && app.value.kind === "oauth" && progress.value.reached < 3,
);
watchEffect(() => {
  polling.value = watching.value;
});
const reload = () => queryClient.invalidateQueries({ queryKey: settingsKeys.connectors });

const STAGES = ["You approved", "Signed in", "First tool call"];
const stageState = (i: number) =>
  progress.value.reached > i ? "done" : progress.value.reached === i ? "now" : "todo";

const trouble = ref("");
watch(loadFailed, (e) => {
  if (e) trouble.value = e.message;
});

// ---- a client ID, for an app that asks for one instead of taking the address ----
const callback = ref("");
const confidential = ref(false);
const busy = ref(false);
/** Shown once. The server keeps a SHA-256 of the secret, so there is no second chance. */
const fresh = ref<{ id: string; secret: string } | null>(null);
watch(
  app,
  (a) => {
    callback.value = a.manual?.callback ?? "";
    confidential.value = false;
  },
  { immediate: true },
);

async function createClient() {
  if (busy.value) return;
  busy.value = true;
  trouble.value = "";
  try {
    const answer = await api<{ client: { id: string; secret: string } }>(
      "/v1/oauth/clients",
      json("POST", {
        name: app.value.id === "other" ? "" : app.value.name,
        redirect_uri: callback.value.trim(),
        confidential: confidential.value,
      }),
    );
    if (answer?.client) fresh.value = answer.client;
    await reload();
  } catch (e) {
    trouble.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const removing = ref<string | null>(null);
async function remove(id: string) {
  try {
    await api(`/v1/oauth/clients/${id}`, { method: "DELETE" });
    removing.value = null;
    await reload();
  } catch (e) {
    trouble.value = (e as Error).message;
  }
}

/** `{path}` in a step's text, split so the path can be set apart. */
const parts = (text: string) => text.split("{path}");

/** A requirement's value, run on into the sentence after its label. Only the first letter drops
 *  case: "From ChatGPT's form" lowercased whole would rename the app. */
const runOn = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);

const groups = computed(() => {
  const out: { name: string; apps: ConnectApp[] }[] = [];
  for (const a of APPS) {
    const last = out[out.length - 1];
    if (last && last.name === a.group) last.apps.push(a);
    else out.push({ name: a.group, apps: [a] });
  }
  return out;
});

const picker = ref<HTMLElement | null>(null);
function arrow(e: KeyboardEvent) {
  const step =
    e.key === "ArrowDown" || e.key === "ArrowRight"
      ? 1
      : e.key === "ArrowUp" || e.key === "ArrowLeft"
        ? -1
        : 0;
  if (!step) return;
  e.preventDefault();
  const i = APPS.findIndex((a) => a.id === connect.value.app);
  const next = APPS[(i + step + APPS.length) % APPS.length]!;
  stepsFor(next.id);
  nextTick(() => picker.value?.querySelector<HTMLElement>(`[data-app="${next.id}"]`)?.focus());
}

/** A connection's state is a word: ink when it works, danger when it can't sign in, muted when idle. */
const tone = {
  ok: "text-fg",
  bad: "text-danger font-medium",
  idle: "text-muted",
};
</script>

<template>
  <div class="flex flex-col">
    <div
      v-if="connect.open"
      class="mt-3 grid overflow-hidden rounded-3 border border-line bg-raised md:grid-cols-[13rem_1fr]"
    >
      <div
        ref="picker"
        class="border-b border-line p-2 md:border-r md:border-b-0"
        role="radiogroup"
        aria-label="What are you connecting?"
        @keydown="arrow"
      >
        <template v-for="g in groups" :key="g.name">
          <p class="mx-2 mt-3 mb-1 font-ui text-xs text-muted first:mt-1">{{ g.name }}</p>
          <button
            v-for="a in g.apps"
            :key="a.id"
            type="button"
            role="radio"
            :data-app="a.id"
            :aria-checked="a.id === connect.app"
            :tabindex="a.id === connect.app ? 0 : -1"
            class="grid w-full cursor-pointer grid-cols-[2rem_1fr] items-center gap-2 rounded-1 border px-2 py-1.5 text-left"
            :class="a.id === connect.app ? 'border-line bg-surface' : 'border-transparent bg-transparent hover:bg-surface'"
            @click="stepsFor(a.id)"
          >
            <span
              class="grid size-8 place-items-center rounded-1 border"
              :class="a.id === connect.app ? 'border-transparent bg-ink text-on-ink' : 'border-line bg-surface text-fg'"
            >
              <AppMark :name="a.mark" :size="18" />
            </span>
            <span class="min-w-0 truncate font-ui text-sm font-medium text-fg">{{ a.name }}</span>
          </button>
        </template>
      </div>

      <div class="flex min-w-0 flex-col gap-5 p-5" aria-live="polite">
        <div class="flex min-w-0 items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-1 border border-line bg-bg text-fg">
            <AppMark :name="app.mark" :size="20" />
          </span>
          <div class="min-w-0">
            <h4 class="m-0 font-ui text-base font-semibold text-fg">{{ app.name }}</h4>
            <p class="mt-1 mb-0 max-w-prose font-ui text-sm text-muted">{{ app.lede }}</p>
            <!-- What the app needs, on one line. It was a three-cell bordered grid with a coloured
                 dot per cell and no legend saying what a colour meant; every cell also said again
                 what a step below says. A line of text is the same facts without the furniture. -->
            <p class="mt-2 mb-0 font-ui text-xs text-muted">
              <template v-for="(r, i) in app.requirements" :key="r.label">
                <span v-if="i" aria-hidden="true"> · </span>{{ r.label }}:
                <span :class="r.need === 'you' ? 'text-fg' : ''">{{ runOn(r.value) }}</span>
              </template>
            </p>
          </div>
        </div>

        <ol class="m-0 flex list-none flex-col gap-3 p-0">
          <li v-for="(s, i) in app.steps" :key="s.text" class="grid grid-cols-[1.25rem_1fr] gap-3">
            <span class="pt-0.5 font-code text-xs text-muted tabular-nums">{{ i + 1 }}.</span>
            <div class="flex min-w-0 flex-col gap-2 font-ui text-sm text-fg">
              <p class="m-0 max-w-prose">
                <template v-for="(p, n) in parts(s.text)" :key="n">
                  <b v-if="n > 0" class="font-medium">{{ s.path }}</b>{{ p }}
                </template>
              </p>
              <div v-if="s.copy" class="flex max-w-full items-stretch overflow-hidden rounded-1 border border-line bg-surface">
                <pre class="m-0 min-w-0 flex-1 overflow-x-auto px-3 py-2 font-code text-xs">{{ s.copy }}</pre>
                <button type="button" class="btn sm rounded-none border-0 border-l border-line" @click="copy(s.copy, $event.currentTarget)">
                  <AppIcon name="copy" /><span data-label>Copy</span>
                </button>
              </div>
              <dl v-if="s.fields" class="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
                <template v-for="[k, v] in s.fields" :key="k">
                  <dt class="text-muted">{{ k }}</dt>
                  <dd class="m-0">
                    <span v-if="v === null" class="font-code text-xs text-ok">leave empty</span>
                    <template v-else>{{ v }}</template>
                  </dd>
                </template>
              </dl>
            </div>
          </li>
        </ol>

        <!-- One filled box, for the note that costs a person a broken connector. Anything else is
             a sentence: five stacked tinted panels read as five warnings and none of them was. -->
        <div v-if="app.notes.length" class="flex flex-col gap-2">
          <p
            v-for="n in app.notes"
            :key="n.label"
            class="m-0 max-w-prose font-ui text-sm"
            :class="n.tone === 'warn' ? 'rounded-1 bg-warn-soft px-3 py-2 text-fg' : 'text-muted'"
          >
            <b class="font-medium" :class="n.tone === 'warn' ? 'text-warn' : 'text-fg'">{{ n.label }}: </b>{{ n.text }}
          </p>
        </div>

        <details v-if="app.manual" :open="app.id === 'chatgpt'">
          <summary class="linkish w-fit cursor-pointer font-ui text-sm">
            {{
              app.id === "chatgpt"
                ? "Make a client ID for ChatGPT"
                : app.id === "other"
                  ? "The app asked for a client ID"
                  : `${app.name} asked for a client ID instead`
            }}
          </summary>
          <form class="mt-3 flex flex-col gap-3 rounded-1 border border-line p-3" @submit.prevent="createClient">
            <p v-if="app.manual.callback" class="m-0 font-ui text-sm text-muted">
              Filled in for {{ app.name }}. Nothing to choose.
            </p>
            <div>
              <label class="mb-2 block font-ui text-sm font-medium text-fg" :for="`callback-${app.id}`">Callback address</label>
              <input
                :id="`callback-${app.id}`"
                v-model="callback"
                class="w-full font-code text-sm"
                type="url"
                required
                :readonly="Boolean(app.manual.callback)"
                placeholder="Copied from the app's setup screen"
              >
            </div>
            <label class="flex items-start gap-2 font-ui text-sm text-muted" :for="`secret-${app.id}`">
              <input :id="`secret-${app.id}`" v-model="confidential" type="checkbox" class="mt-0.5">
              Give it a secret — only if the app has a client secret field it won't leave empty.
            </label>
            <button class="btn primary sm self-start" type="submit" :disabled="busy || !callback.trim()">
              {{ busy ? "Creating…" : "Create client ID" }}
            </button>
          </form>
        </details>

        <!-- Shown once, like a new token: the page holds something the server cannot give back. -->
        <div v-if="fresh" class="rounded-3 border border-fg bg-bg p-4">
          <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <b class="font-ui text-sm text-fg">Client ID<template v-if="fresh.secret"> and secret · shown once</template></b>
            <span class="font-ui text-sm font-medium text-fg">Paste into {{ app.id === "other" ? "the app" : app.name }}</span>
          </div>
          <div class="flex flex-col gap-2">
            <code class="overflow-x-auto rounded-2 border border-line-strong bg-field px-3 py-2 font-code text-sm whitespace-nowrap text-fg">{{ fresh.id }}</code>
            <code v-if="fresh.secret" class="overflow-x-auto rounded-2 border border-line-strong bg-field px-3 py-2 font-code text-sm whitespace-nowrap text-fg">{{ fresh.secret }}</code>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <button class="btn primary sm" @click="copy(fresh.id, $event.currentTarget)">
              <AppIcon name="copy" /><span data-label>Copy client ID</span>
            </button>
            <button class="btn sm" @click="fresh = null">Done</button>
            <span v-if="!fresh.secret" class="font-ui text-sm text-muted">
              No secret. If the app asks how it authenticates, choose "none".
            </span>
          </div>
        </div>

        <div v-if="app.kind === 'oauth'" class="flex flex-col gap-2 border-t border-line pt-4">
          <b class="font-ui text-sm text-fg">
            {{ progress.reached >= 3 ? `${progress.match?.name || app.name} is connected` : `Waiting for ${app.name}` }}
          </b>
          <ol class="m-0 grid list-none grid-cols-3 gap-2 p-0">
            <li v-for="(s, i) in STAGES" :key="s" class="flex flex-col gap-1.5 font-ui text-xs" :class="stageState(i) === 'todo' ? 'text-muted' : 'text-fg'">
              <span class="block h-1 overflow-hidden rounded-1 bg-line">
                <span
                  class="block h-full transition-[width] duration-300"
                  :class="stageState(i) === 'done' ? 'w-full bg-ok' : stageState(i) === 'now' ? 'w-1/2 bg-fg motion-safe:animate-pulse' : 'w-0'"
                />
              </span>
              {{ s }}
            </li>
          </ol>
          <p v-if="progress.refused" class="m-0 font-ui text-sm text-danger" role="status">
            {{ app.name }} was refused: {{ progress.refused }}
          </p>
        </div>
      </div>
    </div>

    <p v-if="trouble" class="m-0 mt-2 font-ui text-sm text-danger" role="alert">{{ trouble }}</p>

    <HubSkeleton v-if="loadingClients" variant="lines" :rows="2" label="Loading connected apps" />
    <div v-else-if="clients.length" class="@container">
      <div aria-hidden="true" class="register-label hidden grid-cols-[minmax(0,1fr)_minmax(0,14rem)_5rem_auto] gap-x-4 border-b border-line pt-3 pb-2 @2xl:grid">
        <span>App</span><span>State</span><span class="text-right">Last used</span><span class="w-28" />
      </div>
      <ul class="m-0 list-none p-0">
        <li v-for="client in clients" :key="client.id" class="border-b border-line py-3 last:border-b-0">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-sm @2xl:grid @2xl:gap-x-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_5rem_auto]">
            <span class="flex min-w-0 basis-full items-center gap-3 @2xl:basis-auto">
              <span class="grid size-7 shrink-0 place-items-center rounded-2 border border-line bg-field text-fg">
                <AppMark :name="markForHost(client.host)" :size="15" />
              </span>
              <span class="min-w-0">
                <span class="block font-medium break-words text-fg">{{ client.name || client.host || "Unnamed app" }}</span>
                <span class="block text-xs text-muted">
                  {{ client.host }} · {{ client.registered === "dynamic" ? "signed itself in" : "client ID made by hand" }}
                </span>
              </span>
            </span>
            <span class="min-w-0 grow">
              <span :class="tone[connectorState(client).tone]">{{ connectorState(client).label }}</span>
              <span v-if="connectorState(client).detail" class="block text-xs text-muted">{{ connectorState(client).detail }}</span>
            </span>
            <span class="text-muted tabular-nums @2xl:text-right @2xl:text-fg">
              <span class="@2xl:hidden" aria-hidden="true">Used </span>{{ client.used ? age(client.used) : "never" }}
            </span>
            <span class="flex basis-full flex-wrap gap-2 pt-1 @2xl:basis-auto @2xl:w-28 @2xl:justify-end @2xl:pt-0">
              <button
                v-if="connectorState(client).tone === 'bad'"
                class="btn sm"
                type="button"
                @click="stepsFor(appForHost(client.host))"
              >Reconnect</button>
              <button v-if="removing !== client.id" class="btn sm" type="button" @click="removing = client.id">Disconnect…</button>
            </span>
          </div>
          <div v-if="removing === client.id" class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2" role="alert">
            <p class="m-0 min-w-0 grow basis-64 font-ui text-sm">Disconnect {{ client.name || client.host || "this app" }}? It stops working as you at once; connect it again to bring it back.</p>
            <button class="btn sm outline danger" type="button" @click="remove(client.id)">Disconnect</button>
            <button class="btn sm" type="button" @click="removing = null">Keep it</button>
          </div>
        </li>
      </ul>
    </div>
    <p v-else class="m-0 border-b border-line py-3 font-ui text-sm text-muted">
      Nothing connected yet. Pick your assistant above, or point it at <code class="font-code text-xs">{{ MCP_URL }}</code> directly.
    </p>
  </div>
</template>
