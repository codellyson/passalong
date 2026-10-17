<!--
  Integrations (apps/api/src/inbound.ts): the ways a guide arrives from outside — email to an address,
  or a webhook from Sentry, PostHog or your own code — and the email senders asking to be let in.

  The kind is in the address or URL (`+bug`, `/bug`) because a guide's kind is always stated,
  never guessed, and whoever picks the address is the one stating it. It asks where the work comes
  from and shows only that source's addresses and steps: Settings is overwhelming already, and four
  sources' instructions at once would be the worst of it.
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
  hooks: Record<Kind, string> | null;
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
const source = ref<"email" | "sentry" | "posthog" | "code">("email");
/**
 * The team a webhook files into, on its URL as `?team=`: the team in view, or the only one. Without
 * it a guide stays the account's own and never reaches the team's board.
 */
const team = computed(
  () =>
    data.value.team?.slug ||
    (data.value.me?.teams?.length === 1 ? data.value.me.teams[0]!.slug : ""),
);
const hooks = computed(() =>
  state.value?.hooks
    ? (Object.fromEntries(
        Object.entries(state.value.hooks).map(([k, url]) => [
          k,
          team.value ? `${url}?team=${team.value}` : url,
        ]),
      ) as Record<Kind, string>)
    : null,
);
/** Email shows its addresses; every other source posts to its URL. */
const shown = computed(() => (source.value === "email" ? state.value?.addresses : hooks.value));
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

const make = () => run("make", () => api("/v1/inbound", json("POST")));
const off = () => run("off", () => api("/v1/inbound", { method: "DELETE" }));
const decide = (s: Sender, to: "allowed" | "blocked") =>
  run(`${to}:${s.sender}`, () =>
    api("/v1/inbound/senders", json("PATCH", { sender: s.sender, state: to })),
  );

const choices = [
  { id: "email", label: "Email", mark: "gmail" },
  { id: "sentry", label: "Sentry", mark: "sentry" },
  { id: "posthog", label: "PostHog", mark: "posthog" },
  { id: "code", label: "Your own code", mark: "script" },
] as const;
</script>

