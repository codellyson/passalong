<!--
  The box's editor (docs/LOOP.md §1a): what you see is what you write. TipTap, on its own rather than
  through Nuxt UI, so it takes the hub's look and its security policy as they are — TipTap's injected
  stylesheet is off (the hub allows styles from its own stylesheet only) and its rules live in
  styles.css under `.writer`.

  It understands what is pasted into it: a picture is uploaded and shown in place, an error or a log
  becomes a code block, a link stays a link. It knows the team: `@` suggests people and `#` the
  team's groups. What it emits is markdown (utils/markdown.ts), the form every piece of work is in.
-->
<script setup lang="ts">
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { htmlToMarkdown } from "~/utils/markdown";

const props = defineProps<{
  placeholder: string;
  people: { handle: string; name: string }[];
  groups: { slug: string; name: string }[];
  disabled?: boolean;
}>();
const emit = defineEmits<{ change: [markdown: string]; problem: [message: string] }>();
const { api } = useHub();

/** A pasted run of text that reads as an error or a log, so it is kept verbatim in a code block. */
function looksLikeLog(text: string): boolean {
  const lines = text.split("\n");
  if (lines.length < 2) return false;
  return (
    /(^|\n)\s*(at |File "|Traceback|Error:|Exception|\[\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}[.,]\d)/.test(
      text,
    ) || lines.filter((l) => /^\s{2,}\S/.test(l)).length >= 2
  );
}

async function upload(file: File): Promise<string | null> {
  const name = file.name.replace(/[^\x20-\x7e]/g, "") || "picture";
  try {
    const got = await api<{ shot: { url: string } }>("/v1/shots", {
      method: "POST",
      headers: { "content-type": file.type, "x-shot-name": name },
      body: file,
    });
    return got?.shot.url ?? null;
  } catch (e) {
    emit("problem", (e as Error).message);
    return null;
  }
}

/** The open suggestion list, for `@` or `#`, drawn by this component rather than a popup library. */
interface Option {
  id: string;
  label: string;
  hint: string;
}
const menu = reactive({
  open: false,
  items: [] as Option[],
  index: 0,
  left: 0,
  top: 0,
  pick: (_o: Option) => {},
});
function suggestion(char: "@" | "#") {
  return {
    char,
    items: ({ query }: { query: string }): Option[] => {
      const q = query.toLowerCase();
      const all =
        char === "@"
          ? props.people.map((p) => ({ id: p.handle, label: p.handle, hint: p.name }))
          : props.groups.map((g) => ({ id: g.slug, label: g.slug, hint: g.name }));
      return all
        .filter((o) => o.label.toLowerCase().includes(q) || o.hint.toLowerCase().includes(q))
        .slice(0, 6);
    },
    render: () => ({
      onStart: (p: {
        items: Option[];
        command: (o: { id: string; label: string }) => void;
        clientRect?: (() => DOMRect | null) | null;
      }) => {
        Object.assign(menu, { open: p.items.length > 0, items: p.items, index: 0 });
        menu.pick = (o) => p.command({ id: o.id, label: o.label });
        const r = p.clientRect?.();
        if (r) Object.assign(menu, { left: r.left, top: r.bottom + 4 });
      },
      onUpdate: (p: {
        items: Option[];
        command: (o: { id: string; label: string }) => void;
        clientRect?: (() => DOMRect | null) | null;
      }) => {
        Object.assign(menu, { open: p.items.length > 0, items: p.items, index: 0 });
        menu.pick = (o) => p.command({ id: o.id, label: o.label });
        const r = p.clientRect?.();
        if (r) Object.assign(menu, { left: r.left, top: r.bottom + 4 });
      },
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (!menu.open) return false;
        if (event.key === "ArrowDown") menu.index = (menu.index + 1) % menu.items.length;
        else if (event.key === "ArrowUp")
          menu.index = (menu.index - 1 + menu.items.length) % menu.items.length;
        else if (event.key === "Enter" || event.key === "Tab") {
          const o = menu.items[menu.index];
          if (o) menu.pick(o);
        } else if (event.key === "Escape") menu.open = false;
        else return false;
        return true;
      },
      onExit: () => {
        menu.open = false;
      },
    }),
  };
}

