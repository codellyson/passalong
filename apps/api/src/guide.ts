// Just enough of the guide format for the server: read the frontmatter fields it indexes, and
// patch a field in place without disturbing the rest of the document. The full format lives in
// packages/passalong/src/guide.js; this mirrors its parsing rules for strings and string lists.

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
export const STATUSES = ["draft", "published", "consumed", "promoted"] as const;
export type Status = (typeof STATUSES)[number];

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
export const SETTABLE = ["draft", "published", "consumed"] as const;
export type Settable = (typeof SETTABLE)[number];

/**
 * The longest `summary:` a guide may carry. Mirrors SUMMARY_MAX in packages/passalong/src/guide.js,
 * which says why a guide has one: it is what a person reads, and the document is the agent's form.
 */
export const SUMMARY_MAX = 400;

export interface Meta {
  id?: string;
  title?: string;
  /** What this says to a person, in a sentence or two. Required of every new guide. */
  summary?: string;
  status?: string;
  source_context?: string;
  url?: string;
  /**
   * What this guide is for: "bug", "task" or "transfer". The receiving agent behaves differently
   * for each — see KINDS in packages/passalong/src/guide.js.
   *
   * Not optional. `parseMeta` seeds it on every path, including the early return for a document
   * with no frontmatter, so a Meta that came from a document always says what it is. The type is
   * where that guarantee is kept: leaving it optional invited every caller to answer `undefined`
   * for itself, which is the whole of what went wrong.
   */
  kind: string;
  /**
   * The guide this one came out of — see migrations/0015_lineage.sql. A chain, not a set: the
   * parent is an ordinary guide somebody pulled, and this is what they learned doing it.
   */
  parent?: string;
  /** Tasks only: the repo it is for. See migrations/0021_claims.sql. */
  target_context?: string;
  /** Tasks only: ids of the tasks it waits for. See migrations/0022_blocks.sql. */
  blocked_by?: string[];
  /** The report this guide is one issue of — see migrations/0006_reports.sql. */
  report?: string;
  /** Where the issue is, inside its report. Free text on purpose; see `AREAS`. */
  area?: string;
  severity?: string;
  tags: string[];
  stack_assumptions: string[];
  [key: string]: string | string[] | undefined;
}

/**
 * The product areas a bug report offers, and the order it offers them in.
 *
 * Offered, not enforced. The server stores whatever slug an issue carries, the same way it
 * *accepts* statuses it no longer produces: a team that ships a sixth surface should be able to
 * file against it that afternoon, not after a deploy. This list is what the browser puts in a
 * menu, and what turns a slug back into words.
 */
export const AREAS = [
  { slug: "web", label: "Web App", code: "WEB" },
  { slug: "mobile", label: "Mobile App", code: "MOB" },
  { slug: "storefront", label: "Storefront Editor", code: "SFE" },
  { slug: "landing", label: "Landing Page", code: "LND" },
  { slug: "auth", label: "Auth Page", code: "AUTH" },
] as const;

/**
 * How badly it is broken. Four, because a fifth is always an argument about the fourth.
 *
 * This is the reporter's judgement and it stays theirs — unlike a verdict, which belongs to
 * whoever tried the fix. Same accept-anything rule as `AREAS`.
 */
export const SEVERITIES = [
  { slug: "s1", label: "Blocker", note: "nobody can get past it" },
  { slug: "s2", label: "Major", note: "a real task cannot be finished" },
  { slug: "s3", label: "Minor", note: "wrong, with a way around it" },
  { slug: "s4", label: "Cosmetic", note: "it looks wrong" },
] as const;

/** A slug we are willing to store: short, lowercase, no punctuation to smuggle. */
export function slug(raw: unknown, max = 32): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, max);
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

/** A guide's tags: normalised, emptied of blanks, and deduped once two spellings become one. */
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

