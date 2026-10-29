// The work format: plain markdown with a small YAML-ish frontmatter block.
//
// No proprietary format and no YAML library. The frontmatter only ever holds strings and
// lists of strings, so a deliberately tiny parser covers it and stays readable when hand-edited.
import { randomBytes } from "node:crypto";

/**
 * A guide is a draft or it is published, and `consumed` is the author's shelf — off the board, out
 * of the free tier's count, reversible. `promoted` is the one true legacy: an author lifecycle laid
 * over work that already reports itself, since a pull count says how travelled a guide is
 * without anyone having to grade it.
 *
 * This list is what is **accepted**, and it is not what may be **set** — that is `SETTABLE` below.
 * The distinction is load-bearing. A status lives in frontmatter, inside markdown files in other
 * people's repositories, and `validate()` rejects a status it does not know, so dropping a value
 * from here would make a guide shared a month ago fail to re-share today.
 */
export const STATUSES = ["draft", "published", "consumed", "promoted"];

/**
 * What a write may choose. `promoted` is absent: it cannot be set on a guide that does not already
 * carry it, from any surface.
 *
 * Two reasons, and the second is the sharper one. A status that can still be set reads as a
 * feature to whoever meets it next, however many deprecation notices sit around it. And
 * `quota.ts` counts `published` and `promoted` as the statuses that occupy room — so while
 * `promoted` remains settable, promoting every guide is an unlimited free tier. Closing the write
 * closes that, and does it without touching what the free tier counts, which still has to include
 * the guides already carrying the status.
 */
export const SETTABLE = ["draft", "published", "consumed"];
/**
 * What a guide says to a person, in a sentence or two, and the longest that may be.
 *
 * Everything an agent writes is written for another agent: exact, dense, full of ids and paths. A
 * person scanning their work wants "what is this, and do I need to do anything", so every guide
 * carries both — the document is the agent's form, and `summary:` is the human one, shown by default
 * in the hub with the document behind "Show details".
 *
 * Said by the author and refused when absent: a summary written afterwards by something that was
 * not there is a second voice that can say what nobody claimed.
 */
export const SUMMARY_MAX = 400;

// Fields that hold a list of strings. Everything else is a plain string.
/**
 * One tag, in the one style tags are written in: lowercase, words joined by a hyphen.
 *
 * Nothing used to normalise them, so `custom-fields` and `additional_information` could sit on the
 * same guide and the same idea exist twice under two spellings. A tag is a controlled vocabulary,
 * not prose — its whole value is that two people who mean the same thing write the same string.
 * Mirrors `tag()` in apps/api/src/guide.ts.
 */
export function tag(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 32)
    .replace(/^-+|-+$/g, "");
}

/** A guide's tags: normalised, emptied of blanks, deduped once two spellings become one. */
export function tagList(raw) {
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  return [...new Set(list.map(tag).filter(Boolean))];
}

const LIST_FIELDS = new Set(["stack_assumptions", "tags", "blocked_by"]);

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

/**
 * Split a flow sequence's inner text on the commas *between* items, not the ones inside them.
 * `quote()` wraps any value containing a comma, so a plain `split(",")` tears those items apart —
 * and the pieces keep their stray quotes, because `scalar()` only unwraps a value quoted at both
 * ends. Serialising a list and parsing it back has to return the same list.
 */
function items(inner) {
  const out = [];
  let buf = "";
  let quoted = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quoted) {
      // `quote()` escapes an inner double quote as \", which does not close the value.
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

function inlineList(raw) {
  const inner = raw.trim().slice(1, -1).trim();
  if (inner === "") return [];
  return items(inner)
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
    // YAML lets a block sequence sit flush with its key, so the indent is optional. Requiring it
    // dropped `- item` lines silently: they match no key either, and the field stayed empty.
    const item = /^\s*-\s*(.*)$/.exec(line);
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
  // Only the lists every piece of work has. `blocked_by` is optional, and defaulting it would write
  // an empty one into every document anybody re-shares.
  for (const k of ["stack_assumptions", "tags"]) if (meta[k] === undefined) meta[k] = [];
  // Both ends of this module: what it reads and what it writes are in one style, so a guide
  // written before there was a rule comes back normalised and goes out normalised.
  meta.tags = tagList(meta.tags);
  return meta;
}

/**
 * Frontmatter fields holding more than this format can: a nested map, a block scalar (`|`), a
 * sequence under a field that is not a list. `parseFrontmatter` keeps only the key's own line, so
 * each of these would come back as `""` with its content gone — a design.md's `colors:` block did
 * exactly that, and a publish would have stored the document with every token wiped. The format
 * does not grow to hold them (strings and string lists only); the publish refuses them by name
 * instead, so nothing is lost without its author being told. Mirrors `unheldFields` in
 * apps/api/src/guide.ts, which is the refusal every client meets.
 */
export function unheldFields(markdown) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!m) return [];
  const out = new Set();
  let key = null;
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (listKey && /^\s*-\s*/.test(line)) continue;
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      listKey = kv[2].trim() === "" && LIST_FIELDS.has(key) ? key : null;
      continue;
    }
    // Anything else is a line the parser skips: an indented child, or an item under a field
    // that is not a list. It belongs to the key above it, and that is the key to name.
    out.add(key ?? line.trim());
  }
  return [...out];
}

