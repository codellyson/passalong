<!--
  Alerts by email (apps/api/src/inbound.ts): an address to add to whatever sends your alerts, so
  each alert arrives as a Draft task, and the senders that have written to it.

  The setup depends on who sends the alert, so it asks that first and shows one set of steps:
  a tool takes the address in its notification settings, your own code adds it as a BCC, and mail
  you cannot change is forwarded from Gmail. A sender's first message only asks to be let in.
-->
<script setup lang="ts">
interface Sender {
  sender: string;
  state: "pending" | "allowed" | "blocked";
  subject: string;
  last_at: string;
  times: number;
}

const { api, json, data } = useHub();
const myEmail = computed(() => data.value.me?.email || "your account's email");

const state = ref<{
  available: boolean;
  address: string;
  target: string;
  senders: Sender[];
} | null>(null);
const busy = ref("");
const problem = ref("");
const source = ref<"tool" | "code" | "gmail">("tool");
/** Replacing or removing the address breaks whatever uses it, so it asks in place first. */
const confirming = ref<"" | "new" | "off">("");

const pending = computed(() => state.value?.senders.filter((s) => s.state === "pending") ?? []);
const decided = computed(() => state.value?.senders.filter((s) => s.state !== "pending") ?? []);

async function load() {
  state.value = await api("/v1/inbound");
}
onMounted(() => load().catch((e) => (problem.value = (e as Error).message)));

async function run(what: string, fn: () => Promise<unknown>) {
  busy.value = what;
  problem.value = "";
  try {
    await fn();
    confirming.value = "";
    await load();
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    busy.value = "";
  }
}

/** Read through the form on submit: the input is prefilled, so it stays uncontrolled. */
const saveTarget = (form: HTMLFormElement) =>
  run("target", () => api("/v1/inbound", json("PATCH", { target: field(form, "target") })));
const make = () => run("make", () => api("/v1/inbound", json("POST")));
const off = () => run("off", () => api("/v1/inbound", { method: "DELETE" }));
const decide = (s: Sender, to: "allowed" | "blocked") =>
  run(`${to}:${s.sender}`, () =>
    api("/v1/inbound/senders", json("PATCH", { sender: s.sender, state: to })),
  );

const choices = [
  { id: "tool", label: "A tool" },
  { id: "code", label: "My own code" },
  { id: "gmail", label: "Mail I can't change" },
] as const;
</script>