const editor = useEditor({
  injectCSS: false,
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({ link: { openOnClick: false, autolink: true, linkOnPaste: true } }),
    Placeholder.configure({ placeholder: () => props.placeholder }),
    Image.configure({ inline: false }),
    Mention.configure({
      HTMLAttributes: { class: "writer-mention" },
      // The text a mention becomes is `@handle` or `#group`, the address the rest of Passalong uses.
      renderText: ({ node }) =>
        `${node.attrs.mentionSuggestionChar ?? "@"}${node.attrs.label ?? node.attrs.id}`,
      renderHTML: ({ node, options }) => [
        "span",
        options.HTMLAttributes,
        `${node.attrs.mentionSuggestionChar ?? "@"}${node.attrs.label ?? node.attrs.id}`,
      ],
      suggestions: [suggestion("@"), suggestion("#")],
    }),
  ],
  editorProps: {
    attributes: {
      class: "writer",
      "aria-label": props.placeholder,
      "aria-multiline": "true",
      role: "textbox",
    },
    handlePaste: (_view, event) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) {
        for (const f of files.slice(0, 5))
          upload(f).then((url) => {
            if (url) editor.value?.chain().focus().setImage({ src: url, alt: f.name }).run();
          });
        return true;
      }
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (looksLikeLog(text)) {
        editor.value
          ?.chain()
          .focus()
          .insertContent({
            type: "codeBlock",
            content: [{ type: "text", text: text.replace(/\s+$/, "") }],
          })
          .run();
        return true;
      }
      return false;
    },
    handleDrop: (_view, event) => {
      const files = [...(event.dataTransfer?.files ?? [])].filter((f) =>
        f.type.startsWith("image/"),
      );
      if (!files.length) return false;
      for (const f of files.slice(0, 5))
        upload(f).then((url) => {
          if (url) editor.value?.chain().focus().setImage({ src: url, alt: f.name }).run();
        });
      return true;
    },
  },
  onUpdate: ({ editor: e }) => emit("change", e.isEmpty ? "" : htmlToMarkdown(e.getHTML())),
});

watch(
  () => props.disabled,
  (d) => editor.value?.setEditable(!d),
);
onBeforeUnmount(() => editor.value?.destroy());

/** Add a picture chosen from a file, the way a paste does. */
async function addPicture(file: File) {
  const url = await upload(file);
  if (url) editor.value?.chain().focus().setImage({ src: url, alt: file.name }).run();
}
/**
 * Add any file: a picture is drawn inline; anything else (a PDF, a zip, a text file) is kept as an
 * attachment and named by a link, which the work claims when it is filed, as a reply's files are.
 */
async function addFile(file: File) {
  if (file.type.startsWith("image/")) return addPicture(file);
  try {
    const got = await api<{ attachment: { url: string; name: string } }>("/v1/attachments", {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(file.name),
      },
      body: file,
    });
    if (!got?.attachment) return;
    editor.value
      ?.chain()
      .focus()
      .insertContent([
        {
          type: "text",
          text: got.attachment.name,
          marks: [{ type: "link", attrs: { href: got.attachment.url } }],
        },
        { type: "text", text: " " },
      ])
      .run();
  } catch (e) {
    emit("problem", (e as Error).message);
  }
}
function clear() {
  editor.value?.commands.clearContent(true);
}
/** Put text at the cursor: a starter from a chip, or `@` / `#` to open the suggestions. */
function insert(text: string) {
  editor.value?.chain().focus().insertContent(text).run();
}
/** Replace what is written with plain text — an agent's draft — one paragraph per blank line. */
function setText(text: string) {
  editor.value?.commands.setContent(
    {
      type: "doc",
      content: text.split(/\n{2,}/).map((p) => ({
        type: "paragraph",
        content: p.trim() ? [{ type: "text", text: p.trim() }] : [],
      })),
    },
    { emitUpdate: true },
  );
}
defineExpose({ addPicture, addFile, clear, insert, setText });
</script>

<template>
  <div class="writer-shell relative">
    <EditorContent :editor="editor" />
    <!-- The box's own controls sit inside the field, as in a chat box. -->
    <div class="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
      <slot name="footer" />
    </div>
    <ul
      v-if="menu.open"
      class="menu fixed z-40 m-0 w-64 list-none p-1"
      role="listbox"
      :style="{ left: `${menu.left}px`, top: `${menu.top}px` }"
    >
      <li v-for="(o, i) in menu.items" :key="o.id" role="option" :aria-selected="i === menu.index">
        <button
          type="button"
          class="menu-item w-full"
          :class="i === menu.index ? 'bg-raised' : ''"
          @mousedown.prevent="menu.pick(o)"
        >
          <span class="font-medium">{{ o.label }}</span>
          <span v-if="o.hint" class="ml-2 text-xs text-muted">{{ o.hint }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