/**
 * Fields this format no longer has, refused by name rather than carried. `kind` split work into
 * task, bug and transfer, each with its own sections, and every rule that turned on it is gone
 * (docs/WORK.md): a document still saying it is one of them is an old export or an old client, and
 * carrying the line would put back an answer nothing reads. `retiredFields` in apps/api/src/guide.ts
 * is the refusal every client meets.
 */
export const RETIRED = ["kind"];

function quote(v) {
  const s = String(v ?? "");
  // Quote anything YAML would misread: colons, leading symbols, or empty.
  return /[:#[\]{}"'|>&*!%@`,]|^\s|\s$|^$/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

const META_ORDER = [
  "id",
  "title",
  // Right under the title: it is what a person reads first about it, so it is what the document
  // opens with.
  "summary",
  "created",
  "author",
  "source_context",
  // The repo the work is for. Optional — work without one is not tied to a repo.
  "target_context",
  // The work this waits for, by id: it is not handed to an agent until each is Done. See
  // migrations/0022_blocks.sql.
  "blocked_by",
  // Where it came from, in the two senses work has one: `source_context` is the repo and branch it
  // was written in, `parent` is the work it came *out of*.
  "parent",
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
    const v = key === "tags" ? tagList(meta[key]) : meta[key];
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

/**
 * Image targets no reader will ever load. Mirrors `unreachableImages` in apps/api/src/guide.ts,
 * which is the authority and refuses the publish; this lets a local share fail before the network.
 *
 * Only a foreign scheme counts — `attachment://`, `blob:`, `file:`, `data:`. `https:` is left alone
 * because embedding an image you host is legitimate, and a relative path is left alone because it
 * has always been accepted.
 */
export function unreachableImages(markdown) {
  const bad = [...String(markdown).matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)/g)]
    .map((m) => m[1].trim())
    .filter((target) => {
      const scheme = /^([a-z][a-z0-9+.\-]*):/i.exec(target);
      return Boolean(scheme) && !/^https?$/i.test(scheme[1]);
    });
  return [...new Set(bad)];
}

/** Problems that make a guide unfit to publish. Empty array means it is fine. */
export function validate({ meta, body }) {
  const errors = [];
  if (!meta.title) errors.push("frontmatter needs a title");
  if (meta.id && !ID_RE.test(meta.id)) errors.push(`id "${meta.id}" is not a valid passalong id`);
  // A parent is optional, and a self-parent is always a mistake worth refusing.
  //
  // A malformed one is not refused, though, and that is deliberate. `parent:` is a field name this
  // format did not reserve until now, so a guide written months ago may already carry one meaning
  // something else entirely — and a guide shared then has to still re-share today. Rejecting the
  // value would make that document unpublishable by its own author, which is the failure the
  // STATUSES comment above describes. The server drops a parent it cannot resolve, so the worst
  // case is lineage that silently does not apply rather than work nobody can hand on.
  if (meta.parent && meta.id && meta.parent === meta.id)
    errors.push("work cannot come out of itself");
  if (meta.status && !STATUSES.includes(meta.status)) {
    errors.push(`status must be one of ${STATUSES.join(", ")}`);
  }
  const said = String(meta.summary ?? "").trim();
  if (!said)
    errors.push(
      "say it to a person: add `summary:` — one or two plain sentences, no ids or paths, saying what " +
        `this is and whether anybody needs to act (${SUMMARY_MAX} characters at most)`,
    );
  else if (said.length > SUMMARY_MAX)
    errors.push(`summary is ${said.length} characters; ${SUMMARY_MAX} at most`);
  for (const field of RETIRED)
    if (meta[field] !== undefined)
      errors.push(`\`${field}:\` is gone — work has no kinds; remove the line`);
  // An agent that has a file id but never called attach_screenshot writes the id as if it were a
  // link. It publishes, and stores a guide whose screenshot was never uploaded anywhere.
  for (const target of unreachableImages(body))
    errors.push(
      `${target} is not a URL a reader can load — attach the image first and use the URL it returns`,
    );
  return errors;
}

/** Fill in what a fresh guide needs before it can be stored. Returns a new object. */
export function stamp(guide, defaults = {}) {
  const meta = { ...guide.meta };
  if (!meta.id) meta.id = newId();
  if (!meta.created) meta.created = new Date().toISOString();
  // Ready unless whoever wrote it said draft: a guide sent to someone is meant to reach them, and
  // drafts were where addressed work sat forgotten (every draft in production on 2026-10-15).
  if (!meta.status) meta.status = "published";
  for (const [k, v] of Object.entries(defaults))
    if (meta[k] === undefined || meta[k] === "") meta[k] = v;
  return { meta, body: guide.body };
}

// ---- reading a guide in parts, and how big one may be -----------------------------------------
// Mirrors apps/api/src/sections.ts — apps/api/test/sections.test.mjs holds the two to the same
// answers. Most of what is stored is a few very large guides (six of 123 held 72% of the text), and
// an agent that wants only the Acceptance of a long task should not read the rest first.

/** Over this a guide is large: its readers are offered the outline first, and its author a warning. */
export const GUIDE_WARN = 20_000;
/** Over this a new guide is refused by the server. A guide stored before it existed may keep its size. */
export const GUIDE_MAX = 60_000;

/** Where each heading starts, outside the frontmatter and outside code fences. */
function headingLines(markdown) {
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown);
  const bodyStart = fm ? fm[0].length : 0;
  const lines = [];
  let fence = "";
  let at = bodyStart;
  for (const raw of markdown.slice(bodyStart).split("\n")) {
    const mark = /^\s*(```|~~~)/.exec(raw)?.[1];
    if (mark) fence = fence ? (fence === mark ? "" : fence) : mark;
    const m = !fence && !mark ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw) : null;
    if (m) lines.push({ heading: m[2].trim(), level: m[1].length, start: at });
    at += raw.length + 1;
  }
  return lines;
}

/** The end of the section that begins at lines[i]: the next heading at its level or above. */
function sectionEnd(lines, i, total) {
  for (let j = i + 1; j < lines.length; j++)
    if (lines[j].level <= lines[i].level) return lines[j].start;
  return total;
}

/** Every heading, with the characters in its section (nested ones included). */
export function outline(markdown) {
  const lines = headingLines(markdown);
  return lines.map((l, i) => ({
    heading: l.heading,
    level: l.level,
    chars: sectionEnd(lines, i, markdown.length) - l.start,
  }));
}

/** One section by its heading — exact, then by its start, then by what it contains. */
export function section(markdown, name) {
  const lines = headingLines(markdown);
  const want = String(name ?? "")
    .trim()
    .toLowerCase();
  if (!want) return null;
  const at = (test) => lines.findIndex((l) => test(l.heading.toLowerCase()));
  const i = [
    at((h) => h === want),
    at((h) => h.startsWith(want)),
    at((h) => h.includes(want)),
  ].find((n) => n >= 0);
  if (i === undefined) return null;
  return {
    heading: lines[i].heading,
    text: markdown.slice(lines[i].start, sectionEnd(lines, i, markdown.length)).trimEnd(),
  };
}

/** What a guide's author is told when it is on the large side. */
export function sizeWarning(chars) {
  return chars > GUIDE_WARN
    ? `this guide is ${chars.toLocaleString("en")} characters, and over ${GUIDE_WARN.toLocaleString("en")} ` +
        "it is read by outline first. Put logs, dumps and long output in a file (attach_file) and " +
        "link it; keep the guide to what the next agent has to act on."
    : null;
}

/**
 * What an agent is shown instead of a large guide: who it is, what it is, and where its parts are.
 * `path` is where the whole of it was written, for a search rather than a read.
 */
export function outlineText(markdown, { id = "", path = "" } = {}) {
  const { meta } = parse(markdown);
  const rows = outline(markdown)
    .filter((h) => h.level <= 3)
    .map(
      (h) => `${"  ".repeat(h.level - 1)}- ${h.heading} (${h.chars.toLocaleString("en")} chars)`,
    );
  return [
    `${meta.title || id} — ${markdown.length.toLocaleString("en")} characters`,
    meta.summary ? `Summary: ${meta.summary}` : "",
    "",
    "Sections:",
    ...rows,
    "",
    `Read one with get_guide ref=${id} section="<heading>", or the whole thing with full=true.` +
      (path ? ` The full text is also on disk at ${path}, if you only need to search it.` : ""),
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}
