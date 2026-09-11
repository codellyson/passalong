// The transfer guide format: plain markdown with a small YAML-ish frontmatter block.
//
// No proprietary format and no YAML library. The frontmatter only ever holds strings and
// lists of strings, so a deliberately tiny parser covers it and stays readable when hand-edited.
import { randomBytes } from "node:crypto";

/**
 * A guide is a draft or it is published, and `consumed` is the author's shelf — off the board, out
 * of the free tier's count, reversible. `promoted` is the one true legacy: an author lifecycle laid
 * over a transfer that already reports itself, since a pull count says how travelled a guide is
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
 * What a guide is for. The receiving agent behaves completely differently depending on the
 * answer, so it is a field rather than something inferred from the body.
 *
 *   transfer  work that is finished here and should be repeated there — follow the Steps
 *   bug       something broken there — do NOT follow anything; fix it
 *
 * A guide with no `kind` is a transfer guide: every guide written before this existed is one,
 * and defaulting the other way would turn them all into bug reports.
 */
export const KINDS = ["transfer", "bug"];

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

/**
 * The product areas a bug report offers, mirrored in apps/api/src/guide.ts the same way this
 * file's parsing rules are.
 *
 * Offered, not enforced: nothing rejects an area that is not on this list. A team that ships a
 * sixth surface should be able to file against it that afternoon rather than after a release, so
 * this is what a menu shows and what turns a slug back into words — not a gate.
 */
export const AREAS = [
  { slug: "web", label: "Web App" },
  { slug: "mobile", label: "Mobile App" },
  { slug: "storefront", label: "Storefront Editor" },
  { slug: "landing", label: "Landing Page" },
  { slug: "auth", label: "Auth Page" },
];

/** How badly it is broken. Same accept-anything rule as AREAS. */
export const SEVERITIES = [
  { slug: "s1", label: "Blocker" },
  { slug: "s2", label: "Major" },
  { slug: "s3", label: "Minor" },
  { slug: "s4", label: "Cosmetic" },
];

/**
 * A bug report's sections. The repro is under `Reproduce`, never `Steps`.
 *
 * That distinction is the whole reason `kind` exists. `Steps` is an instruction to execute —
 * "follow its Steps" is what the MCP server tells every agent that pulls a guide — and steps that
 * reproduce a defect are the one list that must never be run as a remedy. An agent handed a bug
 * with its repro under `Steps` will faithfully reproduce the bug, check the Verification, find it
 * false because the bug is real, and report that the guide does not work.
 */
export const BUG_SECTIONS = ["Problem", "Reproduce", "Verification", "Gotchas"];

/**
 * One line at the top of every bug, saying what the document is.
 *
 * `kind: bug` in the frontmatter is the machine-readable answer and `Reproduce` is a heading no
 * one executes by mistake, but neither is a sentence. This is, and it is inside the document, so
 * it reaches a reader that fetched a share link over plain HTTP and has never heard of Passalong.
 */
export const BUG_LEAD =
  "> **Bug report.** The steps under Reproduce show the problem \u2014 they are not a fix to " +
  "apply. Fix what Problem describes, then check Verification.";

/** The sections a guide of this kind presents, in order. */
export function sectionsFor(kind) {
  return kind === "bug" ? BUG_SECTIONS : SECTIONS;
}

