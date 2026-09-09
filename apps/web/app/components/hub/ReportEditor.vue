<!--
  The description field. A rich text editor on a product whose currency is markdown, which is a
  contradiction only until you look at who is typing: a tester filing the fourth bug of a session
  should not be recalling list syntax, and the document still has to be markdown when it lands.
  So the field is WYSIWYG and `htmlToMarkdown` converts on the way out — nothing downstream ever
  learns a browser was involved.

  The model is one-way on purpose. `contenteditable` owns its own DOM, and writing the prop back
  into it on every keystroke moves the caret to the end of the field; the parent is told what
  changed and never tells this component what it now contains.
-->
<script setup lang="ts">
const props = defineProps<{ html: string; placeholder: string }>();
const emit = defineEmits<{
  (e: "update:html", value: string): void;
  (e: "files", files: File[]): void;
}>();

const field = ref<HTMLElement | null>(null);

onMounted(() => {
  if (field.value) field.value.innerHTML = props.html || "";
});

/** `execCommand` is deprecated and still the only thing every browser implements for this. */
function exec(command: string, value?: string) {
  try {
    document.execCommand(command, false, value);
  } catch {
    // A browser that refuses leaves the field as plain text, which still submits.
  }
}

function changed() {
  emit("update:html", field.value?.innerHTML || "");
}

function inHeading(): boolean {
  let node = document.getSelection()?.anchorNode ?? null;
  while (node && node !== field.value) {
    if ((node as HTMLElement).tagName === "H3") return true;
    node = node.parentNode;
  }
  return false;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);

function run(tool: string) {
  field.value?.focus();
  if (tool === "bold" || tool === "italic") exec(tool);
  else if (tool === "ul") exec("insertUnorderedList");
  else if (tool === "ol") exec("insertOrderedList");
  else if (tool === "h") exec("formatBlock", inHeading() ? "<p>" : "<h3>");
  else if (tool === "pre") exec("formatBlock", "<pre>");
  else if (tool === "code") {
    const selected = document.getSelection()?.toString();
    if (selected) exec("insertHTML", `<code>${escapeHtml(selected)}</code>&nbsp;`);
  } else if (tool === "link") {
    const selected = document.getSelection()?.toString();
    if (!selected) return;
    const href = window.prompt("Link to:", "https://");
    if (href) exec("createLink", href);
  }
  changed();
}

/**
 * An image on the clipboard is evidence — pasting a screenshot straight into the description is
 * the fastest thing a tester does. Everything else arrives as plain text, so a paste out of Slack
 * or a ticket does not drag its styling in with it.
 */
function onPaste(event: ClipboardEvent) {
  const data = event.clipboardData;
  if (!data) return;
  const files = Array.from(data.files || []).filter((f) => f.type.startsWith("image/"));
  event.preventDefault();
  if (files.length) {
    emit("files", files);
    return;
  }
  exec("insertText", data.getData("text/plain"));
  changed();
}

const TOOLS = [
  { key: "bold", label: "B", title: "Bold", cls: "font-bold" },
  { key: "italic", label: "I", title: "Italic", cls: "italic font-serif" },
  { key: "h", label: "H", title: "Heading", cls: "font-semibold" },
  { key: "ul", label: "•", title: "Bulleted list", cls: "" },
  { key: "ol", label: "1.", title: "Numbered list", cls: "font-code text-xs" },
  { key: "link", label: "Link", title: "Link the selected words", cls: "" },
  { key: "code", label: "code", title: "Inline code", cls: "font-code text-xs" },
  { key: "pre", label: "{ }", title: "Code block", cls: "font-code text-xs" },
];
</script>

<template>
  <div class="rounded-2 border border-line bg-raised focus-within:border-accent">
    <div class="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1">
      <button
        v-for="t in TOOLS"
        :key="t.key"
        type="button"
        :title="t.title"
        :aria-label="t.title"
        class="rounded-1 border-0 bg-transparent px-2 py-1 font-ui text-sm text-muted hover:bg-surface hover:text-fg"
        :class="t.cls"
        @mousedown.prevent
        @click="run(t.key)"
      >{{ t.label }}</button>
      <span class="ml-auto pr-1 font-code text-[10px] text-muted">paste a screenshot to attach it</span>
    </div>

    <div
      ref="field"
      class="rt min-h-28 max-h-96 overflow-y-auto px-3 py-3 text-sm leading-relaxed outline-none"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      :data-placeholder="placeholder"
      @input="changed"
      @blur="changed"
      @paste="onPaste"
    />
  </div>
</template>

<style scoped>
/* The editor's own document styles. Scoped because these tags are only ever authored here —
   everywhere else a guide's markdown is rendered by the server. */
.rt:empty::before {
  content: attr(data-placeholder);
  color: var(--color-muted);
}
.rt :deep(> *:first-child) { margin-top: 0; }
.rt :deep(> *:last-child) { margin-bottom: 0; }
.rt :deep(p) { margin: 0 0 var(--s-2); }
.rt :deep(h3) { font: 600 var(--t-h3) / 1.3 var(--font-sans); margin: var(--s-3) 0 var(--s-2); }
.rt :deep(ul), .rt :deep(ol) { margin: 0 0 var(--s-2); padding-left: var(--s-5); }
.rt :deep(li) { margin-bottom: 2px; }
.rt :deep(a) { color: var(--color-accent); }
.rt :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: var(--surface);
  border: 1px solid var(--color-line);
  border-radius: var(--r-1);
  padding: 1px 4px;
}
.rt :deep(pre) {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  background: var(--surface);
  border: 1px solid var(--color-line);
  border-radius: var(--r-2);
  padding: var(--s-3);
  margin: 0 0 var(--s-2);
  overflow-x: auto;
  white-space: pre-wrap;
}
.rt :deep(pre code) { background: none; border: 0; padding: 0; }
</style>
