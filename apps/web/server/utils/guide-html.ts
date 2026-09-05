// Markdown to HTML for a guide page. This runs on the server only — the page it feeds is served
// under `noScripts`, and keeping `marked` here keeps it out of the client bundle entirely.
//
// Nothing sanitises the output. That is deliberate and is the same bargain apps/api makes: the
// route's CSP is `default-src 'none'` with no `script-src` at all, so anything script-shaped in
// someone else's markdown is inert. A sanitiser would be a second, weaker line pretending to be
// the first.
import { marked } from "marked";
import { verifyLayout } from "#api/guide";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

const md = (s: string) => marked.parse(s, { async: false, gfm: true }) as string;

/**
 * The verify view. What leads and what folds is decided in guide.ts — the rule about what a
 * verifier sees is part of the guide model, not of how it is drawn — and this only turns that
 * into HTML.
 */
function verifyBody(body: string): string {
  const { intro, lead, folded, by, hasVerification } = verifyLayout(body);
  const section = (s: string) => `<h2>${esc(s)}</h2>${md(by[s] as string)}`;
  const missing = hasVerification
    ? ""
    : `<p class="note">This guide has no <b>Verification</b> section — there is nothing here that
       says what "working" looks like. Worth asking whoever wrote it.</p>`;
  const rest =
    intro || folded.length
      ? `<details class="rest">
  <summary>How it was built · ${folded.length ? esc(folded.join(", ")) : "notes"}</summary>
  ${intro ? md(intro) : ""}${folded.map(section).join("")}
</details>`
      : "";
  return `${missing}${lead.map(section).join("")}${rest}`;
}

export function renderBody(body: string, view: "guide" | "verify"): string {
  return view === "verify" ? verifyBody(body) : md(body);
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
