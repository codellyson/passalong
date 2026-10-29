<!--
  A project document, written the way it reads: headings, lists, links and pictures as they look,
  not as Markdown. The server keeps Markdown, which is what agents read and write, so the editor
  loads it and gives it back through utils/doc-markdown.ts, which round-trips exactly what this
  editor can hold. A document holding something it cannot (a table, a task list, raw HTML) opens as
  Markdown with a line saying why, so a save can never drop part of it. Markdown is also there for
  anyone who prefers it, off by default.

  TipTap, configured as the box's editor is (Writer.vue): its own stylesheet off, the rules in
  styles.css under `.doc-writer`, rendered by the caller inside <ClientOnly>.
-->
<script setup lang="ts">
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { docToMarkdown, markdownToDoc, type PMNode } from "~/utils/doc-markdown";

const props = defineProps<{ markdown: string; label: string }>();
const emit = defineEmits<{ change: [markdown: string] }>();

const first = markdownToDoc(props.markdown);
/** Why it opened as Markdown, when the editor cannot hold all of it. */
const unheld = ref("unheld" in first ? first.unheld : "");
const source = ref(Boolean(unheld.value));
const text = ref(props.markdown);
const switchProblem = ref("");
/** Bumped on every transaction, so the toolbar's pressed states follow the cursor. */
const tick = ref(0);

const editor = useEditor({
  injectCSS: false,
  content: "doc" in first ? (first.doc as PMNode) : undefined,
  extensions: [
    // Markdown has no underline, so the editor offers none.
    StarterKit.configure({ underline: false, link: { openOnClick: false, autolink: true } }),
    Image.configure({ inline: false }),
    Placeholder.configure({ placeholder: "Write what someone working on this needs to know." }),
  ],
  editorProps: {
    attributes: {
      class: "writer doc-writer",
      "aria-label": props.label,
      "aria-multiline": "true",
      role: "textbox",
    },
  },
  onTransaction: () => tick.value++,
  onUpdate: ({ editor: e }) => {
    text.value = docToMarkdown(e.getJSON() as PMNode);
    emit("change", text.value);
  },
});
onBeforeUnmount(() => editor.value?.destroy());

function onSource(e: Event) {
  text.value = (e.target as HTMLTextAreaElement).value;
  emit("change", text.value);
}

/** Between the editor and Markdown; back only when the editor can hold what was written. */
function toggleSource() {
  switchProblem.value = "";
  if (!source.value) {
    source.value = true;
    return;
  }
  const got = markdownToDoc(text.value);
  if ("unheld" in got) {
    switchProblem.value = `This has ${got.unheld}, which the editor can't show yet, so it stays as Markdown.`;
    return;
  }
  editor.value?.commands.setContent(got.doc, { emitUpdate: false });
  unheld.value = "";
  source.value = false;
}

const TOOLS = [
  { label: "Heading", run: "toggleHeading", args: { level: 2 }, active: ["heading", { level: 2 }] },
  {
    label: "Subheading",
    run: "toggleHeading",
    args: { level: 3 },
    active: ["heading", { level: 3 }],
  },
  { label: "Bold", run: "toggleBold", active: ["bold"] },
  { label: "Italic", run: "toggleItalic", active: ["italic"] },
  { label: "List", run: "toggleBulletList", active: ["bulletList"] },
  { label: "Numbered", run: "toggleOrderedList", active: ["orderedList"] },
  { label: "Quote", run: "toggleBlockquote", active: ["blockquote"] },
  { label: "Code", run: "toggleCodeBlock", active: ["codeBlock"] },
] as const;
function apply(t: (typeof TOOLS)[number]) {
  const chain = editor.value?.chain().focus() as any;
  ("args" in t ? chain?.[t.run](t.args) : chain?.[t.run]())?.run();
}
const pressed = (t: (typeof TOOLS)[number]) => {
  void tick.value;
  return Boolean((editor.value?.isActive as any)?.(...t.active));
};
</script>

<template>
  <div class="writer-shell flex flex-col">
    <div class="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1" role="toolbar" :aria-label="`Format ${label}`">
      <template v-if="!source">
        <button
          v-for="t in TOOLS"
          :key="t.label"
          type="button"
          class="tool"
          :aria-pressed="pressed(t)"
          @mousedown.prevent
          @click="apply(t)"
        >{{ t.label }}</button>
      </template>
      <span v-else class="px-2 font-ui text-xs text-muted">Markdown</span>
      <button type="button" class="tool ml-auto" :aria-pressed="source" @click="toggleSource">
        {{ source ? "Back to the editor" : "Markdown" }}
      </button>
    </div>
    <p v-if="unheld && source" class="m-0 border-b border-line px-4 py-2 font-ui text-xs text-muted">
      This document has {{ unheld }}, which the editor can't show yet, so it opens as Markdown.
    </p>
    <p v-if="switchProblem" role="alert" class="m-0 border-b border-line px-4 py-2 font-ui text-xs text-danger">{{ switchProblem }}</p>
    <EditorContent v-show="!source" :editor="editor" />
    <label v-if="source" class="sr-only" :for="`${label}-source`">{{ label }} as Markdown</label>
    <textarea
      v-if="source"
      :id="`${label}-source`"
      class="doc-source min-h-[28rem] w-full border-0 font-code text-sm"
      :value="text"
      spellcheck="true"
      @input="onSource"
    />
  </div>
</template>

<style scoped>
.tool {
  height: 1.75rem;
  padding: 0 var(--s-2);
  border: 0;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--muted);
  font: 500 0.8125rem / 1 var(--font-sans);
  cursor: pointer;
}
.tool:hover {
  background: var(--surface-raised);
  color: var(--fg);
}
.tool[aria-pressed="true"] {
  background: var(--ink);
  color: var(--on-ink);
}
.tool:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.doc-source {
  padding: var(--s-4) var(--s-5);
  background: transparent;
  box-shadow: none;
  resize: vertical;
}
.doc-source:focus {
  box-shadow: none;
}
</style>
