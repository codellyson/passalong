// Just enough of the guide format for the server: read the frontmatter fields it indexes, and
// patch a field in place without disturbing the rest of the document. The full format lives in
// packages/passalong/src/guide.js; this mirrors its parsing rules for strings and string lists.

export const STATUSES = ["draft", "published", "consumed", "promoted"] as const;
export type Status = (typeof STATUSES)[number];

export interface Meta {
  id?: string;
  title?: string;
  status?: string;
  source_context?: string;
  url?: string;
  tags: string[];
  stack_assumptions: string[];
  [key: string]: string | string[] | undefined;
}

const LIST_FIELDS = new Set(["tags", "stack_assumptions"]);

function scalar(raw: string): string {
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  return v;
}

export function split(markdown: string): { front: string; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  return m ? { front: m[1], body: m[2] } : null;
}

export function parseMeta(markdown: string): Meta {
  const meta: Meta = { tags: [], stack_assumptions: [] };
  const parts = split(markdown);
  if (!parts) return meta;
  let listKey: string | null = null;
  for (const line of parts.front.split(/\r?\n/)) {
    const item = /^\s+-\s*(.*)$/.exec(line);
    if (item && listKey) {
      (meta[listKey] as string[]).push(scalar(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, rest] = kv;
    const r = rest.trim();
    if (r === "" && LIST_FIELDS.has(key)) {
      meta[key] = [];
      listKey = key;
    } else if (r.startsWith("[") && r.endsWith("]")) {
      const inner = r.slice(1, -1).trim();
      meta[key] = inner ? inner.split(",").map(scalar).filter(Boolean) : [];
      listKey = null;
    } else {
      meta[key] = LIST_FIELDS.has(key) ? [scalar(r)] : scalar(r);
      listKey = null;
    }
  }
  return meta;
}

function quote(v: string): string {
  return /[:#[\]{}"'|>&*!%@`,]|^\s|\s$|^$/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

/** Set one scalar frontmatter field, replacing it if present or appending it if not. */
export function setField(markdown: string, key: string, value: string): string {
  const parts = split(markdown);
  if (!parts) return `---\n${key}: ${quote(value)}\n---\n\n${markdown}`;
  const re = new RegExp(`^${key}:.*$`, "m");
  const front = re.test(parts.front)
    ? parts.front.replace(re, `${key}: ${quote(value)}`)
    : `${parts.front}\n${key}: ${quote(value)}`;
  return `---\n${front}\n---\n${parts.body}`;
}

/** Everything after the frontmatter, for rendering. */
export function body(markdown: string): string {
  return split(markdown)?.body ?? markdown;
}

/**
 * Split a body into its `## ` sections, keeping the author's order and anything written before
 * the first heading. Deliberately not a mirror of `sections()` in packages/passalong/src/guide.js:
 * that one is for validation and drops the preamble, which is fine when you are asking "is
 * Problem present" and not fine when you are re-composing a page — nothing may be lost.
 */
export function splitSections(body: string): {
  intro: string;
  order: string[];
  by: Record<string, string>;
} {
  const by: Record<string, string> = {};
  const order: string[] = [];
  let intro = "";
  let current: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = h[1];
      if (!(current in by)) {
        by[current] = "";
        order.push(current);
      }
      continue;
    }
    if (current) by[current] += `${line}\n`;
    else intro += `${line}\n`;
  }
  for (const k of order) by[k] = by[k].trim();
  return { intro: intro.trim(), order, by };
}

/**
 * A guide is written by the person who did the work, in the order they did it: problem, approach,
 * decisions, steps, then how to check. Whoever verifies it reads for a different question — "does
 * it do what it claims?" — so for them the last sections are the point and the steps are
 * background. This decides what leads and what folds; turning it into HTML is render.ts's job.
 *
 * Everything folds rather than disappears. No view of a guide may lose part of it.
 */
export const VERIFY_LEAD = ["Problem", "Verification", "Gotchas"];

export function verifyLayout(body: string): {
  intro: string;
  lead: string[];
  folded: string[];
  by: Record<string, string>;
  hasVerification: boolean;
} {
  const { intro, order, by } = splitSections(body);
  const lead = VERIFY_LEAD.filter((s) => by[s]);
  return {
    intro,
    lead,
    folded: order.filter((s) => !lead.includes(s)),
    by,
    hasVerification: Boolean(by.Verification),
  };
}
