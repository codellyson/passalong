<!--
  Integrations (apps/api/src/inbound.ts): the ways work arrives from outside — email to an address,
  or a webhook from Sentry, PostHog or your own code — and the email senders asking to be let in.

  One address takes anything and the agent sorts it, as the box does; customers write to their own.
  It asks where the work comes from and shows only that source's address and steps: Settings is
  overwhelming already, and four sources' instructions at once would be the worst of it.
-->
<script setup lang="ts">
import { age } from "~/utils/projects";

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
  addresses: { new: string; support: string } | null;
  hook: string | null;
  senders: Sender[];
} | null>(null);

/**
 * Email has two addresses: anything, sorted by the agent, and the one customers write to. A webhook
 * has one URL, and no customer to answer.
 */
const ROWS = [
  {
    id: "new" as const,
    label: "Anything",
    note: "The agent sorts it and reads its pictures. On a phone, share a screenshot to Mail and send it here.",
  },
  {
    id: "support" as const,
    label: "Customer support",
    note: "Anyone can write. They get a tracking number, and you answer from the work.",
  },
];
const busy = ref("");
const problem = ref("");
const source = ref<"email" | "sentry" | "posthog" | "code">("email");
/**
 * The team a webhook files into, on its URL as `?team=`: the team in view, or the only one. Without
 * it the work stays the account's own and never reaches the team's board.
 */
const team = computed(
  () =>
    data.value.team?.slug ||
    (data.value.me?.teams?.length === 1 ? data.value.me.teams[0]!.slug : ""),
);
/** The webhook URL with the team on it, for the same reason. */
const hook = computed(() =>
  state.value?.hook ? `${state.value.hook}${team.value ? `?team=${team.value}` : ""}` : "",
);
/** The addresses with the team in them, `key+new+team@…`, for the same reason. */
const withTeam = (a: string) => (team.value && a ? a.replace("@", `+${team.value}@`) : a);
/** Email shows its addresses; every other source posts to the one URL. */
const shown = computed(() =>
  !state.value?.addresses
    ? []
    : source.value === "email"
      ? ROWS.map((r) => ({ ...r, value: withTeam(state.value!.addresses![r.id]) }))
      : [
          {
            id: "hook",
            label: "Webhook URL",
            note: "The agent sorts what arrives.",
            value: hook.value,
          },
        ],
);
/** Replacing or removing the addresses breaks whatever uses them, so it asks in place first. */
const confirming = ref<"" | "new" | "off">("");

/** Asking first, then the ones already decided: a pending sender is the only row that waits on you. */
const senders = computed(() =>
  [...(state.value?.senders ?? [])].sort(
    (a, b) => Number(b.state === "pending") - Number(a.state === "pending"),
  ),
);
const STATE_WORD = { pending: "Asking", allowed: "Allowed", blocked: "Blocked" } as const;

