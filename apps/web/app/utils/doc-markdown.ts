/**
 * A project document between Markdown, which the server stores and agents read and write, and the
 * hub's rich-text editor (TipTap, `components/hub/DocEditor.vue`), which people write in.
 *
 * Both directions go through TipTap's JSON rather than HTML, so they run anywhere (and under
 * `node --test`) and the round trip is exact for what the editor can hold: headings, paragraphs,
 * bold, italic, strikethrough, inline code, links, lists (bulleted, numbered, nested), code blocks,
 * quotes, rules, line breaks and pictures. A document holding anything else — a table, a task list,
 * a footnote, raw HTML, an alert — is not converted at all: `markdownToDoc` names what it found, and
 * the editor opens it as Markdown instead, so saving can never quietly drop part of it.
 */
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}
type Md = any;

const parser = unified().use(remarkParse).use(remarkGfm);

/** What the editor cannot hold, in words a person reads: "a table". */
class Unheld extends Error {}
const UNHELD: Record<string, string> = {
  table: "a table",
  html: "HTML",
  footnoteReference: "a footnote",
  footnoteDefinition: "a footnote",
  definition: "a link defined at the bottom",
  linkReference: "a link defined at the bottom",
  imageReference: "a picture defined at the bottom",
};

function inline(nodes: Md[], marks: PMMark[] = []): PMNode[] {
  const out: PMNode[] = [];
  for (const n of nodes) {
    if (UNHELD[n.type]) throw new Unheld(UNHELD[n.type]);
    if (n.type === "text") {
      if (n.value) out.push({ type: "text", text: n.value, ...(marks.length ? { marks } : {}) });
    } else if (n.type === "inlineCode") {
      if (n.value) out.push({ type: "text", text: n.value, marks: [...marks, { type: "code" }] });
    } else if (n.type === "strong") out.push(...inline(n.children, [...marks, { type: "bold" }]));
    else if (n.type === "emphasis") out.push(...inline(n.children, [...marks, { type: "italic" }]));
    else if (n.type === "delete") out.push(...inline(n.children, [...marks, { type: "strike" }]));
    else if (n.type === "link")
      out.push(...inline(n.children, [...marks, { type: "link", attrs: { href: n.url } }]));
    else if (n.type === "break") out.push({ type: "hardBreak" });
    else throw new Unheld(n.type === "image" ? "a picture inside a line of text" : n.type);
  }
  return out;
}

function blocks(nodes: Md[]): PMNode[] {
  return nodes.map((n): PMNode => {
    if (UNHELD[n.type]) throw new Unheld(UNHELD[n.type]);
    switch (n.type) {
      case "heading":
        return { type: "heading", attrs: { level: n.depth }, content: inline(n.children) };
      case "paragraph": {
        // A picture on its own line is a picture block; one inside a sentence is not held.
        if (n.children.length === 1 && n.children[0].type === "image") {
          const img = n.children[0];
          return {
            type: "image",
            attrs: { src: img.url, alt: img.alt || null, title: img.title || null },
          };
        }
        const content = inline(n.children);
        return content.length ? { type: "paragraph", content } : { type: "paragraph" };
      }
      case "list":
        return {
          type: n.ordered ? "orderedList" : "bulletList",
          ...(n.ordered ? { attrs: { start: n.start ?? 1 } } : {}),
          content: n.children.map((item: Md) => {
            if (item.checked !== null && item.checked !== undefined)
              throw new Unheld("a task list");
            const content = blocks(item.children);
            // TipTap's list item starts with a paragraph.
            if (content[0]?.type !== "paragraph") content.unshift({ type: "paragraph" });
            return { type: "listItem", content };
          }),
        };
      case "code":
        return {
          type: "codeBlock",
          attrs: { language: n.lang || null },
          ...(n.value ? { content: [{ type: "text", text: n.value }] } : {}),
        };
      case "blockquote": {
        const first = n.children[0]?.children?.[0];
        if (first?.type === "text" && /^\[!\w+\]/.test(first.value)) throw new Unheld("an alert");
        return { type: "blockquote", content: blocks(n.children) };
      }
      case "thematicBreak":
        return { type: "horizontalRule" };
      default:
        throw new Unheld(n.type);
    }
  });
}

/** The document as editor content, or what in it the editor cannot hold. */
export function markdownToDoc(markdown: string): { doc: PMNode } | { unheld: string } {
  try {
    const content = blocks(parser.parse(markdown).children);
    return { doc: { type: "doc", content: content.length ? content : [{ type: "paragraph" }] } };
  } catch (e) {
    if (e instanceof Unheld) return { unheld: e.message };
    throw e;
  }
}

// ---- back to Markdown ---------------------------------------------------------------------------

