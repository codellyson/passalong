/**
 * The rich text editor's HTML, back into markdown.
 *
 * The hub has a WYSIWYG field because a tester filing six bugs should not have to remember list
 * syntax — but a guide *is* markdown, and an issue filed here has to be the same document as one
 * filed by the CLI. So the editor's output is converted rather than stored: nothing downstream
 * ever learns that a browser was involved.
 *
 * The tag set is closed. It is exactly what the toolbar can produce plus what a paste can survive
 * (`insertText` strips the rest), so anything unrecognised contributes its text and nothing else —
 * which is also what keeps a pasted `<script>` from becoming one.
 */

const INLINE_ESCAPE = /([\\`*_[\]])/g;

function escapeText(text: string): string {
  return text.replace(INLINE_ESCAPE, "\\$1");
}

/** Inline runs: everything that can sit inside a paragraph or a list item. */
function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent || "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const kids = () => Array.from(el.childNodes).map(inline).join("");
  switch (el.tagName) {
    case "BR":
      return "\n";
    case "B":
    case "STRONG":
      return kids().trim() ? `**${kids()}**` : "";
    case "I":
    case "EM":
      return kids().trim() ? `*${kids()}*` : "";
    case "CODE": {
      // Backticks are not escaped inside code, so the fence has to be longer than the longest
      // run the content itself holds.
      const raw = el.textContent || "";
      const longest = (raw.match(/`+/g) || []).reduce((n, r) => Math.max(n, r.length), 0);
      const fence = "`".repeat(longest + 1);
      return raw ? `${fence}${raw}${fence}` : "";
    }
    case "A": {
      const href = el.getAttribute("href") || "";
      const text = kids() || escapeText(href);
      // Only schemes a reader can safely follow. `javascript:` in a link is the one thing a
      // pasted description could smuggle into a document other people open.
      return /^(https?:|mailto:|\/)/i.test(href) ? `[${text}](${href})` : text;
    }
    case "IMG": {
      const src = el.getAttribute("src") || "";
      const alt = el.getAttribute("alt") || "";
      return src ? `![${alt}](${src})` : "";
    }
    default:
      return kids();
  }
}

function listBlock(el: HTMLElement, ordered: boolean, depth: number): string {
  const pad = "  ".repeat(depth);
  return Array.from(el.children)
    .filter((li) => li.tagName === "LI")
    .map((li, n) => {
      const marker = ordered ? `${n + 1}. ` : "- ";
      const nested = Array.from(li.children).filter(
        (child) => child.tagName === "UL" || child.tagName === "OL",
      );
      const own = Array.from(li.childNodes)
        .filter((child) => !nested.includes(child as Element))
        .map(inline)
        .join("")
        .trim();
      const below = nested
        .map((child) => listBlock(child as HTMLElement, child.tagName === "OL", depth + 1))
        .join("");
      return `${pad}${marker}${own}\n${below}`;
    })
    .join("");
}

/** Block level: the sequence of paragraphs, headings, lists and code blocks. */
function block(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || "").trim();
    return text ? `${escapeText(text)}\n\n` : "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  switch (el.tagName) {
    case "H1":
    case "H2":
    case "H3":
    case "H4":
      // Never above ###: the guide's own sections are `##`, and a description that outranked
      // them would break the outline the guide page builds from those headings.
      return `### ${inline(el).trim()}\n\n`;
    case "UL":
      return `${listBlock(el, false, 0)}\n`;
    case "OL":
      return `${listBlock(el, true, 0)}\n`;
    case "PRE": {
      const raw = el.textContent || "";
      return raw.trim() ? `\`\`\`\n${raw.replace(/\n+$/, "")}\n\`\`\`\n\n` : "";
    }
    case "BLOCKQUOTE":
      return `${(inline(el) || "")
        .trim()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`;
    case "DIV":
    case "SECTION":
      // contenteditable wraps loose lines in divs; treat one as a paragraph unless it is only
      // holding blocks, in which case its children are the blocks.
      if (Array.from(el.children).some((c) => /^(P|UL|OL|PRE|H[1-4]|DIV)$/.test(c.tagName))) {
        return Array.from(el.childNodes).map(block).join("");
      }
      return inline(el).trim() ? `${inline(el).trim()}\n\n` : "";
    default: {
      const text = inline(el).trim();
      return text ? `${text}\n\n` : "";
    }
  }
}

/** The editor's HTML as markdown. Returns "" for an empty field, never whitespace. */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return "";
  const host = document.createElement("div");
  host.innerHTML = html;
  return Array.from(host.childNodes)
    .map(block)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
