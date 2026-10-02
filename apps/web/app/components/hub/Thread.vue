<!--
  What happened to a guide, as the conversation it was.

  The record was a set of documents and states — a task, a claim, a write-up, evidence — and a
  person had to assemble the story from them. This reads it the way a chat reads: the agent says it
  is taking the work, says what it is doing, says it is done; you say it is not, and why. One line
  each, in order, from GET /v1/guides/:id/thread.

  Folded, never dropped: this is the short version. The write-up, the evidence and the task's own
  sections are one click away wherever this is shown, and nothing here replaces them.

  Your words sit on the right and everyone else's, including your own agent's, on the left: an
  agent working for you is still not you speaking. A run from one speaker shares a name.
-->
<script setup lang="ts">
import type { ThreadItem } from "~/types/hub";

const props = defineProps<{
  id: string;
  /** Anything that changes when the guide does, so the thread is read again. */
  stamp?: string;
  /** Somebody holds it and you may write to them, or you may leave a note on it: shows the box. */
  reply?: boolean;
  /** Nobody holds it: what is written is a note for whoever takes it, not a message to anybody. */
  noting?: boolean;
  /**
   * Fill the panel it is in: the messages scroll and the box is pinned underneath, as in a chat. Off,
   * it flows with the page, which is how the review pane uses it.
   */
  fill?: boolean;
  /** Put the cursor in the box once the conversation has loaded: it was opened to answer. */
  focus?: boolean;
}>();
const { api, onReply, token } = useHub();
const { load: loadDoc, sectionsFor } = useTaskDocs();

/** Whether you wrote it, from the same answer: it decides which side the first bubble sits on. */
const mine = ref(false);
/** What the guide says to a person: the first bubble, with the document behind "Show details". */
const summary = ref("");
onMounted(() => watch(() => props.id, loadDoc, { immediate: true }));
/**
 * The first message: what was asked, in one bubble. A task leads with its Goal and a handoff with its
 * Problem; everything else it says is behind "Show details", never dropped.
 */
const LEAD = ["Goal", "Problem"];
const brief = computed(() => {
  const doc = sectionsFor(props.id);
  const said = summary.value.trim();
  // The summary leads when there is one, and then every section is behind the fold, the Goal with
  // the rest. A guide from before summaries leads with its Goal or Problem as it always did.
  if (said)
    return {
      lead: said,
      rest: Object.entries(doc ?? {})
        .filter(([, v]) => v.trim())
        .map(([k, v]) => ({ k, v: v.trim() })),
    };
  if (!doc) return null;
  const lead = LEAD.find((k) => doc[k]?.trim());
  if (!lead) return null;
  return {
    lead: (doc[lead] ?? "").trim(),
    rest: Object.entries(doc)
      .filter(([k, v]) => k !== lead && v.trim())
      .map(([k, v]) => ({ k, v: v.trim() })),
  };
});

const items = ref<ThreadItem[] | null>(null);
const failed = ref(false);
let latest = 0;
async function load() {
  const ask = ++latest;
  try {
    const got = await api<{ thread: ThreadItem[]; mine?: boolean; summary?: string }>(
      `/v1/guides/${encodeURIComponent(props.id)}/thread`,
    );
    // A slow answer for a guide you have since left is dropped, not shown.
    if (ask === latest) {
      items.value = got?.thread ?? [];
      mine.value = Boolean(got?.mine);
      summary.value = got?.summary ?? "";
      failed.value = false;
    }
  } catch {
    if (ask === latest) failed.value = true;
  }
}
onMounted(() => watch(() => [props.id, props.stamp], load, { immediate: true }));

// In a panel it is a chat: it opens on the latest message, and a person who leaves it open hears
// the agent without reloading. Quiet, and only while it is on screen.
const scroller = ref<HTMLElement | null>(null);
const box = ref<HTMLTextAreaElement | null>(null);
watch(items, async (now, before) => {
  if (!props.fill) return;
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
  if (props.focus && before === null && now) box.value?.focus();
});
let poll: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  if (props.fill) poll = setInterval(() => !document.hidden && load(), 15000);
});
onBeforeUnmount(() => clearInterval(poll));

const groups = computed(() => grouped(items.value ?? []));

const draft = ref("");
const sending = ref(false);
const trouble = ref("");

/** Pictures and files uploaded for this reply and not sent yet. They are only attached when it goes. */
const attached = ref<Attached[]>([]);
const uploading = ref(false);
const picker = ref<HTMLInputElement | null>(null);
const composed = computed(() => composeReply(draft.value, attached.value));
const canSend = computed(
  () => !sending.value && !uploading.value && composed.value.body && !composed.value.over,
);

/**
 * Upload one thing to where it belongs. A picture goes to the screenshot store, which draws it in the
 * thread; anything else goes to the file store, which only ever lets it be downloaded. Raw bytes with
 * the file's own type in both. The server decides what it will keep, and refuses in words a person can
 * act on, so those words are shown as they come.
 */
