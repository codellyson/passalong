// Markdown to HTML for a guide page. This runs on the server only — the page it feeds is served
// under `noScripts`, and keeping `marked` here keeps it out of the client bundle entirely.
//
// Nothing sanitises the output. That is deliberate and is the same bargain apps/api makes: the
// route's CSP is `default-src 'none'` with no `script-src` at all, so anything script-shaped in
// someone else's markdown is inert. A sanitiser would be a second, weaker line pretending to be
// the first.
import { Marked } from "marked";
import { verifyLayout } from "#api/guide";

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
  verification: "verification",
  gotchas: "gotchas",
};

const strip = (html: string) => html.replace(/<[^>]*>/g, "");

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
 * Done on the rendered HTML rather than in the image renderer because marked wraps a lone image
 * in a paragraph, and a <figure> inside a <p> is invalid: the browser closes the paragraph early
 * and the structure comes apart. Matching the wrapping paragraph is what makes it a block-level
 * decision. An image sitting inside a sentence is left exactly where it is.
 */
function figures(html: string): string {
  return html.replace(/<p>(<img [^>]*>)<\/p>/g, (_, img: string) => {
    const alt = /alt="([^"]*)"/.exec(img)?.[1] || "";
    return `<figure>${img}${alt ? `<figcaption>${alt}</figcaption>` : ""}</figure>`;
  });
}

/**
 * One renderer per render, closing over the outline it fills. A module-level instance would be
 * shared by concurrent requests, and while `parse` is synchronous, a collector that is only safe
 * because nothing yields inside it is a trap for whoever touches this next.
 */
function makeRenderer(into: Heading[], slug: (s: string) => string) {
  const marked = new Marked({ async: false, gfm: true });
  marked.use({
    renderer: {
      heading(token) {
        const html = this.parser.parseInline(token.tokens);
        const text = strip(html);
        const id = slug(text);
        const kind = token.depth === 2 ? KINDS[text.toLowerCase()] : undefined;
        if (token.depth === 2 || token.depth === 3) {
          into.push({ level: token.depth, text, id, kind });
        }
        const attr = kind ? ` data-kind="${kind}"` : "";
        return `<h${token.depth} id="${id}"${attr}>${html}</h${token.depth}>\n`;
      },
    },
  });
  return (s: string) => figures(marked.parse(s, { async: false }) as string);
}

/**
 * The verify view. What leads and what folds is decided in guide.ts — the rule about what a
 * verifier sees is part of the guide model, not of how it is drawn — and this only turns that
 * into HTML.
 */
function verifyBody(body: string, into: Heading[], slug: (s: string) => string): string {
  const md = makeRenderer([], slug);
  const { intro, lead, folded, by, hasVerification } = verifyLayout(body);

  const section = (s: string, collect: boolean) => {
    const id = slug(s);
    const kind = KINDS[s.toLowerCase()];
    // Only the leading sections reach the rail. The folded ones are behind a disclosure, and a
    // contents entry that jumps into something closed is a link that appears to do nothing.
    if (collect) into.push({ level: 2, text: s, id, kind });
    const attr = kind ? ` data-kind="${kind}"` : "";
    return `<h2 id="${esc(id)}"${attr}>${esc(s)}</h2>${md(by[s] as string)}`;
  };

  const missing = hasVerification
    ? ""
    : `<p class="note">This guide has no <b>Verification</b> section — there is nothing here that
       says what "working" looks like. Worth asking whoever wrote it.</p>`;
  // Built before the fold, because the rail is assembled in the order these run and the fold is
  // the last thing on the page.
  const leadHtml = lead.map((s) => section(s, true)).join("");

  // The fold gets a rail entry of its own. Linking to the <details> lands on its summary, which
  // is visible and is the control that opens it — unlike a link to a heading inside it. Without
  // this, a guide written with none of the canonical section names has an empty contents rail on
  // this view, because everything it contains is folded.
  let rest = "";
  if (intro || folded.length) {
    const id = slug("How it was built");
    into.push({ level: 2, text: "How it was built", id });
    rest = `<details class="rest" id="${esc(id)}">
  <summary>How it was built · ${folded.length ? esc(folded.join(", ")) : "notes"}</summary>
  ${intro ? md(intro) : ""}${folded.map((s) => section(s, false)).join("")}
</details>`;
  }
  return `${missing}${leadHtml}${rest}`;
}

/** The body as HTML, plus the outline the contents rail is built from. */
export function renderBody(
  body: string,
  view: "guide" | "verify",
): { html: string; outline: Heading[] } {
  const outline: Heading[] = [];
  const slug = slugger();
  const html =
    view === "verify" ? verifyBody(body, outline, slug) : makeRenderer(outline, slug)(body);
  return { html, outline };
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
