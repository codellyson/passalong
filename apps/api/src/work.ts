// Just enough of the work format for the server: read the frontmatter fields it indexes, and
// patch a field in place without disturbing the rest of the document. The full format lives in
// packages/passalong/src/work.js; this mirrors its parsing rules for strings and string lists.

/**
 * Work is Draft, Ready or Done. Done is the shelf — off the board, out of the free tier's count,
 * reversible — and `outcome` says how it got there.
 */
export const STATUSES = ["draft", "ready", "done"] as const;
export type Status = (typeof STATUSES)[number];

/**
 * New work is Ready unless whoever wrote it said `status: draft`. Draft-first
 * was tried and addressed work sat forgotten in it: on 2026-10-15 every draft in production was a
 * task sent to somebody, untouched for over a day. Draft is for what a person should read first —
 * a plan, or anything an agent is unsure of — and anyone can move work back to it.
 * What a new work cannot be is archived, and an edit cannot change status: that is the person's
 * separate action, as it always was.
 */
export function publishProblem(status: string, previousStatus?: string): string {
  if (!previousStatus && status === "done")
    return "New work can't start archived. Create it Ready, or with `status: draft` for the person to read first.";
  if (previousStatus && status !== previousStatus)
    return "Changing the status of work is its own action. Keep its current status in the document, then use Ready, Move to Draft or Archive.";
  return "";
}

/**
 * Archived work comes back to Draft, never straight to Ready. Done covers finished as well
 * as shelved, so putting one back as Ready handed finished work to whoever takes it next. From
 * Draft a person decides, with Ready, whether it is wanted.
 */
export function unarchiveProblem(from: string, to: string): string {
  if (from === "done" && to === "ready")
    return "Archived work comes back to Draft, not straight to Ready: set it to draft, then mark it Ready if it is still wanted.";
  return "";
}

/**
 * The longest `summary:` work may carry. Mirrors SUMMARY_MAX in packages/passalong/src/work.js,
 * which says why work has one: it is what a person reads, and the document is the agent's form.
 */
export const SUMMARY_MAX = 400;

export interface Meta {
  id?: string;
  title?: string;
  /** What this says to a person, in a sentence or two. Required of all new work. */
  summary?: string;
  status?: string;
  source_context?: string;
  url?: string;
  /**
   * The work this came out of — see migrations/0015_lineage.sql: a customer request, a bigger
   * piece of work, or the set a group of bugs was filed under (migration 0061).
   */
  parent?: string;
  /** The repo it is for. See migrations/0021_claims.sql. */
  target_context?: string;
  /** Ids of the work it waits for. See migrations/0022_blocks.sql. */
  blocked_by?: string[];
  tags: string[];
  stack_assumptions: string[];
  [key: string]: string | string[] | undefined;
}

/**
 * One tag, in the one style tags are written in: lowercase, words joined by a hyphen.
 *
 * Nothing used to normalise them, so `custom-fields` and `additional_information` sat on the same
 * card and the same idea could exist twice under two spellings. A tag is a controlled vocabulary
 * and not prose — the point of it is that two people who mean the same thing write the same
 * string — so the reader picks the style rather than the typist.
 *
 * Hyphen because that is what nearly every tag already used, and because a tag reads as one word
 * with a `#` in front of it, which is how the rest of the world writes them.
 */
export function tag(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 32)
    .replace(/^-+|-+$/g, "");
}

/** A piece of work's tags: normalised, emptied of blanks, and deduped once two spellings become one. */
export function tagList(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  return [...new Set(list.map(tag).filter(Boolean))];
}

const LIST_FIELDS = new Set(["tags", "stack_assumptions", "blocked_by"]);

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
 * ends. Mirrors `items()` in packages/passalong/src/work.js.
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

/**
 * The screenshots a document points at, by id.
 *
 * The document is the source of truth for which evidence belongs to which work, the same way it
 * already is for the title and the tags. An upload happens before the work it will belong to
 * exists — a tester drops a screenshot into a form they have not submitted — so the link cannot be
 * made at upload time, and asking each client to report its own attachments would mean the CLI,
 * the hub and anything else all had to remember to. Reading it back out of the markdown means
 * whatever wrote the document gets this for free.
 */