/** The sections it cannot be published without. */
const REQUIRED = { transfer: ["Problem", "Steps"], bug: ["Problem", "Reproduce"] };

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
  for (const k of LIST_FIELDS) if (meta[k] === undefined) meta[k] = [];
  // Both ends of this module: what it reads and what it writes are in one style, so a guide
  // written before there was a rule comes back normalised and goes out normalised.
  meta.tags = tagList(meta.tags);
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
  "kind",
  "created",
  "author",
  "source_context",
  // Where it came from, in the two senses a guide has one: `source_context` is the repo and branch
  // it was written in, `parent` is the guide it was written *out of*.
  "parent",
  "status",
  "team",
  "to",
  "stack_assumptions",
  "tags",
  // Bug reports only. `report` is the parent a set of issues was filed under; the other two are
  // where it is and how badly it is broken.
  "report",
  "area",
  "severity",
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
  // A parent is optional, and a self-parent is always a mistake worth refusing.
  //
  // A malformed one is not refused, though, and that is deliberate. `parent:` is a field name this
  // format did not reserve until now, so a guide written months ago may already carry one meaning
  // something else entirely — and a guide shared then has to still re-share today. Rejecting the
  // value would make that document unpublishable by its own author, which is the failure the
  // STATUSES comment above describes. The server drops a parent it cannot resolve, so the worst
  // case is lineage that silently does not apply rather than work nobody can hand on.
  if (meta.parent && meta.id && meta.parent === meta.id)
    errors.push("a guide cannot follow itself");
  if (meta.status && !STATUSES.includes(meta.status)) {
    errors.push(`status must be one of ${STATUSES.join(", ")}`);
  }
  const kind = meta.kind || "transfer";
  if (!KINDS.includes(kind)) errors.push(`kind must be one of ${KINDS.join(", ")}`);
  const have = sections(body);
  for (const s of REQUIRED[kind] || REQUIRED.transfer) {
    if (!have[s]) errors.push(`missing "## ${s}" section`);
  }
  // A bug whose repro sits under `Steps` is the failure mode `kind` exists to prevent, and it is
  // worth catching at publish rather than letting an agent discover it by reproducing the bug.
  if (kind === "bug" && have.Steps) {
    errors.push('a bug uses "## Reproduce", not "## Steps" — an agent executes Steps');
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

/**
 * One bug, as the guide it becomes.
 *
 * This is the filing shape: fields in, a valid document out, so nothing that files a bug has to
 * remember which heading the repro goes under. The hub's form assembles its own because it has
 * more to say — a device string, screenshots, and a rich text field it converts — but the section
 * names and the order are these, and `validate()` is the thing both answer to.
 */
export function bugGuide({
  title = "",
  problem = "",
  reproduce = "",
  verification = "",
  gotchas = "",
  severity = "s3",
  area = "",
  report = "",
  environment = "",
  status = "published",
} = {}) {
  const body = [
    // Written into the document, not added by whatever served it.
    //
    // get_guide says this in front of the markdown, but that only reaches an MCP client. A share
    // link is plain markdown any agent can fetch over HTTP, and the route that serves it cannot
    // decorate the response: `api.byLink` pulls guides *through* that route and re-serialises what
    // it gets, so anything added there would be written to disk and published back on the next
    // share. A line in the body survives that round trip unchanged and reaches every reader.
    BUG_LEAD,
    "",
    "## Problem",
    problem.trim() || "_No description given._",
    "",
    "## Reproduce",
    reproduce.trim() || "_Not recorded — the description above is what there is._",
  ];
  // Both are optional and both are worse than absent when empty: a Verification heading with
  // nothing under it says nobody knows what fixed looks like, on the section a fixer reads first.
  if (verification.trim()) body.push("", "## Verification", verification.trim());
  if (gotchas.trim()) body.push("", "## Gotchas", gotchas.trim());

  const meta = {
    title,
    kind: "bug",
    status,
    tags: ["bug", environment, area].filter(Boolean),
  };
  if (report) meta.report = report;
  if (area) meta.area = area;
  if (severity) meta.severity = severity;
  if (environment) meta.source_context = environment;
  return serialize({ meta, body: body.join("\n") });
}

/** A draft with the section skeleton. Placeholders are HTML comments so they vanish when rendered. */
export function template(meta = {}) {
  if (meta.kind === "bug") return bugTemplate(meta);
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

/**
 * One bug, as a guide. Four sections and no `Steps` anywhere in it.
 *
 * `Verification` carries its usual meaning and does its usual job: it is what the person who
 * fixes this runs to show they did, and it is what they are answering when they give a verdict.
 * For a bug that is simply the behaviour that should have happened.
 */
function bugTemplate(meta = {}) {
  const body = [
    "## Problem",
    "<!-- passalong: What is broken, and what it stops someone doing. -->",
    "",
    "## Reproduce",
    "<!-- passalong: How to see it. These steps produce the bug — they are not a fix to apply. -->",
    "",
    "## Verification",
    "<!-- passalong: What should happen instead, as something the fixer can check. -->",
    "",
    "## Gotchas",
    "<!-- passalong: Anything already ruled out, or that made it hard to pin down. -->",
  ].join("\n");
  return serialize({
    meta: {
      title: "",
      kind: "bug",
      author: "",
      source_context: "",
      status: "draft",
      severity: "s3",
      stack_assumptions: [],
      tags: ["bug"],
      ...meta,
    },
    body,
  });
}

/** Strip the template comments so an untouched section reads as empty rather than as a prompt. */
export function stripPlaceholders(body) {
  return body.replace(/^<!-- passalong:.*?-->\n?/gm, "").trim();
}