async function load() {
  state.value = await api("/v1/inbound");
}
const retry = () => {
  problem.value = "";
  load().catch((e) => (problem.value = (e as Error).message));
};
onMounted(retry);

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
  <div class="flex flex-col gap-10">
    <HubSettingsSection
      id="integrations"
      title="Email, Sentry and PostHog"
      blurb="Errors from Sentry and PostHog, and emails sent to you, arrive here as work, sorted by Passalong's agent and ready for whoever it is for."
    >
      <div v-if="problem && !state" role="alert" class="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2 border border-danger bg-danger-soft px-4 py-3">
        <p class="m-0 min-w-0 grow font-ui text-sm text-danger">Integrations didn't load. {{ problem }}</p>
        <button class="btn outline danger sm" type="button" @click="retry">Try again</button>
      </div>
      <HubSkeleton v-else-if="!state" variant="lines" :rows="3" label="Loading integrations" />
      <p v-else-if="!state.available" class="m-0 border-b border-line py-3 font-ui text-sm text-muted">
        Integrations aren't set up on this server yet.
      </p>

      <HubSettingRow v-else-if="!state.addresses" label="Addresses" hint="For email, Sentry, PostHog and your own code.">
        <button class="btn primary sm self-start" type="button" :disabled="Boolean(busy)" @click="make">
          {{ busy === "make" ? "Making…" : "Get your addresses" }}
        </button>
      </HubSettingRow>

      <template v-else>
        <HubSettingRow label="Where it comes from">
          <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Where does the work come from?">
            <label v-for="c in choices" :key="c.id" class="chip-pick font-ui text-sm">
              <input v-model="source" type="radio" name="work-source" :value="c.id" />
              <AppMark :name="c.mark" :size="14" />
              {{ c.label }}
            </label>
          </div>
        </HubSettingRow>

        <HubSettingRow v-for="k in shown" :key="k.id" :label="k.label" :hint="k.note">
          <div class="flex flex-wrap items-center gap-2">
            <code class="flex h-[var(--control-h)] min-w-0 flex-1 basis-64 items-center overflow-x-auto rounded-2 border border-line-strong bg-field px-3 font-code text-sm whitespace-nowrap text-fg">{{ k.value }}</code>
            <button class="btn" type="button" @click="copy(k.value, $event.currentTarget)">
              <AppIcon name="copy" /><span data-label>Copy</span>
            </button>
          </div>
        </HubSettingRow>

        <HubSettingRow label="Setting it up">
          <div v-if="source === 'email'" class="flex max-w-[44rem] flex-col gap-2 text-muted">
            <p class="m-0">
              Give an address to anything that sends email — an uptime monitor, a form, a colleague —
              or add it as a BCC where your backend sends mail. A sender's first email asks to be
              allowed below. To pass on one email, forward it from {{ myEmail }}.
            </p>
            <p class="m-0">
              Customer support is different: forward your support inbox to it, and every customer who
              writes gets a request on the board and an email with a tracking number.
            </p>
            <p class="m-0">
              For mail you can't change, forward it from Gmail: Settings, then
              <b class="font-medium text-fg">Forwarding</b>, add an address, and Gmail's confirmation
              code shows up below as a sender. Then make a filter for the mail you want.
            </p>
          </div>
          <ol v-else-if="source === 'sentry'" class="m-0 flex max-w-[44rem] flex-col gap-1 pl-5 text-muted">
            <li>
              In Sentry, open <b class="font-medium text-fg">Settings → Developer Settings → Custom
              Integrations</b> and create an <b class="font-medium text-fg">Internal Integration</b>.
            </li>
            <li>Paste the URL above as its <b class="font-medium text-fg">Webhook URL</b>.</li>
            <li>
              Under <b class="font-medium text-fg">Webhooks</b>, tick <b class="font-medium text-fg">issue</b>
              for every new issue, and turn on <b class="font-medium text-fg">Alert Rule Action</b> to
              send only what an alert rule picks. Save.
            </li>
            <li>
              Repeats of one Sentry issue stay one piece of work; resolved, assigned and other updates
              are ignored. Add <code>{{ team ? "&" : "?" }}repo=owner/repo</code> so it arrives pointed at that repo.
            </li>
          </ol>
          <ol v-else-if="source === 'posthog'" class="m-0 flex max-w-[44rem] flex-col gap-1 pl-5 text-muted">
            <li>
              In PostHog, open <b class="font-medium text-fg">Error tracking → Configuration →
              Alerting</b> and add an <b class="font-medium text-fg">HTTP Webhook</b> for issues created.
            </li>
            <li>Paste the URL above, and leave the body as it is.</li>
            <li>
              Use <b class="font-medium text-fg">Test function</b>, then
              <b class="font-medium text-fg">Create &amp; enable</b>. Repeats of one issue stay one piece of
              work. The URL takes <code>{{ team ? "&" : "?" }}repo=owner/repo</code> too.
            </li>
          </ol>
          <div v-else class="flex min-w-0 flex-col gap-2 text-muted">
            <p class="m-0 max-w-[44rem]">
              POST JSON to the URL above. Only <code>title</code> is required; send the same
              <code>id</code> again and it adds to the open work instead of making a new one. Add
              <code>{{ team ? "&" : "?" }}repo=owner/repo</code> to say which repo it is for.
            </p>
            <code class="block overflow-x-auto rounded-2 border border-line bg-field px-3 py-2 font-code text-sm whitespace-pre text-fg">curl -X POST {{ hook }} \
  -H 'content-type: application/json' \
  -d '{"title": "Checkout is down", "text": "500s since 09:12", "url": "https://…", "id": "checkout-500"}'</code>
          </div>
          <p class="m-0 max-w-[44rem] text-muted">
            <template v-if="team">
              These {{ source === "email" ? "addresses" : "URLs" }} put what arrives on
              <b class="font-medium text-fg">{{ team }}</b>'s board.
              <template v-if="source !== 'email'">Add <code>&amp;to=@handle</code> for one person.</template>
              One you set up before without the team files only for you: replace it with this one.
            </template>
            <template v-else>Pick a team at the top to get {{ source === "email" ? "addresses" : "URLs" }} that file onto its board; without one, what arrives is only yours.</template>
          </p>
        </HubSettingRow>

        <!-- Replacing or removing the addresses breaks whatever uses them, so it asks in place. -->
        <HubSettingRow label="Replace or turn off" hint="Whatever uses the current addresses stops reaching you.">
          <div v-if="confirming" class="flex flex-wrap items-center gap-x-3 gap-y-2" role="alert">
            <p class="m-0 min-w-0 grow basis-64">
              {{ confirming === "new" ? "Make new addresses? The old ones stop working at once." : "Turn them off? Email and webhooks sent to them stop arriving." }}
            </p>
            <button class="btn outline danger sm" type="button" :disabled="Boolean(busy)" @click="confirming === 'new' ? make() : off()">
              {{ confirming === "new" ? "Make new addresses" : "Turn off" }}
            </button>
            <button class="btn sm" type="button" @click="confirming = ''">Keep them</button>
          </div>
          <div v-else class="flex flex-wrap gap-2">
            <button class="btn sm" type="button" @click="confirming = 'new'">New addresses…</button>
            <button class="btn sm" type="button" @click="confirming = 'off'">Turn off…</button>
          </div>
        </HubSettingRow>
      </template>
      <p v-if="problem && state" class="m-0 mt-2 font-ui text-sm text-danger" role="alert">{{ problem }}</p>
    </HubSettingsSection>

    <HubSettingsSection
      v-if="state?.available && state.addresses"
      id="email-in"
      title="Senders"
      blurb="Who may email you work. A sender's first email asks here; allowing one doesn't turn what it already sent into work, its next email does."
    >
      <div v-if="senders.length" class="@container">
        <div aria-hidden="true" class="register-label hidden grid-cols-[minmax(0,1fr)_minmax(0,14rem)_3.5rem_5rem_9rem] gap-x-4 border-b border-line pt-3 pb-2 @2xl:grid">
          <span>Sender</span><span>Last subject</span><span class="text-right">When</span><span>State</span><span />
        </div>
        <ul class="m-0 list-none p-0">
          <li v-for="snd in senders" :key="snd.sender" class="border-b border-line py-3 last:border-b-0">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-sm @2xl:grid @2xl:gap-x-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_3.5rem_5rem_9rem]">
              <span class="min-w-0 basis-full font-medium break-all text-fg @2xl:basis-auto">{{ snd.sender }}</span>
              <span class="min-w-0 truncate text-muted">“{{ snd.subject || "no subject" }}”</span>
              <span class="text-muted tabular-nums @2xl:text-right @2xl:text-fg"><span class="@2xl:hidden" aria-hidden="true">· </span>{{ age(snd.last_at) }}</span>
              <span :class="snd.state === 'pending' ? 'font-medium text-fg' : 'text-muted'"><span class="@2xl:hidden" aria-hidden="true">· </span>{{ STATE_WORD[snd.state] }}</span>
              <span class="ml-auto flex gap-2 @2xl:ml-0 @2xl:justify-end">
                <button v-if="snd.state !== 'allowed'" class="btn sm" type="button" :disabled="Boolean(busy)" @click="decide(snd, 'allowed')">Allow</button>
                <button v-if="snd.state !== 'blocked'" class="btn sm outline danger" type="button" :disabled="Boolean(busy)" @click="decide(snd, 'blocked')">Block</button>
              </span>
            </div>
          </li>
        </ul>
      </div>
      <p v-else class="m-0 border-b border-line py-3 font-ui text-sm text-muted">
        No senders yet. The first email from someone new waits here for you to allow it.
      </p>
    </HubSettingsSection>
  </div>
</template>
