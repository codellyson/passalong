// Just enough of the guide format for the server: read the frontmatter fields it indexes, and
// patch a field in place without disturbing the rest of the document. The full format lives in
// packages/passalong/src/guide.js; this mirrors its parsing rules for strings and string lists.

/**
 * A guide is a draft or it is published. `consumed` and `promoted` are legacy: they were an author
 * lifecycle laid over a transfer that already reports itself — `consumed` duplicated the verdict,
 * and `promoted` was a pull count with a name. Nothing sets them any more.
 *
 * They stay in this list because they are *accepted*, not produced. The value lives in frontmatter
 * inside markdown files in other people's repositories, and `validate()` rejects a status it does
 * not know — so removing them here would make a guide shared a month ago fail to re-share today.
 */
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

/**
 * Split a flow sequence's inner text on the commas *between* items, not the ones inside them. The
 * writer quotes any value containing a comma, so splitting on every comma tears those items apart —
 * and the pieces keep their stray quotes, because `scalar()` only unwraps a value quoted at both
 * ends. Mirrors `items()` in packages/passalong/src/guide.js.
 */
function items(inner: string): string[] {
  const out: string[] = [];
  let buf = "";
  let quoted: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i] as string;
    if (quoted) {
      // An inner double quote is written as \", which does not close the value.
      if (c === "\\" && quoted === '"' && inner[i + 1] === '"') {
        buf += c + inner[i + 1];
        i++;
        continue;
      }
      buf += c;
      if (c === quoted) quoted = null;
      continue;
    }
    if (c === '"' || c === "'") quoted = c;
    if (c === ",") {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  out.push(buf);
  return out;
}

export function split(markdown: string): { front: string; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  // Both groups are mandatory in the pattern, so a match means both are strings. The assertions
  // are for `noUncheckedIndexedAccess`, which cannot know that; they compile away.
  return m ? { front: m[1] as string, body: m[2] as string } : null;
}

export function parseMeta(markdown: string): Meta {
  const meta: Meta = { tags: [], stack_assumptions: [] };
  const parts = split(markdown);
  if (!parts) return meta;
  let listKey: string | null = null;
  for (const line of parts.front.split(/\r?\n/)) {
    // YAML lets a block sequence sit flush with its key, so the indent is optional. Requiring it
    // dropped `- item` lines silently: they match no key either, and the field stayed empty.
    const item = /^\s*-\s*(.*)$/.exec(line);
    if (item && listKey) {
      (meta[listKey] as string[]).push(scalar(item[1] as string));
      continue;
    }
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1] as string;
    const r = (kv[2] as string).trim();
    if (r === "" && LIST_FIELDS.has(key)) {
      meta[key] = [];
      listKey = key;
    } else if (r.startsWith("[") && r.endsWith("]")) {
      const inner = r.slice(1, -1).trim();
      meta[key] = inner ? items(inner).map(scalar).filter(Boolean) : [];
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
      current = h[1] as string;
      if (!(current in by)) {
        by[current] = "";
        order.push(current);
      }
      continue;
    }
    if (current) by[current] += `${line}\n`;
    else intro += `${line}\n`;
  }
  for (const k of order) by[k] = (by[k] as string).trim();
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
