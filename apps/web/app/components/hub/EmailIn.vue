<!--
  Email in (apps/api/src/inbound.ts): addresses that turn email into guides, one per kind, and the
  senders that have written to them.

  The kind is in the address — `+task`, `+bug`, `+transfer` — because a guide's kind is always
  stated, never guessed, and whoever picks the address is the one stating it. How to use them
  depends on who sends the email, so it asks that and shows one set of steps: a tool takes an
  address in its notification settings, your own code adds one as a BCC, and mail you cannot
  change is forwarded from Gmail. A sender's first message only asks to be let in.
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

type Kind = "task" | "bug" | "transfer";
const state = ref<{
  available: boolean;
  addresses: Record<Kind, string> | null;
  target: string;
  senders: Sender[];
} | null>(null);

/** What each address makes, in the words the rest of the hub uses for them. */
const KINDS: { id: Kind; label: string; note: string }[] = [
  { id: "task", label: "Task", note: "work to do; a Draft until you mark it Ready" },
  { id: "bug", label: "Bug", note: "a defect to fix" },
  { id: "transfer", label: "Transfer", note: "context to hand over" },
];
const busy = ref("");
const problem = ref("");
const source = ref<"tool" | "code" | "gmail">("tool");
/** Replacing or removing the addresses breaks whatever uses them, so it asks in place first. */
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
    <HubSkeleton v-if="!state && !problem" variant="lines" :rows="2" label="Loading email in" />
    <p v-else-if="state && !state.available" class="m-0 text-muted">
      Email in isn't set up on this server yet.
    </p>

    <template v-else-if="state">
      <div v-if="!state.addresses" class="flex flex-wrap items-center gap-3">
        <button class="btn primary" type="button" :disabled="Boolean(busy)" @click="make">
          {{ busy === "make" ? "Making…" : "Get your addresses" }}
        </button>
        <span class="text-muted">One for each kind of guide: task, bug and transfer.</span>
      </div>

      <template v-else>
        <ul class="m-0 flex list-none flex-col gap-3 p-0">
          <li v-for="k in KINDS" :key="k.id" class="flex flex-col gap-2">
            <span><b class="font-medium text-fg">{{ k.label }}</b> <span class="text-muted">· {{ k.note }}</span></span>
            <div class="flex flex-wrap items-center gap-2">
              <code
                class="flex h-[var(--control-h)] min-w-0 flex-1 items-center overflow-x-auto rounded-1 border border-line-strong bg-field px-3 font-code text-sm whitespace-nowrap text-fg"
              >{{ state.addresses[k.id] }}</code>
              <button class="btn" type="button" @click="copy(state.addresses[k.id], $event.currentTarget)">
                <AppIcon name="copy" /><span data-label>Copy</span>
              </button>
            </div>
          </li>
        </ul>

        <fieldset class="m-0 flex flex-col gap-3 border-0 p-0">
          <legend class="mb-2 p-0 font-medium text-fg">Who sends the email?</legend>
          <div class="flex flex-wrap gap-2" role="radiogroup">
            <label
              v-for="c in choices"
              :key="c.id"
              class="btn sm static"
              :class="source === c.id ? 'primary' : ''"
            >
              <input v-model="source" class="sr-only" type="radio" name="email-source" :value="c.id" />
              {{ c.label }}
            </label>
          </div>
          <p v-if="source === 'tool'" class="m-0 text-muted">
            In Sentry, PostHog, an uptime monitor or any tool that sends email, add one of the
            addresses as one more recipient: usually Bug for errors. Your own inbox keeps getting them
            too.
          </p>
          <div v-else-if="source === 'code'" class="flex flex-col gap-2 text-muted">
            <p class="m-0">Where your backend sends mail, add the address for the kind you want as a BCC:</p>
            <code class="block overflow-x-auto rounded-1 border border-line bg-field px-3 py-2 font-code text-sm whitespace-pre text-fg">bcc: "{{ state.addresses.bug }}"</code>
          </div>
          <p v-else class="m-0 text-muted">
            In Gmail, open Settings, then <b class="font-medium text-fg">Forwarding</b>, and add one of
            the addresses. Gmail sends a confirmation code here: it appears below as a sender, with the
            code in its subject. Then make a filter that forwards the mail you want. To pass on one
            email, just forward it from {{ myEmail }}.
          </p>
        </fieldset>

        <form class="flex flex-col gap-2" @submit.prevent="saveTarget($event.target as HTMLFormElement)">
          <label class="font-medium text-fg" for="email-target">Which repo are tasks for?</label>
          <div class="flex flex-wrap items-center gap-2">
            <input
              id="email-target"
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
                ? `Once Ready, an agent working in ${state.target} takes a task from email on its own.`
                : "Without one, an agent only takes a task from email when given it. owner/repo, as in the git remote."
            }}
          </p>
        </form>
      </template>

      <div v-if="pending.length" class="flex flex-col gap-2">
        <h4 class="m-0 font-medium text-fg">Asking to email you guides</h4>
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
        <p class="m-0 text-xs text-muted">Allowing one doesn't turn what it already sent into guides; its next email does.</p>
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

      <div v-if="state.addresses" class="flex flex-wrap items-center gap-2">
        <template v-if="confirming">
          <span class="text-muted">
            {{ confirming === "new" ? "The old addresses stop working at once." : "Email sent to them stops arriving." }}
          </span>
          <button class="btn outline danger sm" type="button" :disabled="Boolean(busy)" @click="confirming === 'new' ? make() : off()">
            {{ confirming === "new" ? "Make new addresses" : "Turn it off" }}
          </button>
          <button class="btn sm" type="button" @click="confirming = ''">Cancel</button>
        </template>
        <template v-else>
          <button class="btn sm" type="button" @click="confirming = 'new'">New addresses</button>
          <button class="btn destructive sm" type="button" @click="confirming = 'off'">Turn off</button>
        </template>
      </div>
    </template>
  </div>
</template>