/**
 * The screenshots a document points at, by id.
 *
 * The document is the source of truth for which evidence belongs to which guide, the same way it
 * already is for the title and the tags. An upload happens before the guide it will belong to
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
 * A guide travels as markdown to whoever holds its link, so an image reference is only worth
 * anything if it resolves for someone who is not the author. A client-internal handle does not:
 * ChatGPT filed a bug with `![shot](attachment://file_0000…)`, which is its own file id wrapped in
 * a scheme it invented, and the publish succeeded because nothing looked. The guide is stored with
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
 * always been accepted and breaking it here would refuse guides that publish today.
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
  // Seeded here and not only at the end: a document with no frontmatter, or an unterminated one,
  // returns early, and guide.js's parse() seeds it on that path too. The corpus caught the pair
  // disagreeing about exactly that.
  const meta: Meta = { tags: [], stack_assumptions: [], kind: "" };
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
  // Tags are normalised as they are read, not only as they are written. Guides published before
  // there was a rule are still stored as they were typed, and re-spelling them in the document is
  // something only their author can do — every surface that reads one shows one style meanwhile.
  meta.tags = tagList(meta.tags);
  // Absent is absent. It is NOT a transfer guide.
  //
  // This line, and the sentence publish_guide tells every agent — "kind: task (the default)" —
  // disagreed for thirteen days. An agent that left `kind:` off, believing what it had been told,
  // got a transfer guide. 162 of 200 guides in real use are labelled transfer; their titles are
  // tasks and bug reports. Everything downstream followed from that: a transfer has no states, so
  // nothing could show as in progress; it demands Problem and Steps, so a two-line correction was
  // padded to six sections; and there is nowhere to report into one, so agents published a second
  // guide to carry what they had found.
  //
  // So it stays empty and validate() refuses it by name. The back-compat this default protected
  // is a guide written before kinds existed being re-shared; that guide is re-shared once with an
  // explicit `kind: transfer`, which is a sentence its author can write, unlike thirteen days of
  // mislabelled work nobody could see.
  meta.kind = String(meta.kind ?? "").trim();
  return meta;
}

/**
 * Frontmatter fields holding more than this format can: a nested map, a block scalar (`|`), a
 * sequence under a field that is not a list. `parseMeta` keeps only the key's own line, so each of
 * these would be stored as `""` with its content gone — a design.md's `colors:` block did exactly
 * that. The format does not grow to hold them; the publish refuses them by name, so nothing is lost
 * without its author being told. Mirrors `unheldFields` in packages/passalong/src/guide.js.
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

/**
 * How many follow-ups `GET /v1/guides/:id/children?markdown=1` hands over with their content, and
 * how much of any one. A follow-up is context an agent reads before acting on the original, so it
 * rides in the same context window: a guide that collected fifty long follow-ups must not crowd
 * out the guide itself. Past the cap a reader still has the ids to pull the rest one at a time.
 */
export const FOLLOW_UPS_MAX = 20;
export const FOLLOW_UP_BYTES = 32 * 1024;

/**
 * A follow-up's markdown, cut to `FOLLOW_UP_BYTES` with a marker saying so. Bytes, not characters,
 * because the budget is what a response and a context window hold; a cut that lands inside a
 * multi-byte character drops that character rather than emitting half of it.
 */
export function clipFollowUp(id: string, markdown: string, max = FOLLOW_UP_BYTES): string {
  const bytes = new TextEncoder().encode(markdown);
  if (bytes.length <= max) return markdown;
  // Not fatal (the default), so a torn final character decodes as U+FFFD and is dropped.
  const head = new TextDecoder().decode(bytes.slice(0, max)).replace(/\uFFFD$/, "");
  return (
    `${head}\n\n[passalong: follow-up truncated at ${Math.round(max / 1024)} KB of ` +
    `${Math.round(bytes.length / 1024)} KB — pull ${id} for the whole guide]\n`
  );
}

/**
 * Why a guide's `summary:` is refused, or null when it is fine.
 *
 * `legacy` is a guide stored before summaries existed, written again by a client that has not heard
 * of them: it is let through as it came, because refusing every old CLI's re-share of work already
 * in flight would make the rule a wall rather than a request. A guide that has never had one is
 * not that — a new guide must say it, whatever client wrote it.
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
