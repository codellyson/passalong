// Just enough of the guide format for the server: read the frontmatter fields it indexes, and
// patch a field in place without disturbing the rest of the document. The full format lives in
// packages/relay/src/guide.js; this mirrors its parsing rules for strings and string lists.

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
