<!--
  Connected apps: what uses Passalong as you, and how to add one.

  Connecting starts from the app, not from a form. Every app's requirements are known — Claude
  signs itself in, ChatGPT wants a client ID and no secret, Claude Code and Cursor run locally — so
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

const progress = computed(() => handshake(clients.value, since.value));
const watching = computed(
  () => connect.value.open && app.value.kind === "oauth" && progress.value.reached < 3,
);
const { data: loaded, isPending: loadingClients, error: loadFailed } = useConnectors(watching);
const clients = computed(() => loaded.value ?? []);
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

const cell = "border-0 border-b border-b-line px-0 py-3 align-top";
const head =
  "border-0 border-b border-b-line bg-transparent px-0 py-2 font-ui text-xs font-semibold tracking-wide text-muted uppercase";
const tone = {
  ok: "bg-ok-soft text-ok",
  bad: "bg-danger-soft text-danger",
  idle: "bg-surface text-muted",
};
const dot = { none: "bg-ok", done: "bg-accent", you: "bg-warn" };
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="connect.open"
      class="grid overflow-hidden rounded-2 bg-raised shadow-edge md:grid-cols-[13rem_1fr]"
    >
      <div
        ref="picker"
        class="border-b border-line bg-surface p-2 md:border-r md:border-b-0"
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
            :class="a.id === connect.app ? 'border-line-strong bg-raised' : 'border-transparent bg-transparent hover:bg-raised'"
            @click="stepsFor(a.id)"
          >
            <span
              class="grid size-8 place-items-center rounded-1 border"
              :class="a.id === connect.app ? 'border-transparent bg-accent-soft text-accent' : 'border-line bg-bg text-fg'"
            >
              <AppMark :name="a.mark" :size="18" />
            </span>
            <span class="min-w-0">
              <span class="block font-ui text-sm font-medium text-fg">{{ a.name }}</span>
              <span class="block font-ui text-xs text-muted">{{ a.how }}</span>
            </span>
          </button>
        </template>
      </div>

      <div class="flex min-w-0 flex-col gap-5 p-5" aria-live="polite">
        <div class="flex flex-wrap items-start gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-1 border border-line bg-bg text-fg">
            <AppMark :name="app.mark" :size="22" />
          </span>
          <div class="min-w-48 grow">
            <h4 class="m-0 font-ui text-lg font-semibold text-fg">{{ app.name }}</h4>
            <p class="mt-1 mb-0 max-w-prose font-ui text-sm text-muted">{{ app.lede }}</p>
          </div>
          <span class="rounded-pill border border-accent px-3 py-0.5 font-ui text-xs font-medium text-accent">
            {{ app.method }}
          </span>
        </div>

        <dl class="m-0 grid rounded-1 border border-line sm:grid-cols-3" :aria-label="`What ${app.name} needs`">
          <div
            v-for="r in app.requirements"
            :key="r.label"
            class="border-b border-line px-3 py-2 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
          >
            <dt class="font-ui text-xs tracking-wide text-muted uppercase">{{ r.label }}</dt>
            <dd class="m-0 flex items-baseline gap-2 font-ui text-sm text-fg">
              <span class="inline-block size-2 shrink-0 rounded-pill" :class="dot[r.need]" aria-hidden="true" />{{ r.value }}
            </dd>
          </div>
        </dl>

        <ol class="m-0 flex list-none flex-col gap-4 p-0">
          <li v-for="(s, i) in app.steps" :key="s.text" class="grid grid-cols-[1.5rem_1fr] gap-3">
            <span class="grid size-6 place-items-center rounded-pill border border-line-strong font-code text-xs text-muted">{{ i + 1 }}</span>
            <div class="flex min-w-0 flex-col gap-2 font-ui text-sm text-fg">
              <p class="m-0">
                <template v-for="(p, n) in parts(s.text)" :key="n">
                  <b v-if="n > 0" class="font-medium">{{ s.path }}</b>{{ p }}
                </template>
              </p>
              <div v-if="s.copy" class="flex max-w-full items-stretch overflow-hidden rounded-1 border border-line-strong bg-surface">
                <pre class="m-0 min-w-0 flex-1 overflow-x-auto px-3 py-2 font-code text-xs">{{ s.copy }}</pre>
                <button type="button" class="btn sm rounded-none border-0 border-l border-line-strong" @click="copy(s.copy, $event.currentTarget)">
                  <AppIcon name="copy" /><span data-label>Copy</span>
                </button>
              </div>
              <dl v-if="s.fields" class="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
                <template v-for="[k, v] in s.fields" :key="k">
                  <dt class="text-muted">{{ k }}</dt>
                  <dd class="m-0">
                    <span v-if="v === null" class="rounded-1 bg-ok-soft px-1.5 font-code text-xs text-ok">leave empty</span>
                    <template v-else>{{ v }}</template>
                  </dd>
                </template>
              </dl>
            </div>
          </li>
        </ol>

        <div v-if="app.notes.length" class="flex flex-col gap-2">
          <p
            v-for="n in app.notes"
            :key="n.label"
            class="m-0 grid grid-cols-[auto_1fr] gap-3 rounded-1 px-3 py-2 font-ui text-sm"
            :class="n.tone === 'warn' ? 'bg-warn-soft' : 'bg-surface'"
          >
            <span class="pt-0.5 text-xs tracking-wide uppercase" :class="n.tone === 'warn' ? 'text-warn' : 'text-muted'">{{ n.label }}</span>
            <span>{{ n.text }}</span>
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
          <form class="mt-3 flex flex-col gap-3 rounded-1 border border-dashed border-line-strong p-3" @submit.prevent="createClient">
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
              <input :id="`secret-${app.id}`" v-model="confidential" type="checkbox" class="mt-1 w-auto">
              Give it a secret too. Only if the app has a client secret field it won't leave empty — a
              secret it never sends means it never gets in.
            </label>
            <button class="btn primary sm self-start" type="submit" :disabled="busy || !callback.trim()">
              {{ busy ? "Creating…" : "Create client ID" }}
            </button>
          </form>
        </details>

        <!-- Shown once, like a new token: the page holds something the server cannot give back. -->
        <div v-if="fresh" class="rounded-2 border border-accent bg-accent-soft p-3">
          <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <b class="font-ui text-sm text-fg">Client ID<template v-if="fresh.secret"> and secret · shown once</template></b>
            <span class="font-ui text-sm text-accent">Paste into {{ app.id === "other" ? "the app" : app.name }}</span>
          </div>
          <div class="flex flex-col gap-2">
            <code class="overflow-x-auto rounded-1 border border-line-strong bg-raised px-3 py-2 font-code text-sm whitespace-nowrap text-fg">{{ fresh.id }}</code>
            <code v-if="fresh.secret" class="overflow-x-auto rounded-1 border border-line-strong bg-raised px-3 py-2 font-code text-sm whitespace-nowrap text-fg">{{ fresh.secret }}</code>
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
          <div class="flex flex-wrap items-baseline gap-3">
            <b class="font-ui text-sm text-fg">
              {{ progress.reached >= 3 ? `${progress.match?.name || app.name} is connected` : `Waiting for ${app.name}` }}
            </b>
            <span class="font-ui text-sm text-muted">Fills in as it happens.</span>
          </div>
          <ol class="m-0 grid list-none grid-cols-3 gap-2 p-0">
            <li v-for="(s, i) in STAGES" :key="s" class="flex flex-col gap-1.5 font-ui text-sm" :class="stageState(i) === 'todo' ? 'text-muted' : 'text-fg'">
              <span class="block h-1 overflow-hidden rounded-pill bg-line">
                <span
                  class="block h-full rounded-pill transition-[width] duration-300"
                  :class="stageState(i) === 'done' ? 'w-full bg-ok' : stageState(i) === 'now' ? 'w-1/2 bg-accent motion-safe:animate-pulse' : 'w-0'"
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

    <p v-if="trouble" class="m-0 font-ui text-sm text-danger">{{ trouble }}</p>

    <HubSkeleton v-if="loadingClients" variant="lines" :rows="2" label="Loading connected apps" />
    <div v-else-if="clients.length" class="overflow-x-auto">
      <table class="w-full min-w-[34rem]">
        <thead>
          <tr>
            <th :class="head">App</th>
            <th :class="head">Status</th>
            <th :class="head">Last used</th>
            <th :class="head"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="client in clients" :key="client.id">
            <td :class="cell" class="pr-3">
              <span class="flex items-center gap-2.5">
                <span class="grid size-7 shrink-0 place-items-center rounded-1 border border-line bg-bg text-fg">
                  <AppMark :name="markForHost(client.host)" :size="15" />
                </span>
                <span class="min-w-0">
                  <span class="block font-ui text-sm font-semibold text-fg">{{ client.name || client.host || "Unnamed app" }}</span>
                  <span class="block font-ui text-xs text-muted">
                    {{ client.host }} · {{ client.registered === "dynamic" ? "signed itself in" : "client ID made by hand" }}
                  </span>
                </span>
              </span>
            </td>
            <td :class="cell" class="pr-3">
              <span class="rounded-pill px-2 py-0.5 font-ui text-xs font-medium" :class="tone[connectorState(client).tone]">
                {{ connectorState(client).label }}
              </span>
              <p v-if="connectorState(client).detail" class="mt-1 mb-0 max-w-[40ch] font-ui text-sm text-muted">
                {{ connectorState(client).detail }}
              </p>
            </td>
            <td :class="cell" class="pr-3 font-ui text-sm whitespace-nowrap text-muted tabular-nums">
              {{ client.used ? rel(client.used) : "never" }}
            </td>
            <td :class="cell" class="text-right whitespace-nowrap">
              <template v-if="removing === client.id">
                <span class="mr-2 font-ui text-sm text-muted">It stops working now.</span>
                <button class="btn outline danger sm" @click="remove(client.id)">Disconnect</button>
                <button class="btn sm ml-2" @click="removing = null">Cancel</button>
              </template>
              <template v-else>
                <button
                  v-if="connectorState(client).tone === 'bad'"
                  class="btn outline sm mr-2"
                  @click="stepsFor(appForHost(client.host))"
                >
                  Reconnect
                </button>
                <button class="btn destructive sm" @click="removing = client.id">Disconnect</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="m-0 font-ui text-sm text-muted">
      Nothing connected yet. Your assistants can also use <code>{{ MCP_URL }}</code> directly.
    </p>
  </div>
</template>
