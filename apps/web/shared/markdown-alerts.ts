/**
 * GitHub's alert blockquotes, for every Markdown this site renders:
 *
 *   > [!WARNING]
 *   > Run the migration first.
 *
 * remark-gfm does not parse these, so a blockquote whose first line is exactly one of GitHub's five
 * markers becomes `<div class="markdown-alert markdown-alert-warning">` with a title paragraph, the
 * same markup GitHub emits. Anything else — an unknown marker, a marker with text after it on the
 * same line — stays an ordinary quote, as it does on GitHub.
 *
 * Written against the tree shape rather than mdast's types so it needs no dependency of its own.
 */
interface Node {
  type: string;
  value?: string;
  children?: Node[];
  data?: Record<string, unknown>;
}

const TITLES: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

const MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;

function alert(quote: Node): void {
  const first = quote.children?.[0];
  const text = first?.type === "paragraph" ? first.children?.[0] : undefined;
  if (!first?.children || text?.type !== "text" || !text.value) return;
  const match = MARKER.exec(text.value);
  if (!match) return;
  const kind = (match[1] as string).toLowerCase();

  text.value = text.value.slice(match[0].length);
  if (!text.value) first.children.shift();
  // A soft break left at the front once the marker line is gone would start the body with a space.
  if (first.children[0]?.type === "break") first.children.shift();
  if (!first.children.length) quote.children?.shift();

  quote.data = {
    ...quote.data,
    hName: "div",
    hProperties: { className: ["markdown-alert", `markdown-alert-${kind}`] },
  };
  quote.children?.unshift({
    type: "paragraph",
    data: { hProperties: { className: ["markdown-alert-title"] } },
    children: [{ type: "text", value: TITLES[kind] as string }],
  });
}

function walk(node: Node): void {
  for (const child of node.children ?? []) {
    walk(child);
    if (child.type === "blockquote") alert(child);
  }
}

/** A remark plugin: `unified().use(remarkParse).use(remarkGfm).use(remarkAlerts)`. */
export function remarkAlerts() {
  return (tree: Node) => walk(tree);
}