async function attach(file: File | undefined) {
  if (!file) return;
  if (attached.value.length >= REPLY_ATTACHMENTS) {
    trouble.value = `A reply carries up to ${REPLY_ATTACHMENTS} attachments.`;
    return;
  }
  uploading.value = true;
  trouble.value = "";
  try {
    const name = file.name.replace(/[^\x20-\x7e]/g, "") || "file";
    if (file.type.startsWith("image/")) {
      const got = await api<{ shot: { url: string } }>("/v1/shots", {
        method: "POST",
        headers: { "content-type": file.type, "x-shot-name": name },
        body: file,
      });
      if (got?.shot)
        attached.value = [...attached.value, { kind: "image", name, url: got.shot.url }];
    } else {
      const got = await api<{ attachment: { url: string; name: string } }>("/v1/attachments", {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      });
      if (got?.attachment)
        attached.value = [
          ...attached.value,
          { kind: "file", name: got.attachment.name, url: got.attachment.url },
        ];
    }
  } catch (e) {
    trouble.value = e instanceof Error ? e.message : "That didn't upload. Try again.";
  } finally {
    uploading.value = false;
    if (picker.value) picker.value.value = "";
  }
}

/**
 * Save a file from the thread. Fetched with the credential and handed to the browser as a download,
 * rather than linked to: a link carries no bearer token, so a hub signed in with a pasted token could
 * not follow it, and the file is private.
 */
