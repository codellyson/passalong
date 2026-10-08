// Reading a guide in parts, and how big one may be. Mirrors the same names in
// packages/passalong/src/guide.js — `test/sections.test.mjs` holds the two to the same answers.
//
// Most of what is stored is a few very large guides: six of 123 held 72% of the text. An agent
// that only wants the Acceptance of a long task, or what a long handoff decided, should not have to
// read the rest first.

/** Over this a guide is large: its readers are offered the outline first, and its author a warning. */
export const GUIDE_WARN = 20_000;
/** Over this a new guide is refused. A guide stored before it existed may keep the size it has. */
export const GUIDE_MAX = 60_000;

export interface Heading {
  heading: string;
  level: number;
  /** Characters from this heading to the next of the same or a higher level, nested ones included. */
  chars: number;
}

interface Line {
  heading: string;
  level: number;
  start: number;
}

/** Where each heading starts, outside the frontmatter and outside code fences. */
function headings(markdown: string): { lines: Line[]; bodyStart: number } {
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown);
  const bodyStart = fm ? fm[0].length : 0;
  const lines: Line[] = [];
  let fence = "";
  let at = bodyStart;
  for (const raw of markdown.slice(bodyStart).split("\n")) {
    const mark = /^\s*(```|~~~)/.exec(raw)?.[1];
    if (mark) fence = fence ? (fence === mark ? "" : fence) : mark;
    const m = !fence && !mark ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw) : null;
    if (m) lines.push({ heading: m[2].trim(), level: m[1].length, start: at });
    at += raw.length + 1;
  }
  return { lines, bodyStart };
}

/** The end of the section that begins at lines[i]: the next heading at its level or above. */
function endOf(lines: Line[], i: number, total: number): number {
  for (let j = i + 1; j < lines.length; j++)
    if (lines[j].level <= lines[i].level) return lines[j].start;
  return total;
}

export function outline(markdown: string): Heading[] {
  const { lines } = headings(markdown);
  return lines.map((l, i) => ({
    heading: l.heading,
    level: l.level,
    chars: endOf(lines, i, markdown.length) - l.start,
  }));
}

/** One section by its heading — exact, then by its start, then by what it contains. */
export function section(markdown: string, name: string): { heading: string; text: string } | null {
  const { lines } = headings(markdown);
  const want = String(name ?? "")
    .trim()
    .toLowerCase();
  if (!want) return null;
  const at = (test: (h: string) => boolean) =>
    lines.findIndex((l) => test(l.heading.toLowerCase()));
  const i = [
    at((h) => h === want),
    at((h) => h.startsWith(want)),
    at((h) => h.includes(want)),
  ].find((n) => n >= 0);
  if (i === undefined) return null;
  return {
    heading: lines[i].heading,
    text: markdown.slice(lines[i].start, endOf(lines, i, markdown.length)).trimEnd(),
  };
}

/** What a guide's author is told when it is on the large side. */
export function sizeWarning(chars: number): string | null {
  return chars > GUIDE_WARN
    ? `this guide is ${chars.toLocaleString("en")} characters, and over ${GUIDE_WARN.toLocaleString("en")} ` +
        "it is read by outline first. Put logs, dumps and long output in a file (attach_file) and " +
        "link it; keep the guide to what the next agent has to act on."
    : null;
}

/** Why a new guide of this size is refused, or null. `was` is the size already stored for the id. */
export function sizeProblem(chars: number, was = 0): string | null {
  if (chars <= Math.max(GUIDE_MAX, was)) return null;
  return (
    `This guide is ${chars.toLocaleString("en")} characters; the limit is ` +
    `${GUIDE_MAX.toLocaleString("en")}. Put logs, dumps and long output in a file (agents: ` +
    "attach_file), link it in the guide, and keep the guide to what the next agent has to act on."
  );
}