export function shotIds(markdown: string): string[] {
  const found = markdown.matchAll(/\/v1\/shots\/([a-z0-9]{6,16})\b/g);
  return [...new Set([...found].map((m) => m[1] as string))];
}

/**
 * Image targets in a document that no reader will ever load.
 *
 * A piece of work travels as markdown to whoever holds its link, so an image reference is only worth
 * anything if it resolves for someone who is not the author. A client-internal handle does not:
 * ChatGPT filed a bug with `![shot](attachment://file_0000…)`, which is its own file id wrapped in
 * a scheme it invented, and the publish succeeded because nothing looked. The work is stored with
 * a dead image and the screenshot it names was never uploaded at all.
 *
 * Told, not inferred — the tool descriptions and the server instructions both say to attach with
 * `attach_screenshot` first, and an agent composing markdown still reached for a URI. So this is
 * the check at the one place every surface goes through, which is where the product's other
 * load-bearing rules live.
 *
 * Only a foreign *scheme* counts. `https:` is left alone even when it points somewhere else
 * entirely, because embedding an image you host is legitimate and this is not a link checker. A
 * relative path is left alone too: it is also broken in a document that travels, but it has
 * always been accepted and breaking it here would refuse work that publish today.
 */
export function unreachableImages(markdown: string): string[] {
  const found = markdown.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)/g);
  const bad = [...found]
    .map((m) => (m[1] as string).trim())
    .filter((target) => {
      const scheme = /^([a-z][a-z0-9+.\-]*):/i.exec(target);
      return Boolean(scheme) && !/^https?$/i.test(scheme?.[1] || "");
    });
  return [...new Set(bad)];
}

export function split(markdown: string): { front: string; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  // Both groups are mandatory in the pattern, so a match means both are strings. The assertions
  // are for `noUncheckedIndexedAccess`, which cannot know that; they compile away.
  return m ? { front: m[1] as string, body: m[2] as string } : null;
}

export function parseMeta(markdown: string): Meta {
  // Seeded here so a document with no frontmatter, or an unterminated one, returns the same shape
  // work.js's parse() does on that path. The corpus caught the pair disagreeing about exactly that.
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
  // Tags are normalised as they are read, not only as they are written. Work published before
  // there was a rule are still stored as they were typed, and re-spelling them in the document is
  // something only their author can do — every surface that reads one shows one style meanwhile.
  meta.tags = tagList(meta.tags);
  return meta;
}

/**
 * Frontmatter fields holding more than this format can: a nested map, a block scalar (`|`), a
 * sequence under a field that is not a list. `parseMeta` keeps only the key's own line, so each of
 * these would be stored as `""` with its content gone — a design.md's `colors:` block did exactly
 * that. The format does not grow to hold them; the publish refuses them by name, so nothing is lost
 * without its author being told. Mirrors `unheldFields` in packages/passalong/src/work.js.
 */
export function unheldFields(markdown: string): string[] {
  const parts = split(markdown);
  if (!parts) return [];
  const out = new Set<string>();
  let key: string | null = null;
  let listKey: string | null = null;
  for (const line of parts.front.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (listKey && /^\s*-\s*/.test(line)) continue;
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1] as string;
      listKey = (kv[2] as string).trim() === "" && LIST_FIELDS.has(key) ? key : null;
      continue;
    }
    // Anything else is a line the parser skips: an indented child, or an item under a field that
    // is not a list. It belongs to the key above it, and that is the key to name.
    out.add(key ?? line.trim());
  }
  return [...out];
}

/**
 * Fields this format no longer has, refused by name. `kind` split work into kinds,
 * each with its own sections, and every rule that turned on it is gone (docs/WORK.md); migration
 * 0061 stripped it from every stored document, so one arriving now is an old export or an old
 * client, and storing it would put back an answer nothing reads. Mirrors `RETIRED` in
 * packages/passalong/src/work.js.
 */
