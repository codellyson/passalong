// Markdown to HTML for a work page. This runs on the server only — the page it feeds is served
// under `noScripts`, and keeping the parser here keeps it out of the client bundle entirely.
// It is the same remark + GFM pipeline project documents use, plus GitHub's alerts, so a piece of work,
// a post and a project document read the same Markdown the same way.
//
// Nothing sanitises the output. That is deliberate and is the same bargain apps/api makes: the
// route's CSP is `default-src 'none'` with no `script-src` at all, so anything script-shaped in
// someone else's markdown is inert. A sanitiser would be a second, weaker line pretending to be
// the first.

import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { remarkAlerts } from "#shared/markdown-alerts";

/** One entry in the contents rail. Only h2 and h3 — below that is detail, not structure. */
export interface Heading {
  level: 2 | 3;
  text: string;
  id: string;
}

/** The parts of a hast tree this file touches, typed locally so it needs no types package. */
interface El {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: El[];
}

/** What a heading says, without its markup: inline HTML in a heading is markup, not words. */
const textOf = (node: El): string =>
  node.type === "text" ? node.value || "" : (node.children ?? []).map(textOf).join("");

/** Ids have to be unique on the page: a long document repeats a heading sooner or later. */
function slugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base =
      text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 60) || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

/**
 * A standalone image becomes a figure, so its alt text can also be its caption — markdown has no
 * caption syntax, and the alt is the only sentence an author writes about a screenshot.
 *
 * Decided on the paragraph rather than the image: a lone image arrives wrapped in a <p>, and a
 * <figure> inside a <p> is invalid — the browser closes the paragraph early and the structure comes
 * apart. Replacing the paragraph is what makes it a block-level decision. An image sitting inside a
 * sentence is left exactly where it is.
 */
function figure(p: El): El | null {
  const [img, ...rest] = p.children ?? [];
  if (img?.tagName !== "img" || rest.length) return null;
  const alt = String(img.properties?.alt ?? "");
  const caption = alt
    ? [
        {
          type: "element",
          tagName: "figcaption",
          properties: {},
          children: [{ type: "text", value: alt }],
        },
      ]
    : [];
  return { type: "element", tagName: "figure", properties: {}, children: [img, ...caption] };
}

/**
 * Every heading gets a unique id and h2/h3 go into the outline the contents rail is drawn from. A
 * heading that already has an id is one the pipeline wrote — the hidden "Footnotes" label — and is
 * neither renamed nor listed.
 */
function shape(into: Heading[], slug: (s: string) => string) {
  const visit = (node: El) => {
    node.children = node.children?.map((child) => {
      if (child.tagName === "p") return figure(child) ?? child;
      const depth = /^h([1-6])$/.exec(child.tagName || "")?.[1];
      if (depth && !child.properties?.id) {
        const level = Number(depth);
        const text = textOf(child);
        const id = slug(text);
        if (level === 2 || level === 3) into.push({ level, text, id });
        child.properties = { ...child.properties, id };
      }
      visit(child);
      return child;
    });
  };
  return () => (tree: El) => visit(tree);
}

/**
 * One processor per render, closing over the outline it fills. A module-level instance would be
 * shared by concurrent requests, and while processing is synchronous, a collector that is only safe
 * because nothing yields inside it is a trap for whoever touches this next.
 *
 * Raw HTML passes through untouched, as it always has: see the note at the top of this file.
 */
function makeRenderer(into: Heading[], slug: (s: string) => string) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkAlerts)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(shape(into, slug))
    .use(rehypeStringify, { allowDangerousHtml: true });
  return (s: string) => String(processor.processSync(s));
}

/** Markdown we wrote ourselves, such as a blog post, rendered the way a piece of work is. */
export function renderMarkdown(body: string): string {
  return makeRenderer([], slugger())(body);
}

/** The body as HTML, plus the outline the contents rail is built from. */
export interface Rendered {
  html: string;
  outline: Heading[];
}

export function renderBody(body: string): Rendered {
  const outline: Heading[] = [];
  return { html: makeRenderer(outline, slugger())(body), outline };
}

/** The first paragraph-ish run of the body, for the description meta. */
export function summarize(body: string, max = 160): string {
  const text = body
    .replace(/^#+\s.*$/gm, "")
    .replace(/`[^`]*`/g, "")
    .replace(/[*_>#[\]]/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .find((p) => p.length > 0);
  if (!text) return "Shared on Passalong.";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
