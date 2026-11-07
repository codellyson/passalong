<!--
  /admin → Product news: write a mail about what's new, look at it, send it to yourself, then send
  it to everybody who can be reached (apps/api/src/announcements.ts).

  The real send is a loop of batches this page asks for until none are left, because one request
  can only call so much. It says how far it got as it goes. Closing the tab stops it without losing
  anything: the mail's row then offers to carry on, and nobody gets it twice.

  It asks before the real send, with the number of people, because it is the one act on this page
  that cannot be taken back.
-->
<script setup lang="ts">
interface Announcement {
  id: string;
  subject: string;
  body: string;
  created: string;
  started: string;
  sent: number;
  failed: number;
}

const { api, json } = useHub();

const list = ref<Announcement[]>([]);
const reach = ref(0);
const mail = ref(true);
const loading = ref(true);
const failed = ref("");
const said = ref("");

async function load() {
  try {
    const r = await api<{ announcements: Announcement[]; audience: number; mail: boolean }>(
      "/v1/admin/announcements",
    );
    list.value = r?.announcements ?? [];
    reach.value = r?.audience ?? 0;
    mail.value = r?.mail ?? true;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const why = (e: unknown) =>
  (e as { data?: { message?: string; error?: string } })?.data?.message ||
  (e as { data?: { error?: string } })?.data?.error ||
  (e as Error).message;

// ---- the form ------------------------------------------------------------------------------
/** The draft being edited: a saved one's id, or "" for a new one. */
const editing = ref("");
const subject = ref("");
const body = ref("");
const busy = ref("");

function edit(a: Announcement | null) {
  editing.value = a?.id ?? "";
  subject.value = a?.subject ?? "";
  body.value = a?.body ?? "";
  preview.value = null;
  said.value = "";
  failed.value = "";
}

async function save(): Promise<string> {
  const payload = { subject: subject.value, body: body.value };
  const saved = editing.value
    ? await api<Announcement>(`/v1/admin/announcements/${editing.value}`, json("PUT", payload))
    : await api<Announcement>("/v1/admin/announcements", json("POST", payload));
  editing.value = saved?.id ?? editing.value;
  return editing.value;
}

async function run(what: string, work: () => Promise<void>) {
  if (busy.value) return;
  busy.value = what;
  failed.value = "";
  said.value = "";
  try {
    await work();
  } catch (e) {
    failed.value = why(e);
  } finally {
    busy.value = "";
    await load();
  }
}

const saveDraft = () =>
  run("save", async () => {
    await save();
    said.value = "Saved as a draft.";
  });

const preview = ref<{ html: string; text: string } | null>(null);
const showPreview = () =>
  run("preview", async () => {
    preview.value = await api(
      "/v1/admin/announcements/preview",
      json("POST", { subject: subject.value, body: body.value }),
    );
  });

const test = () =>
  run("test", async () => {
    const id = await save();
    const r = await api<{ to: string }>(`/v1/admin/announcements/${id}/test`, json("POST", {}));
    said.value = `Sent a test to ${r?.to}. Its subject starts with [Test].`;
  });

// ---- the real send -------------------------------------------------------------------------
/** Which mail is asking "send it to N people?". */
const asking = ref("");
const progress = ref<{ id: string; sent: number; failed: number; left: number } | null>(null);

function sendAll(id: string, retry = false) {
  asking.value = "";
  return run("send", async () => {
    if (id === editing.value && !list.value.find((a) => a.id === id)?.started) await save();
    progress.value = { id, sent: 0, failed: 0, left: reach.value };
    let first = true;
    for (;;) {
      const r = await api<{ sent: number; failed: number; left: number }>(
        `/v1/admin/announcements/${id}/send`,
        json("POST", { retry: retry && first }),
      );
      first = false;
      if (!r) break;
      progress.value = {
        id,
        sent: progress.value.sent + r.sent,
        failed: progress.value.failed + r.failed,
        left: r.left,
      };
      // Nothing more to do, or a batch that could do nothing (everyone in it taken by another tab).
      if (!r.left || (!r.sent && !r.failed)) break;
    }
    const p = progress.value;
    said.value =
      `Sent to ${p.sent} ${p.sent === 1 ? "person" : "people"}.` +
      (p.failed
        ? ` The mailer refused ${p.failed}; the server log says why, and you can try them again.`
        : "");
    progress.value = null;
    if (id === editing.value) edit(null);
  });
}

const drafts = computed(() => list.value.filter((a) => !a.started));
const sentOnes = computed(() => list.value.filter((a) => a.started));
const remove = (id: string) =>
  run("delete", async () => {
    await api(`/v1/admin/announcements/${id}`, { method: "DELETE" });
    if (editing.value === id) edit(null);
  });

const field =
  "block w-full rounded-1 border border-line-strong bg-raised px-2 py-1.5 font-ui text-sm text-fg";
const label = "block font-ui text-xs font-medium text-muted";
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex flex-wrap items-baseline gap-x-3">
      <h4 class="m-0 font-ui text-sm font-semibold text-fg">Product news</h4>
      <span class="font-ui text-xs text-muted">
        An email about what's new, to everyone with a proven address who hasn't turned it off:
        {{ loading ? "…" : people(reach) }} right now. Replies go to support@passalong.dev.
      </span>
    </div>

    <p v-if="!loading && !mail" class="m-0 rounded-1 bg-warn-soft px-3 py-2 font-ui text-sm text-warn">
      Mail isn't set up on this server, so you can write and preview here but not send.
    </p>
    <p v-if="failed" role="alert" class="m-0 rounded-1 bg-danger-soft px-3 py-2 font-ui text-sm text-danger">{{ failed }}</p>
    <p v-if="said" role="status" class="m-0 rounded-1 bg-ok-soft px-3 py-2 font-ui text-sm text-ok">{{ said }}</p>
    <p v-if="progress" role="status" class="m-0 font-ui text-sm text-fg">
      Sending… {{ progress.sent }} sent<template v-if="progress.failed">, {{ progress.failed }} refused</template>, {{ progress.left }} to go.
      Keep this page open until it finishes.
    </p>

    <form class="flex flex-col gap-3" @submit.prevent="saveDraft">
      <div>
        <label :class="label" for="news-subject">Subject</label>
        <input id="news-subject" v-model="subject" :class="field" maxlength="150" placeholder="What's new in Passalong: …" required />
      </div>
      <div>
        <label :class="label" for="news-body">What to tell people</label>
        <textarea id="news-body" v-model="body" :class="field" class="min-h-64 font-reading text-base" required />
        <p class="m-0 mt-1 font-ui text-xs text-muted">
          A blank line between paragraphs. <code class="font-code">## </code> starts a heading,
          <code class="font-code">- </code> a list item. Also <code class="font-code">`code`</code>,
          <code class="font-code">**bold**</code> and <code class="font-code">[words](https://…)</code>.
          The way to stop these is added at the bottom for you.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn" type="submit" :disabled="Boolean(busy) || !subject.trim() || !body.trim()">
          {{ busy === "save" ? "Saving…" : "Save draft" }}
        </button>
        <button class="btn" type="button" :disabled="Boolean(busy) || !subject.trim() || !body.trim()" @click="showPreview">Preview</button>
        <button class="btn" type="button" :disabled="Boolean(busy) || !mail || !subject.trim() || !body.trim()" @click="test">
          {{ busy === "test" ? "Sending…" : "Send me a test" }}
        </button>
        <template v-if="editing">
          <span v-if="asking === editing" class="flex flex-wrap items-center gap-2">
            <span class="font-ui text-sm text-fg">Send it to {{ people(reach) }}? This can't be undone.</span>
            <button class="btn primary" type="button" :disabled="Boolean(busy)" @click="sendAll(editing)">Send to {{ people(reach) }}</button>
            <button class="btn" type="button" @click="asking = ''">Not yet</button>
          </span>
          <button v-else class="btn primary" type="button" :disabled="Boolean(busy) || !mail || !reach" @click="asking = editing">
            Send to everyone…
          </button>
        </template>
        <button v-if="editing || subject || body" class="linkish ml-auto font-ui text-sm" type="button" @click="edit(null)">
          {{ editing ? "Start a new one" : "Clear" }}
        </button>
      </div>
      <p v-if="!editing && (subject || body)" class="m-0 font-ui text-xs text-muted">
        Save it as a draft or send yourself a test, and the send to everyone appears here.
      </p>
    </form>

    <div v-if="preview" class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between gap-2">
        <span class="font-ui text-xs font-medium text-muted">How it arrives</span>
        <button class="linkish font-ui text-xs" type="button" @click="preview = null">Close preview</button>
      </div>
      <!-- Sandboxed with nothing allowed: the mail's own markup, and none of it may run. -->
      <iframe :srcdoc="preview.html" sandbox="" title="Preview of the email" class="h-[32rem] w-full rounded-1 border border-line bg-white" />
      <details class="font-ui text-xs text-muted">
        <summary class="cursor-pointer">The plain-text version</summary>
        <pre class="mt-2 overflow-auto rounded-1 bg-surface p-3 font-code text-xs whitespace-pre-wrap text-fg">{{ preview.text }}</pre>
      </details>
    </div>

    <div v-if="drafts.length" class="flex flex-col gap-1">
      <span class="font-ui text-xs font-medium text-muted">Drafts</span>
      <ul class="m-0 flex list-none flex-col p-0">
        <li v-for="a in drafts" :key="a.id" class="flex flex-wrap items-baseline gap-x-3 border-b border-line py-2 font-ui text-sm">
          <span class="min-w-0 flex-1 text-fg">{{ a.subject }}</span>
          <span class="text-xs text-muted tabular-nums">{{ day(a.created) }}</span>
          <button class="linkish font-medium" type="button" @click="edit(a)">Edit</button>
          <button class="linkish text-danger" type="button" :disabled="Boolean(busy)" @click="remove(a.id)">Delete</button>
        </li>
      </ul>
    </div>

    <div v-if="sentOnes.length" class="flex flex-col gap-1">
      <span class="font-ui text-xs font-medium text-muted">Sent</span>
      <ul class="m-0 flex list-none flex-col p-0">
        <li v-for="a in sentOnes" :key="a.id" class="flex flex-wrap items-baseline gap-x-3 border-b border-line py-2 font-ui text-sm">
          <span class="min-w-0 flex-1 text-fg">{{ a.subject }}</span>
          <span class="text-xs text-muted tabular-nums">
            {{ day(a.started) }} · {{ people(a.sent) }}<template v-if="a.failed"> · {{ a.failed }} refused</template>
          </span>
          <!-- A send that stopped (a closed tab) or met refusals can carry on: nobody gets it twice. -->
          <span v-if="asking === a.id" class="flex basis-full flex-wrap items-center justify-end gap-2 pt-1">
            <span class="text-xs text-muted">Send it to anyone who can be reached and hasn't had it, such as people who joined since?</span>
            <button class="btn sm primary" type="button" :disabled="Boolean(busy)" @click="sendAll(a.id, a.failed > 0)">Send</button>
            <button class="btn sm" type="button" @click="asking = ''">Not now</button>
          </span>
          <button v-else class="linkish font-medium" type="button" :disabled="Boolean(busy) || !mail" @click="asking = a.id">
            {{ a.failed ? "Try the refused again" : "Send to anyone new…" }}
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
