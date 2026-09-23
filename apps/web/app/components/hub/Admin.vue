<!--
  What /admin is made of: who runs Passalong, and what has been given away (apps/api/src/gifts.ts).

  One word for the role everywhere a person reads it: admin. `super` is the value in the column and
  the name in the code, and two words for one thing is how somebody ends up looking for a command
  that does not exist.

  Three things, in the order they are needed. What has been given, because that is the list nobody
  can hold in their head: who has a plan they did not pay for, until when, and why. Then giving one,
  which is a decision made while looking at that list. Then who may make those decisions at all,
  which changes twice a year.

  Reads its own data rather than joining the hub's: none of it belongs on a page a customer opens,
  and a payload every visitor carries for three operators is a payload three operators are worth.
-->
<script setup lang="ts">
interface Gift {
  id: string;
  to: string;
  kind: string;
  plan: string;
  until: string;
  why: string;
  by: string;
  live: boolean;
}
interface Super {
  id: string;
  name: string;
  email: string;
  since: string;
  by: string;
}

const { data, api, json } = useHub();
/**
 * Whether this account may hand the role out. Only the deployment's own `ADMIN_ACCOUNTS` may, so a
 * super sees who else there is and cannot change it — the controls are absent rather than refused,
 * and the routes refuse them anyway.
 */
const canMakeSupers = computed(() => data.value.me?.can_make_supers === true);

const gifts = ref<Gift[]>([]);
const supers = ref<Super[]>([]);
const loading = ref(true);
/** What the last call refused, said where it was asked for rather than in an alert. */
const failed = ref("");