const RETIRED = ["kind"];

export function retiredFields(markdown: string): string[] {
  const parts = split(markdown);
  if (!parts) return [];
  return RETIRED.filter((k) => new RegExp(`^${k}:`, "m").test(parts.front));
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

/** Remove one scalar frontmatter field. Absent, the document comes back untouched. */
export function dropField(markdown: string, key: string): string {
  const parts = split(markdown);
  const re = new RegExp(`^${key}:.*\\n?`, "m");
  if (!parts || !re.test(parts.front)) return markdown;
  return `---\n${parts.front.replace(re, "").replace(/\n$/, "")}\n---\n${parts.body}`;
}

/**
 * Set one list frontmatter field, as a flow sequence.
 *
 * Anything the key was carrying goes, including a block sequence written under it — leaving those
 * `- item` lines behind would orphan them under whatever key came next. Unchanged input comes back
 * untouched, so publishing a document that is already in the right shape does not rewrite it.
 */
export function setList(markdown: string, key: string, values: string[]): string {
  const parts = split(markdown);
  const line = values.length ? `${key}: [${values.map(quote).join(", ")}]` : `${key}: []`;
  if (!parts) return markdown;

  const out: string[] = [];
  let dropping = false;
  let found = false;
  for (const l of parts.front.split(/\r?\n/)) {
    if (dropping) {
      if (/^\s*-\s/.test(l)) continue;
      dropping = false;
    }
    if (new RegExp(`^${key}:`).test(l)) {
      out.push(line);
      found = true;
      dropping = true;
      continue;
    }
    out.push(l);
  }
  if (!found) out.push(line);

  const front = out.join("\n");
  return front === parts.front ? markdown : `---\n${front}\n---\n${parts.body}`;
}

/** Everything after the frontmatter, for rendering. */
export function body(markdown: string): string {
  return split(markdown)?.body ?? markdown;
}

/**
 * How much of the work this came from `GET /v1/work/:id/parent?markdown=1` hands over. It rides in
 * the same context window as the work being done, so a long parent must not crowd it out.
 */
export const FOLLOW_UP_BYTES = 32 * 1024;

/**
 * A parent's markdown, cut to `FOLLOW_UP_BYTES` with a marker saying so. Bytes, not characters,
 * because the budget is what a response and a context window hold; a cut that lands inside a
 * multi-byte character drops that character rather than emitting half of it.
 */
export function clipFollowUp(id: string, markdown: string, max = FOLLOW_UP_BYTES): string {
  const bytes = new TextEncoder().encode(markdown);
  if (bytes.length <= max) return markdown;
  // Not fatal (the default), so a torn final character decodes as U+FFFD and is dropped.
  const head = new TextDecoder().decode(bytes.slice(0, max)).replace(/\uFFFD$/, "");
  return (
    `${head}\n\n[passalong: truncated at ${Math.round(max / 1024)} KB of ` +
    `${Math.round(bytes.length / 1024)} KB — find_work ${id} for the whole of it]\n`
  );
}

/**
 * Why a piece of work's `summary:` is refused, or null when it is fine.
 *
 * `legacy` is a piece of work stored before summaries existed, written again by a client that has not heard
 * of them: it is let through as it came, because refusing every old CLI's re-share of work already
 * in flight would make the rule a wall rather than a request. A piece of work that has never had one is
 * not that — a new work must say it, whatever client wrote it.
 */
export function summaryProblem(summary: unknown, legacy = false): string | null {
  const said = String(summary ?? "").trim();
  if (!said)
    return legacy
      ? null
      : "say it to a person: add `summary:` to the frontmatter — one or two plain sentences, no ids " +
          `or paths, saying what this is and whether anybody needs to act (${SUMMARY_MAX} characters ` +
          "at most). The document is for agents; this is what a person reads first.";
  if (said.length > SUMMARY_MAX)
    return `summary is ${said.length} characters; ${SUMMARY_MAX} at most.`;
  return null;
}
