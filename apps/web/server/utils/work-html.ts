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
import { FORGES, forgeLabel, forgeRef, linkKind, WORK_ID, workStage } from "#shared/link-kind";
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
 * A URL as pasted, without the full stop or bracket after it (the same rule as evidence.ts).
 * Markdown leaves a URL in a code block as text, and what came in by webhook or email is quoted in
 * one, so its `Link:` line was the one thing on the page that could not be followed.
 */
const URLS = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;

/** A code block's text, with each URL in it made a link and every other character kept. */
function linked(node: El): El[] {
  if (node.type !== "text") {
    node.children = node.children?.flatMap(linked);
    return [node];
  }
  const text = node.value || "";
  const out: El[] = [];
  let at = 0;
  for (const m of text.matchAll(URLS)) {
    const start = m.index ?? 0;
    if (start > at) out.push({ type: "text", value: text.slice(at, start) });
    out.push(
      forgeRef({
        type: "element",
        tagName: "a",
        properties: { href: m[0] },
        children: [{ type: "text", value: m[0] }],
      }),
    );
    at = start + m[0].length;
  }
  if (at < text.length) out.push({ type: "text", value: text.slice(at) });
  return out;
}

/**
 * Every heading gets a unique id and h2/h3 go into the outline the contents rail is drawn from. A
 * heading that already has an id is one the pipeline wrote — the hidden "Footnotes" label — and is
 * neither renamed nor listed.
 */
function shape(into: Heading[], slug: (s: string) => string) {
  const visit = (node: El) => {
    node.children = node.children?.map((child) => {
      if (child.tagName === "p") {
        const fig = figure(child);
        if (fig) return fig;
      }
      if (child.tagName === "pre") return linked(child)[0] as El;
      if (child.tagName === "a") return forgeRef(child);
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
/** Work this page may point to, by id: its address, and what its card says on hover. */
export interface Mentioned {
  url: string;
  title: string;
  summary: string;
  status: string;
  outcome?: string;
}

/** A link's preview, read from its page's Open Graph tags (unfurl.ts in apps/api). */
export interface LinkPreview {
  title: string;
  description: string;
  site: string;
}

const span = (cls: string, text: string): El => ({
  type: "element",
  tagName: "span",
  properties: { className: [cls] },
  children: [{ type: "text", value: text }],
});

/**
 * A link with its card: a small top line, a title and a few lines more, shown under the link on
 * hover or keyboard focus by the stylesheet alone (`.ref`), since this page runs no script. Inside
 * a code block the card is left out: the block scrolls, and would clip it.
 */
function withCard(
  a: El,
  card: { top: string; title: string; body?: string },
  inPre: boolean,
  n: number,
): El {
  if (inPre || !card.title) return a;
  const id = `ref-${n}`;
  const lines = [span("ref-stage", card.top), span("ref-title", card.title)];
  if (card.body && card.body.trim() !== card.title.trim())
    lines.push(span("ref-summary", card.body));
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["ref"] },
    children: [
      { ...a, properties: { ...a.properties, ariaDescribedBy: id } },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["ref-card"], id, role: "tooltip" },
        children: lines,
      },
    ],
  };
}

const hostOf = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * Every link in the document with what is known about where it goes, as a card: work named in the
 * text — written bare (`p64kbrdt`) or linked by its address — with where it stands, its title and
 * summary; a GitHub or GitLab reference with what it is; and any other page with its preview, when
 * one has been read. Only the work in `works`, which the caller has already found to exist and to
 * be work this page may point to. In code and quoted blocks too, since what came by email or webhook
 * is quoted in one and an id there is still that work; a link someone wrote keeps their words.
 */
function linkIds(works: Map<string, Mentioned>, here: string, previews: Map<string, LinkPreview>) {
  let n = 0;
  const workCard = (g: Mentioned) => ({ top: workStage(g), title: g.title, body: g.summary });
  const visit = (node: El, inPre: boolean): El[] => {
    if (node.type === "text") {
      const text = node.value || "";
      const out: El[] = [];
      let at = 0;
      for (const m of text.matchAll(WORK_ID)) {
        const g = works.get(m[0]);
        if (!g) continue;
        const start = m.index ?? 0;
        if (start > at) out.push({ type: "text", value: text.slice(at, start) });
        const a: El = {
          type: "element",
          tagName: "a",
          properties: { href: g.url },
          children: [{ type: "text", value: m[0] }],
        };
        out.push(withCard(a, workCard(g), inPre, n++));
        at = start + m[0].length;
      }
      if (!out.length) return [node];
      if (at < text.length) out.push({ type: "text", value: text.slice(at) });
      return out;
    }
    if (node.tagName === "a") {
      const href = String(node.properties?.href ?? "");
      const kind = linkKind(href, here);
      const g = kind?.kind === "work" ? works.get(kind.id) : undefined;
      if (g) return [withCard(node, workCard(g), inPre, n++)];
      const p = previews.get(href);
      if (kind?.kind === "forge")
        return [
          withCard(
            node,
            {
              top: FORGES[kind.site].name,
              title: p?.title || forgeLabel(kind),
              body: p?.description,
            },
            inPre,
            n++,
          ),
        ];
      if (p?.title)
        return [
          withCard(
            node,
            { top: p.site || hostOf(href), title: p.title, body: p.description },
            inPre,
            n++,
          ),
        ];
      return [node];
    }
    const pre = inPre || node.tagName === "pre";
    node.children = node.children?.flatMap((c) => visit(c, pre));
    return [node];
  };
  return () => (tree: El) => {
    visit(tree, false);
  };
}

/** The http(s) URLs a body names, at most `max`, for the caller to look previews up for. */
export function urlsIn(body: string, max = 20): string[] {
  return [...new Set(body.match(URLS) ?? [])].slice(0, max);
}

function makeRenderer(
  into: Heading[],
  slug: (s: string) => string,
  works: Map<string, Mentioned> = new Map(),
  here = "",
  previews: Map<string, LinkPreview> = new Map(),
) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkAlerts)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(shape(into, slug))
    .use(linkIds(works, here, previews))
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

/**
 * `works`: work the body names that this page may point to (linkIds); `here`, this page's host,
 * so a link to work on it is known as one; `previews`: what other pages it links to say about
 * themselves, by URL, for their cards.
 */
export function renderBody(
  body: string,
  works?: Map<string, Mentioned>,
  here = "",
  previews?: Map<string, LinkPreview>,
): Rendered {
  const outline: Heading[] = [];
  return { html: makeRenderer(outline, slugger(), works, here, previews)(body), outline };
}

/** The bare work ids a body names, at most `max`, for the caller to look up before rendering. */
export function idsIn(body: string, max = 40): string[] {
  return [...new Set(body.match(WORK_ID) ?? [])].slice(0, max);
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
