// The transfer guide format: plain markdown with a small YAML-ish frontmatter block.
//
// No proprietary format and no YAML library. The frontmatter only ever holds strings and
// lists of strings, so a deliberately tiny parser covers it and stays readable when hand-edited.
import { randomBytes } from "node:crypto";

export const STATUSES = ["draft", "published", "consumed", "promoted"];

// Body sections in the order a guide should present them. The heading text is what the
// receiving agent keys on, so keep these stable.
export const SECTIONS = [
  "Problem",
  "Solution shape",
  "Decisions and rationale",
  "Steps",
  "Verification",
  "Gotchas",
];

// Fields that hold a list of strings. Everything else is a plain string.
const LIST_FIELDS = new Set(["stack_assumptions", "tags"]);

// IDs are short enough to type and say out loud. 8 chars from a 31-letter alphabet with the
// look-alikes removed (0/o, 1/l/i) is ~40 bits: plenty for addressing, not a secret.
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newId(length = 8) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}
export const ID_RE = /^[a-z0-9]{6,12}$/;

function scalar(raw) {
  const v = raw.trim();
  if (v === "") return "";
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  return v;
}

function inlineList(raw) {
  const inner = raw.trim().slice(1, -1).trim();
  if (inner === "") return [];
  return inner
    .split(",")
    .map(scalar)
    .filter((s) => s !== "");
}

/** Parse a frontmatter block (the text between the --- fences) into an object. */
export function parseFrontmatter(text) {
  const meta = {};
  const lines = text.split(/\r?\n/);
  let listKey = null;
  for (const line of lines) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const item = /^\s+-\s*(.*)$/.exec(line);
    if (item && listKey) {
      meta[listKey].push(scalar(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, rest] = kv;
    if (rest.trim() === "" && LIST_FIELDS.has(key)) {
      meta[key] = [];
      listKey = key;
    } else if (rest.trim().startsWith("[") && rest.trim().endsWith("]")) {
      meta[key] = inlineList(rest);
      listKey = null;
    } else {
      meta[key] = LIST_FIELDS.has(key) ? [scalar(rest)] : scalar(rest);
      listKey = null;
    }
  }
  for (const k of LIST_FIELDS) if (meta[k] === undefined) meta[k] = [];
  return meta;
}

function quote(v) {
  const s = String(v ?? "");
  // Quote anything YAML would misread: colons, leading symbols, or empty.
  return /[:#[\]{}"'|>&*!%@`,]|^\s|\s$|^$/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

const META_ORDER = [
  "id",
  "title",
  "created",
  "author",
  "source_context",
  "status",
  "team",
  "to",
  "stack_assumptions",
  "tags",
];

export function serializeFrontmatter(meta) {
  const keys = [
    ...META_ORDER.filter((k) => k in meta),
    ...Object.keys(meta).filter((k) => !META_ORDER.includes(k)),
  ];
  const out = [];
  for (const key of keys) {
    const v = meta[key];
    if (Array.isArray(v)) {
      out.push(v.length ? `${key}: [${v.map(quote).join(", ")}]` : `${key}: []`);
    } else {
      out.push(`${key}: ${quote(v)}`);
    }
  }
  return out.join("\n");
}

/** Split a markdown document into { meta, body }. A document with no frontmatter has empty meta. */
export function parse(markdown) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  if (!m) return { meta: parseFrontmatter(""), body: markdown.trim() };
  return { meta: parseFrontmatter(m[1]), body: m[2].trim() };
}

export function serialize({ meta, body }) {
  return `---\n${serializeFrontmatter(meta)}\n---\n\n${body.trim()}\n`;
}

/** Map of "## Heading" → section text, so callers can look at Verification or Gotchas alone. */
export function sections(body) {
  const out = {};
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = h[1];
      out[current] = "";
      continue;
    }
    if (current) out[current] += `${line}\n`;
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim();
  return out;
}

/** Problems that make a guide unfit to publish. Empty array means it is fine. */
export function validate({ meta, body }) {
  const errors = [];
  if (!meta.title) errors.push("frontmatter needs a title");
  if (meta.id && !ID_RE.test(meta.id)) errors.push(`id "${meta.id}" is not a valid passalong id`);
  if (meta.status && !STATUSES.includes(meta.status)) {
    errors.push(`status must be one of ${STATUSES.join(", ")}`);
  }
  const have = sections(body);
  for (const s of ["Problem", "Steps"]) {
    if (!have[s]) errors.push(`missing "## ${s}" section`);
  }
  if (body.includes("<!-- passalong:")) errors.push("template placeholders are still in the body");
  return errors;
}

/** Fill in what a fresh guide needs before it can be stored. Returns a new object. */
export function stamp(guide, defaults = {}) {
  const meta = { ...guide.meta };
  if (!meta.id) meta.id = newId();
  if (!meta.created) meta.created = new Date().toISOString();
  if (!meta.status) meta.status = "draft";
  for (const [k, v] of Object.entries(defaults))
    if (meta[k] === undefined || meta[k] === "") meta[k] = v;
  return { meta, body: guide.body };
}

/** A draft with the section skeleton. Placeholders are HTML comments so they vanish when rendered. */
export function template(meta = {}) {
  const body = [
    "## Problem",
    "<!-- passalong: What was broken or needed, in two or three sentences. -->",
    "",
    "## Solution shape",
    "<!-- passalong: The approach at a high level, before any code. -->",
    "",
    "## Decisions and rationale",
    "<!-- passalong: What was chosen, what was rejected, and why. This lets the receiver adapt instead of copy. -->",
    "",
    "## Steps",
    "<!-- passalong: Concrete implementation steps. Mark context-specific parts: ASSUMES: Postgres. If MySQL, adjust X. -->",
    "",
    "## Verification",
    "<!-- passalong: Commands, expected outputs, test cases that prove it worked. -->",
    "",
    "## Gotchas",
    "<!-- passalong: What failed along the way and why. Often the highest-value section. -->",
  ].join("\n");
  return serialize({
    meta: {
      title: "",
      author: "",
      source_context: "",
      status: "draft",
      stack_assumptions: [],
      tags: [],
      ...meta,
    },
    body,
  });
}

/** Strip the template comments so an untouched section reads as empty rather than as a prompt. */
export function stripPlaceholders(body) {
  return body.replace(/^<!-- passalong:.*?-->\n?/gm, "").trim();
}