<template>
  <div class="flex flex-col gap-4 font-ui text-sm">
    <p v-if="problem" class="m-0 text-danger" role="alert">{{ problem }}</p>
    <HubSkeleton v-if="!state && !problem" variant="lines" :rows="2" label="Loading alerts" />
    <p v-else-if="state && !state.available" class="m-0 text-muted">
      Alerts by email aren't set up on this server yet.
    </p>

    <template v-else-if="state">
      <div v-if="!state.address" class="flex flex-wrap items-center gap-3">
        <button class="btn primary" type="button" :disabled="Boolean(busy)" @click="make">
          {{ busy === "make" ? "Making…" : "Get an alert address" }}
        </button>
        <span class="text-muted">Each alert sent to it becomes a Draft task.</span>
      </div>

      <template v-else>
        <div class="flex flex-wrap items-center gap-2">
          <code
            class="flex h-[var(--control-h)] min-w-0 flex-1 items-center overflow-x-auto rounded-1 border border-line-strong bg-field px-3 font-code text-sm whitespace-nowrap text-fg"
          >{{ state.address }}</code>
          <button class="btn primary" type="button" @click="copy(state.address, $event.currentTarget)">
            <AppIcon name="copy" /><span data-label>Copy address</span>
          </button>
        </div>

        <fieldset class="m-0 flex flex-col gap-3 border-0 p-0">
          <legend class="mb-2 p-0 font-medium text-fg">Who sends your alerts?</legend>
          <div class="flex flex-wrap gap-2" role="radiogroup">
            <label
              v-for="c in choices"
              :key="c.id"
              class="btn sm static"
              :class="source === c.id ? 'primary' : ''"
            >
              <input v-model="source" class="sr-only" type="radio" name="alert-source" :value="c.id" />
              {{ c.label }}
            </label>
          </div>
          <p v-if="source === 'tool'" class="m-0 text-muted">
            In Sentry, PostHog, your uptime monitor or similar, add the address as one more email
            recipient for alerts. Your own inbox keeps getting them too.
          </p>
          <div v-else-if="source === 'code'" class="flex flex-col gap-2 text-muted">
            <p class="m-0">Where your backend sends its error mail, add the address as a BCC:</p>
            <code class="block overflow-x-auto rounded-1 border border-line bg-field px-3 py-2 font-code text-sm whitespace-pre text-fg">bcc: "{{ state.address }}"</code>
          </div>
          <p v-else class="m-0 text-muted">
            In Gmail, open Settings, then <b class="font-medium text-fg">Forwarding</b>, and add the
            address. Gmail sends a confirmation code here: it appears below as a sender, with the code
            in its subject. Then make a filter that forwards your alerts. To pass on one email, just
            forward it from {{ myEmail }}.
          </p>
        </fieldset>

        <form class="flex flex-col gap-2" @submit.prevent="saveTarget($event.target as HTMLFormElement)">
          <label class="font-medium text-fg" for="alert-target">Which repo are these fixed in?</label>
          <div class="flex flex-wrap items-center gap-2">
            <input
              id="alert-target"
              :key="state.target"
              name="target"
              class="min-w-0 flex-1 basis-64"
              placeholder="owner/repo"
              :value="state.target"
              autocomplete="off"
              spellcheck="false"
            />
            <button class="btn" type="submit" :disabled="Boolean(busy)">
              {{ busy === "target" ? "Saving…" : "Save" }}
            </button>
          </div>
          <p class="m-0 text-muted">
            {{
              state.target
                ? `Once Ready, an agent working in ${state.target} takes these on its own.`
                : "Without one, an agent only takes these when given the task. owner/repo, as in the git remote."
            }}
          </p>
        </form>
      </template>

      <div v-if="pending.length" class="flex flex-col gap-2">
        <h4 class="m-0 font-medium text-fg">Asking to send you alerts</h4>
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          <li
            v-for="s in pending"
            :key="s.sender"
            class="flex flex-wrap items-center gap-3 rounded-2 bg-field px-4 py-3 shadow-edge"
          >
            <div class="min-w-0 grow basis-64">
              <b class="block font-medium break-all text-fg">{{ s.sender }}</b>
              <span class="block text-xs text-muted">"{{ s.subject || "no subject" }}" · {{ rel(s.last_at) }}</span>
            </div>
            <button class="btn primary sm" type="button" :disabled="Boolean(busy)" @click="decide(s, 'allowed')">Allow</button>
            <button class="btn outline danger sm" type="button" :disabled="Boolean(busy)" @click="decide(s, 'blocked')">Block</button>
          </li>
        </ul>
        <p class="m-0 text-xs text-muted">Allowing one doesn't turn what it already sent into tasks; its next alert does.</p>
      </div>

      <div v-if="decided.length" class="flex flex-col gap-2">
        <h4 class="m-0 font-medium text-fg">Senders</h4>
        <ul class="m-0 flex list-none flex-col p-0">
          <li v-for="s in decided" :key="s.sender" class="flex flex-wrap items-center gap-3 border-0 border-b border-b-line py-2">
            <span class="min-w-0 grow break-all text-fg">{{ s.sender }}</span>
            <span class="text-xs text-muted">{{ s.state === "allowed" ? "Allowed" : "Blocked" }}</span>
            <button
              class="btn sm"
              type="button"
              :disabled="Boolean(busy)"
              @click="decide(s, s.state === 'allowed' ? 'blocked' : 'allowed')"
            >
              {{ s.state === "allowed" ? "Block" : "Allow" }}
            </button>
          </li>
        </ul>
      </div>

      <div v-if="state.address" class="flex flex-wrap items-center gap-2">
        <template v-if="confirming">
          <span class="text-muted">
            {{ confirming === "new" ? "The old address stops working at once." : "Alerts sent to it stop arriving." }}
          </span>
          <button class="btn outline danger sm" type="button" :disabled="Boolean(busy)" @click="confirming === 'new' ? make() : off()">
            {{ confirming === "new" ? "Make a new address" : "Turn it off" }}
          </button>
          <button class="btn sm" type="button" @click="confirming = ''">Cancel</button>
        </template>
        <template v-else>
          <button class="btn sm" type="button" @click="confirming = 'new'">New address</button>
          <button class="btn destructive sm" type="button" @click="confirming = 'off'">Turn off</button>
        </template>
      </div>
    </template>
  </div>
</template>