async function download(f: { name: string; url: string }) {
  trouble.value = "";
  try {
    const res = await fetch(f.url, {
      headers: token.value ? { authorization: `Bearer ${token.value}` } : {},
    });
    if (!res.ok) throw new Error("That file is no longer there.");
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = href;
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch (e) {
    trouble.value = e instanceof Error ? e.message : "That file didn't download. Try again.";
  }
}
/** A picture pasted into the box is attached, the way it is in a chat. Text pastes are untouched. */
function pasted(e: ClipboardEvent) {
  const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
  if (!file) return;
  e.preventDefault();
  attach(file);
}

async function send() {
  if (!canSend.value) return;
  sending.value = true;
  trouble.value = "";
  try {
    await onReply(props.id, composed.value.body);
    draft.value = "";
    attached.value = [];
    await load();
  } catch (e) {
    // The server's own words: it says who may write and that nobody is holding it.
    trouble.value = e instanceof Error ? e.message : "That didn't send. Try again.";
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <section
    aria-label="What happened"
    class="font-ui"
    :class="fill ? 'flex min-h-0 flex-col' : 'max-w-2xl'"
  >
    <div ref="scroller" :class="fill ? 'min-h-0 flex-1 overflow-y-auto px-5 py-5' : ''">
    <p v-if="failed" class="m-0 text-sm text-muted">The conversation could not be loaded.</p>
    <p v-else-if="items === null" class="m-0 text-sm text-muted">Loading…</p>
    <ol v-else class="m-0 flex list-none flex-col gap-4 p-0">
      <li v-if="brief" class="flex flex-col gap-2" :class="mine ? 'items-end' : 'items-start'">
        <p class="m-0 flex items-baseline gap-2 text-xs text-muted">
          <span class="font-semibold text-fg">{{ mine ? "You" : "The author" }}</span>
          <span>asked</span>
        </p>
        <p
          class="m-0 line-clamp-4 max-w-[85%] rounded-3 px-3 py-2 text-sm leading-snug break-words whitespace-pre-line"
          :class="mine ? 'bg-accent-soft text-fg' : 'bg-surface text-fg shadow-edge'"
        >{{ brief.lead }}</p>
        <details v-if="brief.rest.length" class="max-w-[85%] text-sm" :class="mine ? 'text-right' : ''">
          <summary class="cursor-pointer text-xs text-muted hover:text-fg">
            Show details · {{ brief.rest.map((r) => r.k).join(", ") }}
          </summary>
          <div class="mt-2 flex flex-col gap-3 text-left">
            <section v-for="r in brief.rest" :key="r.k">
              <h4 class="m-0 text-xs font-semibold tracking-widest text-muted uppercase">{{ r.k }}</h4>
              <p class="m-0 mt-1 break-words whitespace-pre-line text-fg">{{ r.v }}</p>
            </section>
          </div>
        </details>
      </li>
      <li v-if="!items.length" class="m-0 text-sm text-muted">
        Nothing yet. What an agent says shows here once it takes this.
      </li>
      <li
        v-for="g in groups"
        :key="g.key"
        class="flex flex-col gap-2"
        :class="g.messages[0]?.mine ? 'items-end' : 'items-start'"
      >
        <p class="m-0 flex items-baseline gap-2 text-xs text-muted">
          <span class="font-semibold text-fg">{{ g.messages[0]?.who }}</span>
          <span v-if="g.messages[0]?.where" class="font-code">{{ g.messages[0]?.where }}</span>
          <span>{{ rel(g.messages[0]?.at) }}</span>
        </p>
        <div
          v-for="m in g.messages"
          :key="m.id"
          class="m-0 max-w-[85%] rounded-3 px-3 py-2 text-sm leading-snug break-words whitespace-pre-line"
          :class="
            m.quiet
              ? 'px-0 py-0 text-muted italic'
              : m.tone === 'bad'
                ? 'bg-danger-soft text-fg'
                : m.mine
                  ? 'bg-accent-soft text-fg'
                  : 'bg-surface text-fg shadow-edge'
          "
        >
          <!-- Our own screenshots are drawn, through the one renderer that refuses to fetch from
               anywhere else; everything else in a message stays text. -->
          <HubEvidence v-if="m.pictures" :text="m.text" prose label="A message with pictures" class="!mt-0" />
          <template v-else>{{ m.text }}</template>
          <!-- A file is something to save, never something opened here: a button that downloads it,
               not a link to a page, because it is private and only the credential can fetch it. -->
          <ul v-if="m.files.length" class="m-0 flex list-none flex-wrap gap-2 p-0" :class="m.text ? 'mt-2' : ''">
            <li v-for="f in m.files" :key="f.url">
              <button
                type="button"
                class="inline-flex max-w-56 items-center gap-2 rounded-1 border-0 bg-raised px-3 py-2 text-xs text-fg shadow-edge hover:text-accent"
                :title="`Download ${f.name}`"
                @click="download(f)"
              >
                <span class="truncate">{{ f.name }}</span>
                <span class="shrink-0 text-muted">download</span>
              </button>
            </li>
          </ul>
        </div>
      </li>
    </ol>
    </div>

    <!-- Only while somebody holds it: a message with nobody to hear it is a comment, and this is not
         one. The agent has no way to be pushed to, so it hears on its next call; the line under the
         box says so rather than letting a person wait for an answer that cannot come yet. -->
    <form
      v-if="reply"
      class="flex flex-col gap-2"
      :class="fill ? 'border-t border-line bg-raised px-5 py-4' : 'mt-5'"
      @submit.prevent="send"
    >
      <label class="sr-only" :for="`reply-${id}`">{{ noting ? "Leave a note on the task" : "Write to the agent" }}</label>
      <textarea
        :id="`reply-${id}`"
        ref="box"
        v-model="draft"
        rows="2"
        :placeholder="noting ? 'Add a note or a file for whoever takes this' : 'Answer, or add something for the agent'"
        class="block w-full resize-y rounded-1 border border-line-strong bg-raised p-2 text-sm text-fg"
        @keydown.meta.enter.prevent="send"
        @keydown.ctrl.enter.prevent="send"
        @paste="pasted"
      />
      <ul v-if="attached.length" class="m-0 flex list-none flex-wrap items-center gap-2 p-0">
        <li v-for="(a, i) in attached" :key="a.url" class="relative">
          <img
            v-if="a.kind === 'image'"
            :src="a.url.replace(/^https?:\/\/[^/]+/, '')"
            :alt="a.name"
            class="block h-16 w-16 rounded-1 object-cover outline outline-image-edge"
          />
          <span
            v-else
            class="inline-flex max-w-48 items-center rounded-1 bg-surface px-3 py-2 text-xs text-fg shadow-edge"
          >
            <span class="truncate">{{ a.name }}</span>
          </span>
          <button
            type="button"
            class="absolute -top-1 -right-1 grid size-5 place-items-center rounded-pill border-0 bg-fg p-0 text-bg"
            :aria-label="`Remove ${a.name}`"
            @click="attached = attached.filter((_, k) => k !== i)"
          >
            <AppIcon name="x" :size="12" />
          </button>
        </li>
      </ul>
      <div class="flex flex-wrap items-center gap-3">
        <button class="btn primary sm" type="submit" :disabled="!canSend">send</button>
        <button
          class="btn sm"
          type="button"
          :disabled="uploading || attached.length >= REPLY_ATTACHMENTS"
          @click="picker?.click()"
        >{{ uploading ? "Uploading…" : "Attach" }}</button>
        <input
          ref="picker"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.zip,.txt,.csv,.json,.md,.log"
          class="sr-only"
          tabindex="-1"
          aria-hidden="true"
          @change="attach(($event.target as HTMLInputElement).files?.[0])"
        />
        <span
          class="text-xs"
          :class="composed.over ? 'text-danger' : 'text-muted'"
        >{{
          composed.over
            ? `${composed.over} characters too long.`
            : noting
              ? "Whoever takes it is handed this first."
              : "The agent reads it the next time it checks in."
        }}</span>
      </div>
      <p v-if="trouble" class="m-0 text-xs text-danger" role="alert">{{ trouble }}</p>
    </form>
  </section>
</template>
