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

/**
 * A line of a guide as parts to render as text: `code`, **bold**, and everything else. Never HTML —
 * the line is markdown somebody else wrote, and this runs in the hub, which runs script. Only the
 * two marks people actually put in an Acceptance line are read; anything else stays as typed, which
 * is what the raw `**Paid**` in the review pane was, before this.
 */
export function inlineParts(text: string): { kind: "code" | "bold" | "text"; text: string }[] {
  const out: { kind: "code" | "bold" | "text"; text: string }[] = [];
  for (const p of codeParts(text)) {
    if (p.code) {
      out.push({ kind: "code", text: p.text });
      continue;
    }
    for (const q of p.text.split(/(\*\*[^*]+\*\*)/).filter(Boolean))
      out.push(
        q.length > 4 && q.startsWith("**") && q.endsWith("**")
          ? { kind: "bold", text: q.slice(2, -2) }
          : { kind: "text", text: q },
      );
  }
  return out;
}

/** One Acceptance line, and the evidence the agent filed against it. */
export interface CheckedLine {
  asked: string;
  ran: string;
  /** The agent's one plain sentence for a person. Empty when it wrote none: show `asked` instead. */
  says: string;
  /** False only when a runner executed the check and it failed; otherwise not known to be bad. */
  ok: boolean;
}

/** Evidence the agent filed that answers no line the task asked for. */
export interface Matched {
  rows: CheckedLine[];
  extra: { check: string; ran: string; says?: string; ok?: boolean }[];
}

type Filed = { check: string; ran: string; says?: string; ok?: boolean };

/** Two lines are the same check when they read the same: case, code ticks and punctuation aside. */
const same = (text: string) =>
  text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Put each piece of evidence against the line it answers.
 *
 * The agent writes the check in its own words, from the task it was handed, so most pairs match on
 * the text. Where they do not, containment catches the rest — an agent that shortens "Six resets
 * for one address in a minute: the sixth is refused with 429" to "the sixth is refused with 429"
 * is answering that line and nothing else.
 *
 * Never by position. A hand-in that skipped the second of four checks would otherwise have its
 * third piece of evidence filed under the second line, which is worse than filing it nowhere: the
 * reviewer would be reading a pairing the agent never claimed. Anything unmatched is shown on its
 * own, and a line with no evidence stays visibly empty — that gap is the point of the screen.
 */
export function matchChecks(asked: string[], checks: Filed[]): Matched {
  const left = checks.map((c) => ({ ...c, used: false }));
  const rows = asked.map((line) => {
    const key = same(line);
    const hit =
      left.find((c) => !c.used && same(c.check) === key) ??
      left.find(
        (c) => !c.used && key && (same(c.check).includes(key) || key.includes(same(c.check))),
      );
    if (hit) hit.used = true;
    return { asked: line, ran: hit?.ran ?? "", says: hit?.says ?? "", ok: hit?.ok !== false };
  });
  return {
    rows,
    extra: left.filter((c) => !c.used).map(({ used, ...c }) => c),
  };
}