/** Characters that would mean something in Markdown, escaped wherever they stand in plain text. */
const escapeText = (s: string) => s.replace(/([\\`*_[\]<>~&|])/g, "\\$1");
/** A line that would start a heading, a quote, a list or a rule if left as it is. */
const escapeLineStart = (s: string) =>
  s.replace(/^(\s*)([#>+=-]|\d+[.)])/gm, (_m, sp: string, mark: string) =>
    /^\d/.test(mark) ? `${sp}${mark.replace(/([.)])$/, "\\$1")}` : `${sp}\\${mark}`,
  );

function codeSpan(text: string) {
  const longest = (text.match(/`+/g) || []).reduce((n, r) => Math.max(n, r.length), 0);
  const fence = "`".repeat(longest + 1);
  const pad = /^`|`$|^\s.*\s$/.test(text) ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

const OPEN: Record<string, string> = { bold: "**", italic: "*", strike: "~~" };
const sameMark = (a: PMMark, b: PMMark) =>
  a.type === b.type && (a.type !== "link" || a.attrs?.href === b.attrs?.href);
const close = (m: PMMark) =>
  m.type === "link" ? `](${String(m.attrs?.href ?? "")})` : (OPEN[m.type] ?? "");
const open = (m: PMMark) => (m.type === "link" ? "[" : (OPEN[m.type] ?? ""));

/** Inline content, with marks opened and closed around runs so `**a** **b**` stays two runs. */
function inlineMd(nodes: PMNode[] = []): string {
  let out = "";
  const stack: PMMark[] = [];
  for (const n of nodes) {
    const marks = (n.marks ?? []).filter(
      (m) => m.type !== "code" && (m.type === "link" || OPEN[m.type]),
    );
    // Close down to the longest prefix of the stack this node still has.
    let keep = 0;
    while (keep < stack.length && marks.some((m) => sameMark(m, stack[keep] as PMMark))) keep++;
    while (stack.length > keep) out += close(stack.pop() as PMMark);
    for (const m of marks)
      if (!stack.some((s) => sameMark(s, m))) {
        stack.push(m);
        out += open(m);
      }
    if (n.type === "hardBreak") out += "\\\n";
    else if (n.type === "text") {
      const code = n.marks?.some((m) => m.type === "code");
      out += code ? codeSpan(n.text ?? "") : escapeText(n.text ?? "");
    }
  }
  while (stack.length) out += close(stack.pop() as PMMark);
  return out;
}

const indent = (text: string, first: string, rest: string) =>
  text
    .split("\n")
    .map((line, i) => (i === 0 ? first : line ? rest : "") + line)
    .join("\n");

function blockMd(n: PMNode): string {
  switch (n.type) {
    case "heading":
      return `${"#".repeat(Number(n.attrs?.level) || 1)} ${inlineMd(n.content)}`;
    case "paragraph":
      return escapeLineStart(inlineMd(n.content));
    case "bulletList":
    case "orderedList": {
      const start = Number(n.attrs?.start ?? 1);
      return (n.content ?? [])
        .map((item, i) => {
          const marker = n.type === "orderedList" ? `${start + i}. ` : "- ";
          const kids = item.content ?? [];
          const body = kids
            .map((k, j) =>
              j === 0 ? blockMd(k) : `${k.type.endsWith("List") ? "\n" : "\n\n"}${blockMd(k)}`,
            )
            .join("");
          return indent(body, marker, " ".repeat(marker.length));
        })
        .join("\n");
    }
    case "codeBlock": {
      const text = (n.content ?? []).map((t) => t.text ?? "").join("");
      const longest = (text.match(/^`{3,}/gm) || []).reduce((m, r) => Math.max(m, r.length), 2);
      const fence = "`".repeat(longest + 1);
      return `${fence}${n.attrs?.language ? String(n.attrs.language) : ""}\n${text}\n${fence}`;
    }
    case "blockquote":
      return (n.content ?? [])
        .map(blockMd)
        .join("\n\n")
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    case "horizontalRule":
      return "---";
    case "image": {
      const alt = String(n.attrs?.alt ?? "").replace(/([\\[\]])/g, "\\$1");
      const title = n.attrs?.title ? ` "${String(n.attrs.title).replace(/"/g, '\\"')}"` : "";
      return `![${alt}](${String(n.attrs?.src ?? "")}${title})`;
    }
    default:
      return inlineMd(n.content);
  }
}

/** Editor content as Markdown: "" for an empty document, never whitespace. */
export function docToMarkdown(doc: PMNode): string {
  // An empty paragraph is a blank line in the editor; Markdown has no way to keep one.
  return (doc.content ?? [])
    .map(blockMd)
    .filter((s) => s !== "")
    .join("\n\n")
    .trim();
}