async function load() {
  loading.value = true;
  try {
    const [g, s] = await Promise.all([
      api<{ gifts: Gift[] }>("/v1/admin/gifts"),
      api<{ supers: Super[] }>("/v1/admin/accounts"),
    ]);
    gifts.value = g?.gifts ?? [];
    supers.value = s?.supers ?? [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const busy = ref(false);
async function act(work: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  failed.value = "";
  try {
    await work();
    await load();
  } catch (e) {
    failed.value = (e as { data?: { error?: string } })?.data?.error || (e as Error).message;
  } finally {
    busy.value = false;
  }
}

// ---- giving one ---------------------------------------------------------------------------
const to = ref("");
const until = ref("");
const why = ref("");
const seats = ref("");
const give = () =>
  act(async () => {
    await api(
      "/v1/admin/gifts",
      json("POST", {
        to: to.value.trim(),
        until: until.value,
        why: why.value.trim(),
        seats: Number(seats.value || 0),
      }),
    );
    to.value = "";
    until.value = "";
    why.value = "";
    seats.value = "";
  });

/** Destructive, so it asks on the row it is about rather than acting on the first click. */
const taking = ref<string | null>(null);
const takeBack = (id: string) =>
  act(async () => {
    taking.value = null;
    await api(`/v1/admin/gifts/${id}`, { method: "DELETE" });
  });

// ---- who may do it ------------------------------------------------------------------------
const promote = ref("");
const makeSuper = () =>
  act(async () => {
    await api(`/v1/admin/accounts/${encodeURIComponent(promote.value.trim())}`, json("PUT", {}));
    promote.value = "";
  });

const dropping = ref<string | null>(null);
const drop = (id: string) =>
  act(async () => {
    dropping.value = null;
    await api(`/v1/admin/accounts/${id}`, { method: "DELETE" });
  });

// ---- a new admin account ------------------------------------------------------------------
const email = ref("");
/** Shown once. The token is stored as a hash and the link is one-use: there is no second chance. */
const made = ref<{ account: string; email: string; token: string; password_url: string } | null>(
  null,
);
const makeAccount = () =>
  act(async () => {
    made.value = await api("/v1/admin/accounts", json("POST", { email: email.value.trim() }));
    email.value = "";
  });

const field =
  "block w-full rounded-1 border border-line-strong bg-raised px-2 py-1.5 font-ui text-sm text-fg";
const label = "block font-ui text-xs font-medium text-muted";
const cell = "border-0 border-b border-b-line px-0 py-3 align-middle font-ui text-sm";
const head =
  "border-0 border-b border-b-line bg-transparent px-0 py-2 text-left font-ui text-xs font-semibold tracking-wide text-muted uppercase";
</script>

<template>
  <div class="flex flex-col gap-8">
    <p v-if="failed" class="m-0 rounded-1 bg-danger-soft px-3 py-2 font-ui text-sm text-danger">
      {{ failed }}
    </p>

    <!-- What has been given away. -->
    <section class="flex flex-col gap-3">
      <div class="flex flex-wrap items-baseline gap-x-3">
        <h4 class="m-0 font-ui text-sm font-semibold text-fg">Plans given away</h4>
        <span class="font-ui text-xs text-muted">
          Each one ends on its date. Taking one back makes that plan lapsed as of now.
        </span>
      </div>

      <HubSkeleton v-if="loading" variant="lines" :rows="2" label="Loading plans given away" />
      <p v-else-if="!gifts.length" class="m-0 font-ui text-sm text-muted">
        No plans given yet. Give one to comp a design partner, or to put a support problem right.
      </p>
      <table v-else class="w-full border-collapse">
        <thead>
          <tr>
            <th :class="head">Who</th>
            <th :class="head">Plan</th>
            <th :class="head">Until</th>
            <th :class="head">Why</th>
            <!-- Room kept for the confirm that opens in this column, so asking does not reflow
                 the four columns the reader is comparing. -->
            <th :class="head" class="w-56 text-right"><span class="sr-only">Take back</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in gifts" :key="g.id">
            <td :class="cell">
              <span class="text-fg">{{ g.to }}</span>
              <span v-if="g.kind === 'team'" class="ml-1 text-muted">team</span>
            </td>
            <td :class="cell">
              <span class="rounded-pill px-2 py-0.5 font-ui text-xs font-semibold" :class="g.live ? 'bg-ok-soft text-ok' : 'bg-surface text-muted'">
                {{ g.plan }}
              </span>
            </td>
            <td :class="cell" class="tabular-nums text-muted">
              {{ g.live ? day(g.until) : "over" }}
            </td>
            <td :class="cell" class="text-muted">{{ g.why || "—" }}</td>
            <td :class="cell" class="text-right whitespace-nowrap">
              <template v-if="g.live">
                <!-- The buttons carry the action, not the answer: by the time your eye reaches
                     them in a table row, the question has left focus. -->
                <!-- The question above the buttons, not beside them: asking then grows the row
                     downwards instead of widening this column and reflowing the four the reader
                     is comparing. -->
                <span v-if="taking === g.id" class="flex flex-col items-end gap-1">
                  <span class="font-ui text-xs text-muted">Take {{ g.to }}'s plan back?</span>
                  <span class="flex gap-2">
                    <button class="btn outline danger sm" type="button" :disabled="busy" @click="takeBack(g.id)">Take it back</button>
                    <button class="btn sm" type="button" @click="taking = null">Keep it</button>
                  </span>
                </span>
                <button v-else class="linkish font-medium" type="button" @click="taking = g.id">Take back</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Giving one is a decision made with that list in view, so the fields sit under it. -->
      <form class="mt-1 flex flex-wrap items-end gap-3 rounded-2 bg-surface p-3" @submit.prevent="give">
        <div class="grow basis-56">
          <label :class="label" for="gift-to">Who</label>
          <input id="gift-to" v-model="to" :class="field" placeholder="@ada, or team/acme" required />
        </div>
        <div class="basis-40">
          <label :class="label" for="gift-until">Until</label>
          <input id="gift-until" v-model="until" :class="field" type="date" required />
        </div>
        <div class="grow basis-56">
          <label :class="label" for="gift-why">Why</label>
          <input id="gift-why" v-model="why" :class="field" placeholder="design partner" />
        </div>
        <div v-if="to.startsWith('team/')" class="basis-24">
          <label :class="label" for="gift-seats">Seats</label>
          <input id="gift-seats" v-model="seats" :class="field" type="number" min="1" />
        </div>
        <button class="btn primary" type="submit" :disabled="busy || !to.trim() || !until">Give plan</button>
      </form>
    </section>

    <!-- Who may do any of this. -->
    <section class="flex flex-col gap-3">
      <div class="flex flex-wrap items-baseline gap-x-3">
        <h4 class="m-0 font-ui text-sm font-semibold text-fg">Who runs Passalong</h4>
        <!-- "admin" everywhere a person reads it. `super` stays the stored value and the name in
             the code; two words for one role is how somebody ends up searching for a command that
             does not exist. -->
        <span class="font-ui text-xs text-muted">
          An admin signs in like anyone else.
          {{
            canMakeSupers
              ? "The last one can't be removed."
              : "Only the owner account can add or remove one."
          }}
        </span>
      </div>

      <HubSkeleton v-if="loading" variant="lines" :rows="2" label="Loading admins" />
      <table v-else class="w-full border-collapse">
        <tbody>
          <tr v-for="s in supers" :key="s.id">
            <td :class="cell">
              <span class="text-fg">{{ s.name }}</span>
              <span v-if="s.email" class="ml-2 text-muted">{{ s.email }}</span>
            </td>
            <td :class="cell" class="text-muted">since {{ day(s.since) }}</td>
            <td :class="cell" class="w-56 text-right whitespace-nowrap">
              <template v-if="!canMakeSupers" />
              <span v-else-if="dropping === s.id" class="flex flex-col items-end gap-1">
                <span class="font-ui text-xs text-muted">Remove {{ s.name }}?</span>
                <span class="flex gap-2">
                  <button class="btn outline danger sm" type="button" :disabled="busy" @click="drop(s.id)">Remove admin</button>
                  <button class="btn sm" type="button" @click="dropping = null">Keep</button>
                </span>
              </span>
              <button v-else class="linkish font-medium" type="button" @click="dropping = s.id">Remove</button>
            </td>
          </tr>
          <tr v-if="!supers.length">
            <td :class="cell" class="text-muted" colspan="3">
              No admins yet. You can act because your id is in
              <code class="font-code">ADMIN_ACCOUNTS</code> — add one here so it doesn't depend on
              that.
            </td>
          </tr>
        </tbody>
      </table>

      <form v-if="canMakeSupers" class="flex flex-wrap items-end gap-3" @submit.prevent="makeSuper">
        <div class="grow basis-56">
          <label :class="label" for="admin-promote">Make an existing account an admin</label>
          <input id="admin-promote" v-model="promote" :class="field" placeholder="@ada" required />
        </div>
        <button class="btn" type="submit" :disabled="busy || !promote.trim()">Make admin</button>
      </form>
    </section>

    <!-- A new account that exists only to run the product. Only the deployment's own account can
         make one, so for every other super this section is not here at all. -->
    <section v-if="canMakeSupers" class="flex flex-col gap-3">
      <div class="flex flex-wrap items-baseline gap-x-3">
        <h4 class="m-0 font-ui text-sm font-semibold text-fg">A new admin account</h4>
        <span class="font-ui text-xs text-muted">
          A separate account, so admin work is never done by the one that publishes guides.
        </span>
      </div>

      <!-- The second place in the product holding something the server cannot give back, and it
           says so where the values are rather than underneath them. -->
      <div v-if="made" class="rounded-2 border border-accent bg-accent-soft p-3">
        <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <b class="font-ui text-sm text-fg">{{ made.email }} is an admin</b>
          <span class="font-ui text-sm text-accent">Copy both now. Neither is shown again.</span>
        </div>
        <dl class="m-0 grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2">
          <dt class="font-ui text-xs text-muted">Token</dt>
          <dd class="m-0 font-code text-xs break-all text-fg">{{ made.token }}</dd>
          <dt class="font-ui text-xs text-muted">Password link</dt>
          <dd class="m-0 font-code text-xs break-all text-fg">{{ made.password_url }}</dd>
        </dl>
        <p class="mt-2 mb-0 font-ui text-xs text-muted">
          The token is for <code class="font-code">passalong login</code>; the link sets their hub
          password and lasts a day. It has also been emailed to them.
        </p>
        <button class="btn sm mt-3" type="button" @click="made = null">Done</button>
      </div>

      <form class="flex flex-wrap items-end gap-3" @submit.prevent="makeAccount">
        <div class="grow basis-64">
          <label :class="label" for="admin-email">Their email</label>
          <input id="admin-email" v-model="email" :class="field" type="email" placeholder="ops@yourcompany.com" required />
        </div>
        <button class="btn" type="submit" :disabled="busy || !email.trim()">Create</button>
      </form>
    </section>
  </div>
</template>
