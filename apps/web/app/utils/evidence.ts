/**
 * A hand-in's evidence, split into the parts a page can draw.
 *
 * Evidence is whatever the agent pasted: commands and what came back, a link to the change, a
 * screenshot it uploaded. Most of it is terminal output, which has to stay monospace and exactly
 * as written — that is the point of it. But the two parts a reviewer acts on are the link and the
 * picture, and a raw URL inside a <pre> is neither followable nor a picture.
 *
 * So the text is cut into runs of output, with links marked inside them, and screenshots lifted
 * out as blocks of their own in the order they appeared.
 *
 * Imports only types, so it runs under `node --test` without Nuxt.
 */

/** A stretch of output. `url` on a part means that text is a link. */
export interface EvidenceRun {
  kind: "run";
  parts: { text: string; url?: string }[];
}

/** A screenshot this server serves, drawn as a picture. */
export interface EvidenceShot {
  kind: "shot";
  /** `/v1/shots/<id>` — a path, so whichever origin the reader is on serves it. */
  url: string;
  alt: string;
}

export type EvidencePart = EvidenceRun | EvidenceShot;

/**
 * A URL as it appears in pasted output.
 *
 * Trailing punctuation is left out on purpose: people end sentences with links, and `…/pull/311.`
 * is a link and a full stop, not a 404. Brackets and quotes close the same way.
 */
const URLS = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;

/**
 * One of our own screenshots, `/v1/shots/<id>`, optionally written as markdown with alt text.
 *
 * Only these are drawn as images. An <img> pointing at a URL a stranger controls would fetch from
 * them every time the hub drew the row — a reviewer's browser, told to make a request by whoever
 * wrote the evidence. Anything else is a link, which the reviewer follows or does not.
 */
const SHOTS =
  /(?:!\[([^\]]*)\]\((https?:\/\/[^\s)]*\/v1\/shots\/[a-z0-9]{6,16})\)|(https?:\/\/\S*\/v1\/shots\/[a-z0-9]{6,16}))/g;

/**
 * Output, with the links inside it marked. Empty when there is nothing but whitespace.
 *
 * The blank lines at either end go: a screenshot usually sits on a line of its own, and the line
 * breaks that put it there would otherwise open and close every block around it with empty space.
 * Everything between the first and last character is kept exactly as it was pasted.
 */
function run(raw: string): EvidenceRun[] {
  const text = raw.replace(/^\n+/, "").replace(/\n+[^\S\n]*$/, "");
  if (!text.trim()) return [];
  const parts: { text: string; url?: string }[] = [];
  let at = 0;
  for (const m of text.matchAll(URLS)) {
    const start = m.index ?? 0;
    if (start > at) parts.push({ text: text.slice(at, start) });
    parts.push({ text: m[0], url: m[0] });
    at = start + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return [{ kind: "run", parts }];
}

export function evidenceParts(text: string): EvidencePart[] {
  const said = String(text ?? "");
  const out: EvidencePart[] = [];
  let at = 0;
  for (const m of said.matchAll(SHOTS)) {
    const start = m.index ?? 0;
    out.push(...run(said.slice(at, start)));
    // Kept as a path, not the address it was written as.
    //
    // A shot is identified by its id, and every origin this product has served from answers the
    // same `/v1/shots/<id>`. The page's own Content-Security-Policy is `img-src 'self'`, so an
    // absolute URL recorded against a different host — the old passalong.kreativekorna.com, a
    // staging origin, a hand-in made before PUBLIC_ORIGIN changed — is blocked, and a blocked
    // image is indistinguishable from evidence nobody attached. Same-origin by construction.
    const absolute = (m[2] || m[3]) as string;
    out.push({
      kind: "shot",
      url: absolute.slice(absolute.indexOf("/v1/shots/")),
      alt: m[1] || "",
    });
    at = start + m[0].length;
  }
  out.push(...run(said.slice(at)));
  return out;
}
