// Markdown to HTML for a guide page. This runs on the server only — the page it feeds is served
// under `noScripts`, and keeping the parser here keeps it out of the client bundle entirely.
// It is the same remark + GFM pipeline folder documents use, plus GitHub's alerts, so a guide,
// a post and a folder document read the same Markdown the same way.
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
import { verifyLayout } from "#api/guide";
import { remarkAlerts } from "#shared/markdown-alerts";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

/** One entry in the contents rail. Only h2 and h3 — below that is detail, not structure. */
export interface Heading {
  level: 2 | 3;
  text: string;
  id: string;
  /** Set for the six sections a transfer guide is made of, so they can be typeset as themselves. */
  kind?: string;
  /** Verify only: this heading is in the part of the guide the view moved below the lead. */
  then?: boolean;
}

/**
 * The canonical sections, by the heading an author writes. Anything else renders as a plain
 * heading — a guide may contain sections nobody planned for, and those must still look right.
 */
const KINDS: Record<string, string> = {
  problem: "problem",
  "solution shape": "solution",
  "decisions and rationale": "decisions",
  steps: "steps",
  // A bug report's repro. Named apart from `steps` on purpose: an agent executes Steps, and
  // these produce the defect. See BUG_SECTIONS in packages/passalong/src/guide.js.
  reproduce: "reproduce",
  verification: "verification",
  gotchas: "gotchas",
};

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

/** Ids have to be unique on the page: two guides in ten will have two "Steps" of some kind. */
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
 * Every heading gets a unique id and h2/h3 go into the outline the contents rail is drawn from; a
 * canonical section's h2 is also marked with its kind. A heading that already has an id is one the
 * pipeline wrote — the hidden "Footnotes" label — and is neither renamed nor listed.
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
        const kind = level === 2 ? KINDS[text.toLowerCase()] : undefined;
        if (level === 2 || level === 3) into.push({ level, text, id, kind });
        child.properties = { ...child.properties, id, ...(kind ? { dataKind: kind } : {}) };
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

/** Markdown we wrote ourselves, such as a blog post, rendered the way a guide is. */
export function renderMarkdown(body: string): string {
  return makeRenderer([], slugger())(body);
}

/**
 * The verify view. What leads and what folds is decided in guide.ts — the rule about what a
 * verifier sees is part of the guide model, not of how it is drawn — and this only turns that
 * into HTML.
 *
 * The rest of the guide used to sit inside a <details>. It does not any more: a disclosure is the
 * one interactive element this page is allowed, and spending it here bought nothing — the contents
 * rail could not link into a closed one, and a reader arriving from a teammate's link had to find
 * and press a control before they could see two thirds of the document. It is one page now, in two
 * parts, and the rail addresses both.
 */
function verifyBody(body: string, into: Heading[], slug: (s: string) => string) {
  const { intro, lead, folded, by, hasVerification } = verifyLayout(body);

  // Two renderers, two sinks: the h3s inside a section belong to whichever half that section is
  // in, and the rail groups them that way.
  const restOutline: Heading[] = [];
  const mdLead = makeRenderer(into, slug);
  const mdRest = makeRenderer(restOutline, slug);

  const section = (s: string, md: (m: string) => string, sink: Heading[]) => {
    const id = slug(s);
    const kind = KINDS[s.toLowerCase()];
    sink.push({ level: 2, text: s, id, kind });
    const attr = kind ? ` data-kind="${kind}"` : "";
    return `<h2 id="${esc(id)}"${attr}>${esc(s)}</h2>${md(by[s] as string)}`;
  };

  const missing = hasVerification
    ? ""
    : `<p class="note">This guide has no <b>Verification</b> section — there is nothing here that
       says what "working" looks like. Worth asking whoever wrote it.</p>`;

  const html = missing + lead.map((s) => section(s, mdLead, into)).join("");
  const restHtml =
    (intro ? mdRest(intro) : "") + folded.map((s) => section(s, mdRest, restOutline)).join("");

  for (const h of restOutline) h.then = true;
  into.push(...restOutline);

  return { html, restHtml, lead, rest: folded };
}

/** The body as HTML, plus the outline the contents rail is built from. */
export interface Rendered {
  html: string;
  outline: Heading[];
  /**
   * Verify only. The sections the view moved below the lead, kept separate so the page can say
   * what it did between the two halves rather than running them together silently.
   */
  rest?: { html: string; names: string[] };
  /** Verify only: which sections lead, and how many the guide has in total. */
  cut?: { lead: string[]; total: number };
}

export function renderBody(body: string, view: "guide" | "verify"): Rendered {
  const outline: Heading[] = [];
  const slug = slugger();
  if (view !== "verify") return { html: makeRenderer(outline, slug)(body), outline };

  const { html, restHtml, lead, rest } = verifyBody(body, outline, slug);
  return {
    html,
    outline,
    rest: restHtml ? { html: restHtml, names: rest } : undefined,
    cut: { lead, total: lead.length + rest.length },
  };
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
  if (!text) return "A Passalong transfer guide.";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
