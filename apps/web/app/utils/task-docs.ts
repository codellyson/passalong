/**
 * Reading a task and its write-up side by side on the review page.
 *
 * The review is a comparison — what was asked (the task's Acceptance) against what the agent says
 * it checked (the write-up's Verification) — so both documents are split into sections and their
 * lists into one check per line. Plain string work with no imports, so it is testable without Nuxt.
 */

export type Sections = Record<string, string>;

/** `## Heading` → its text, trimmed. Frontmatter is dropped; deeper headings stay in their section. */
export function sectionsOf(markdown: string): Sections {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const out: Sections = {};
  let current = "";
  for (const line of body.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h?.[1]) {
      current = h[1];
      out[current] = "";
    } else if (current) out[current] += `${line}\n`;
  }
  for (const k of Object.keys(out)) out[k] = (out[k] ?? "").trim();
  return out;
}

/** A section's list as one check per line: bullets and numbering stripped, blank lines dropped. */
export function checkLines(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim())
    .filter(Boolean);
}

/** Inline code as parts, so a line renders `code` as code rather than as backticks. */
export function codeParts(text: string): { code: boolean; text: string }[] {
  return text
    .split(/(`[^`]+`)/)
    .filter(Boolean)
    .map((p) =>
      p.length > 1 && p.startsWith("`") && p.endsWith("`")
        ? { code: true, text: p.slice(1, -1) }
        : { code: false, text: p },
    );
}