<template>
  <div class="flex flex-col gap-4 font-ui text-sm">
    <p v-if="problem" class="m-0 text-danger" role="alert">{{ problem }}</p>
    <HubSkeleton v-if="!state && !problem" variant="lines" :rows="2" label="Loading integrations" />
    <p v-else-if="state && !state.available" class="m-0 text-muted">
      Integrations aren't set up on this server yet.
    </p>

    <template v-else-if="state">
      <div v-if="!state.addresses" class="flex flex-wrap items-center gap-3">
        <button class="btn primary" type="button" :disabled="Boolean(busy)" @click="make">
          {{ busy === "make" ? "Making…" : "Get your addresses" }}
        </button>
        <span class="text-muted">For email, Sentry, PostHog and your own code: one for each kind of guide.</span>
      </div>

      <template v-else>
        <fieldset class="m-0 flex flex-col gap-3 border-0 p-0">
          <legend class="mb-2 p-0 font-medium text-fg">Where does the work come from?</legend>
          <div class="flex flex-wrap gap-2" role="radiogroup">
            <label
              v-for="c in choices"
              :key="c.id"
              class="btn sm static"
              :class="source === c.id ? 'primary' : ''"
            >
              <input v-model="source" class="sr-only" type="radio" name="work-source" :value="c.id" />
              <AppMark :name="c.mark" :size="14" />
              {{ c.label }}
            </label>
          </div>

          <ul v-if="shown" class="m-0 flex list-none flex-col gap-3 p-0">
            <li v-for="k in KINDS" :key="k.id" class="flex flex-col gap-2">
              <span><b class="font-medium text-fg">{{ k.label }}</b> <span class="text-muted">· {{ k.note }}</span></span>
              <div class="flex flex-wrap items-center gap-2">
                <code
                  class="flex h-[var(--control-h)] min-w-0 flex-1 items-center overflow-x-auto rounded-1 border border-line-strong bg-field px-3 font-code text-sm whitespace-nowrap text-fg"
                >{{ shown[k.id] }}</code>
                <button class="btn" type="button" @click="copy(shown[k.id], $event.currentTarget)">
                  <AppIcon name="copy" /><span data-label>Copy</span>
                </button>
              </div>
            </li>
          </ul>

          <div v-if="source === 'email'" class="flex flex-col gap-2 text-muted">
            <p class="m-0">
              Give an address to anything that sends email — an uptime monitor, a form, a colleague —
              or add it as a BCC where your backend sends mail. A sender's first email asks to be
              allowed below. To pass on one email, forward it from {{ myEmail }}.
            </p>
            <p class="m-0">
              For mail you can't change, forward it from Gmail: Settings, then
              <b class="font-medium text-fg">Forwarding</b>, add an address, and Gmail's confirmation
              code shows up below as a sender. Then make a filter for the mail you want.
            </p>
          </div>
          <ol v-else-if="source === 'sentry'" class="m-0 flex flex-col gap-1 pl-5 text-muted">
            <li>
              In Sentry, open <b class="font-medium text-fg">Settings → Developer Settings → Custom
              Integrations</b> and create an <b class="font-medium text-fg">Internal Integration</b>.
            </li>
            <li>Paste the Bug URL above as its <b class="font-medium text-fg">Webhook URL</b>.</li>
            <li>
              Under <b class="font-medium text-fg">Webhooks</b>, tick <b class="font-medium text-fg">issue</b>
              for every new issue, and turn on <b class="font-medium text-fg">Alert Rule Action</b> to
              send only what an alert rule picks. Save.
            </li>
            <li>
              Repeats of one Sentry issue stay one guide; resolved, assigned and other updates are
              ignored. For a task URL, add <code>{{ team ? "&" : "?" }}repo=owner/repo</code> so it arrives pointed at that
              repo; otherwise you choose the repo when you mark it Ready.
            </li>
          </ol>
          <ol v-else-if="source === 'posthog'" class="m-0 flex flex-col gap-1 pl-5 text-muted">
            <li>
              In PostHog, open <b class="font-medium text-fg">Error tracking → Configuration →
              Alerting</b> and add an <b class="font-medium text-fg">HTTP Webhook</b> for issues created.
            </li>
            <li>Paste the Bug URL above, and leave the body as it is.</li>
            <li>
              Use <b class="font-medium text-fg">Test function</b>, then
              <b class="font-medium text-fg">Create &amp; enable</b>. Repeats of one issue stay one guide.
              A task URL takes <code>{{ team ? "&" : "?" }}repo=owner/repo</code> too.
            </li>
          </ol>
          <div v-else class="flex flex-col gap-2 text-muted">
            <p class="m-0">
              POST JSON to a URL above. Only <code>title</code> is required; send the same
              <code>id</code> again and it adds to the open guide instead of making a new one. Add
              <code>{{ team ? "&" : "?" }}repo=owner/repo</code> to a task URL to say which repo it is for.
            </p>
            <code class="block overflow-x-auto rounded-1 border border-line bg-field px-3 py-2 font-code text-sm whitespace-pre text-fg">curl -X POST {{ hooks?.task }} \
  -H 'content-type: application/json' \
  -d '{"title": "Checkout is down", "text": "500s since 09:12", "url": "https://…", "id": "checkout-500"}'</code>
          </div>
          <p v-if="source !== 'email'" class="m-0 text-muted">
            <template v-if="team">
              These URLs put what arrives on <b class="font-medium text-fg">{{ team }}</b>'s board.
              Add <code>&amp;to=@handle</code> for one person. A URL you pasted before without
              <code>?team=</code> files only for you: replace it with this one.
            </template>
            <template v-else>Pick a team at the top to get URLs that file onto its board; without one, what arrives is only yours.</template>
          </p>
        </fieldset>

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
            {{ confirming === "new" ? "The old addresses stop working at once." : "Email and webhooks sent to them stop arriving." }}
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
