// The JSON viewer (/json). A parser of its own rather than JSON.parse, because a viewer needs what
// JSON.parse throws away: where the text went wrong in every browser, numbers and key order as they
// were written, repeated keys, and a reading of what is nearly JSON that says what it had to change.
// Imports nothing, so a test can run it.

export class JsonNumber {
  source: string;
  constructor(source: string) {
    this.source = source;
  }
}

/** Entries, not a plain object: those reorder number-like keys and treat `__proto__` specially. */
export class JsonObject {
  entries: [string, Json][] = [];
}

export type Json = string | boolean | null | JsonNumber | JsonObject | Json[];

/** One kind of change or doubt, with how often it came up and where it first did. */
export interface JsonNote {
  message: string;
  at: number;
  count: number;
}

export type Parsed =
  | {
      ok: true;
      value: Json;
      repairs: JsonNote[];
      warnings: JsonNote[];
      values: number;
      depth: number;
    }
  | { ok: false; message: string; at: number };

class Failure {
  message: string;
  at: number;
  constructor(message: string, at: number) {
    this.message = message;
    this.at = at;
  }
}

const MAX_DEPTH = 2000;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const WORD = /-?[A-Za-z_$][\w$]*/y;
const BARE_KEY = /[\p{L}\p{N}_$-]+/uy;
const VALUE_START = /["'“”‘’„{[\-\d\p{L}_$]/u;
const KEY_START = /["'“”‘’„\p{L}\p{N}_$-]/u;
const CLOSING: Record<string, string> = {
  '"': '"',
  "'": "'",
  "“": "”“",
  "”": "”“",
  "„": "”“",
  "‘": "’‘",
  "’": "’‘",
};
const ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};
const LITERALS = new Map<string, Json>([
  ["true", true],
  ["false", false],
  ["null", null],
  ["none", null],
  ["nil", null],
  ["undefined", null],
  ["nan", null],
  ["infinity", null],
  ["-infinity", null],
]);

const found = (c: string | undefined) =>
  c === undefined ? "the end of the text" : JSON.stringify(c);
const isBox = (v: Json) => Array.isArray(v) || v instanceof JsonObject;

export function placeOf(text: string, at: number) {
  const before = text.slice(0, at);
  return { line: before.split("\n").length, column: at - before.lastIndexOf("\n") };
}

/** The line around a place, cut to fit, with a caret under the place. */
export function frameAt(text: string, at: number) {
  const start = at === 0 ? 0 : text.lastIndexOf("\n", at - 1) + 1;
  const newline = text.indexOf("\n", at);
  const end = newline < 0 ? text.length : newline;
  const from = Math.max(start, at - 40);
  return {
    ...placeOf(text, at),
    code: text.slice(from, Math.min(end, at + 40)).replace(/\s/g, " "),
    caret: `${" ".repeat(at - from)}^`,
  };
}

function read(text: string, start: number): Extract<Parsed, { ok: true }> {
  const repairs = new Map<string, JsonNote>();
  const warnings = new Map<string, JsonNote>();
  let i = start;
  let values = 0;
  let deepest = 0;

  const note = (into: Map<string, JsonNote>, message: string, at: number) => {
    const seen = into.get(message);
    if (seen) seen.count++;
    else into.set(message, { message, at, count: 1 });
  };
  const fix = (message: string, at: number) => note(repairs, message, at);
  const fail = (message: string, at = i): never => {
    throw new Failure(message, at);
  };
  const openedOn = (at: number) => `It opened on line ${placeOf(text, at).line}.`;

  function skip() {
    while (i < text.length) {
      const c = text[i];
      if (c === " " || c === "\n" || c === "\r" || c === "\t") i++;
      else if (c === " " || c === "﻿") {
        fix("Removed invisible characters", i);
        i++;
      } else if (c === "/" && text[i + 1] === "/") {
        fix("Removed comments", i);
        const end = text.indexOf("\n", i);
        i = end < 0 ? text.length : end;
      } else if (c === "/" && text[i + 1] === "*") {
        fix("Removed comments", i);
        const end = text.indexOf("*/", i + 2);
        i = end < 0 ? text.length : end + 2;
      } else return;
    }
  }

  function string(): string {
    const open = i;
    const quote = text[i] as string;
    const close = CLOSING[quote] as string;
    if (quote === "'") fix("Changed single quotes to double quotes", open);
    else if (quote !== '"') fix("Changed curly quotes to straight quotes", open);
    i++;
    let out = "";
    let from = i;
    while (i < text.length) {
      const c = text[i] as string;
      if (close.includes(c)) {
        out += text.slice(from, i);
        i++;
        return out;
      }
      if (c === "\\") {
        out += text.slice(from, i);
        const e = text[i + 1];
        const hex = text.slice(i + 2, i + 6);
        if (e !== undefined && ESCAPES[e] !== undefined) {
          out += ESCAPES[e];
          i += 2;
        } else if (e === "u" && /^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 6;
        } else if (e === "'") {
          fix("Removed backslashes before single quotes", i);
          out += "'";
          i += 2;
        } else {
          fix("Kept backslashes that were not valid escapes", i);
          out += "\\";
          i++;
        }
        from = i;
        continue;
      }
      if (c < " ") fix("Escaped raw line breaks or tabs inside strings", i);
      i++;
    }
    fix("Closed a string the text ended inside", open);
    return out + text.slice(from, i);
  }

  function bare(): Json {
    const at = i;
    NUMBER.lastIndex = i;
    const number = NUMBER.exec(text)?.[0];
    if (number && !/[\w.+-]/.test(text[at + number.length] ?? "")) {
      i += number.length;
      return new JsonNumber(number);
    }
    WORD.lastIndex = i;
    const word = WORD.exec(text)?.[0];
    if (word) {
      const literal = LITERALS.get(word.toLowerCase());
      if (literal === undefined) return fail(`${word} is not a JSON value. Text needs quotes.`);
      if (word !== String(literal)) fix(`Changed ${word} to ${String(literal)}`, at);
      i += word.length;
      return literal;
    }
    if (number) return fail(`${text.slice(at).match(/^[^\s,\]}]+/)?.[0]} is not a valid number.`);
    return fail(`Expected a value but found ${found(text[i])}.`);
  }

  function value(depth: number): Json {
    skip();
    if (i >= text.length) fail("The text ended where a value should be.");
    if (depth > MAX_DEPTH) fail(`Nested deeper than ${MAX_DEPTH} levels.`);
    values++;
    if (depth > deepest) deepest = depth;
    const c = text[i] as string;
    if (c === "{") return object(depth);
    if (c === "[") return array(depth);
    return CLOSING[c] ? string() : bare();
  }

  /** After a comma: true when what follows closes the container, which makes the comma trailing. */
  function afterComma(closer: string) {
    const comma = i;
    i++;
    skip();
    if (text[i] === closer) fix("Removed trailing commas", comma);
  }

  function array(depth: number): Json[] {
    const open = i++;
    const out: Json[] = [];
    for (;;) {
      skip();
      if (i >= text.length) {
        fix("Closed brackets the text ended inside", open);
        return out;
      }
      if (text[i] === "]") {
        i++;
        return out;
      }
      if (text[i] === ",") {
        fix("Removed stray commas", i);
        i++;
        continue;
      }
      out.push(value(depth + 1));
      skip();
      if (text[i] === ",") afterComma("]");
      else if (i < text.length && text[i] !== "]") {
        if (!VALUE_START.test(text[i] as string))
          fail(`Expected "," or "]" but found ${found(text[i])}. ${openedOn(open)}`);
        fix("Added missing commas", i);
      }
    }
  }

  function key(): string {
    if (CLOSING[text[i] as string]) return string();
    BARE_KEY.lastIndex = i;
    const word = BARE_KEY.exec(text)?.[0];
    if (!word) return fail(`Expected a key in quotes but found ${found(text[i])}.`);
    fix("Added quotes around keys", i);
    i += word.length;
    return word;
  }

  function object(depth: number): JsonObject {
    const open = i++;
    const out = new JsonObject();
    const seen = new Set<string>();
    const ended = (at: number) => {
      fix("Dropped a key the text ended after", at);
      fix("Closed brackets the text ended inside", open);
      return out;
    };
    for (;;) {
      skip();
      if (i >= text.length) {
        fix("Closed brackets the text ended inside", open);
        return out;
      }
      if (text[i] === "}") {
        i++;
        return out;
      }
      if (text[i] === ",") {
        fix("Removed stray commas", i);
        i++;
        continue;
      }
      const keyAt = i;
      const name = key();
      skip();
      if (i >= text.length) return ended(keyAt);
      if (text[i] !== ":") fail(`Expected ":" after the key ${name} but found ${found(text[i])}.`);
      i++;
      skip();
      if (i >= text.length) return ended(keyAt);
      if (seen.has(name)) note(warnings, "Repeated keys: most parsers keep only the last", keyAt);
      seen.add(name);
      out.entries.push([name, value(depth + 1)]);
      skip();
      if (text[i] === ",") afterComma("}");
      else if (i < text.length && text[i] !== "}") {
        if (!KEY_START.test(text[i] as string))
          fail(`Expected "," or "}" but found ${found(text[i])}. ${openedOn(open)}`);
        fix("Added missing commas", i);
      }
    }
  }

  if (start > 0) fix(`Ignored ${start} characters before the JSON`, 0);
  skip();
  const rootAt = i;
  const root = value(0);
  const all = [root];
  skip();
  if (i < text.length && !isBox(root)) fail("Found more text after the value.", rootAt);
  while (text[i] === "{" || text[i] === "[") {
    all.push(value(0));
    skip();
    if (text[i] === ",") {
      i++;
      skip();
    }
  }
  if (all.length > 1) fix(`Read ${all.length} separate values as one list`, rootAt);
  if (i < text.length) fix(`Ignored ${text.length - i} characters after the JSON`, i);
  return {
    ok: true,
    value: all.length > 1 ? all : root,
    repairs: [...repairs.values()],
    warnings: [...warnings.values()],
    values,
    depth: deepest,
  };
}

/**
 * Reads the text as it stands. When the very first thing in it cannot start a value (a log prefix,
 * a code fence), reads from the first bracket instead. Never after that: skipping to a later
 * bracket past an error further in would show a fragment as if it were the whole.
 */
export function parseJson(text: string): Parsed {
  let failure: Failure;
  try {
    return read(text, 0);
  } catch (e) {
    if (!(e instanceof Failure)) return { ok: false, message: String(e), at: 0 };
    failure = e;
  }
  if (failure.at <= text.search(/\S/) + 1) {
    const starts = [text.indexOf("{"), text.indexOf("[")]
      .filter((n) => n > 0 && text.slice(0, n).trim() !== "")
      .sort((a, b) => a - b);
    for (const start of starts) {
      try {
        return read(text, start);
      } catch (e) {
        if (e instanceof Failure && e.at > failure.at) failure = e;
      }
    }
  }
  return { ok: false, message: failure.message, at: failure.at };
}

function decodeBase64Url(part: string): string {
  const binary = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function strictBox(text: string): Json | undefined {
  const out = parseJson(text);
  return out.ok && !out.repairs.length && isBox(out.value) ? out.value : undefined;
}

/** JSON hiding inside a string: an escaped payload or a JWT. Only ever exact, never repaired. */
export function decodeString(text: string): { label: string; step: string; value: Json } | null {
  const trimmed = text.trim();
  if (/^[{[]/.test(trimmed) && trimmed.length < 1_000_000) {
    const value = strictBox(trimmed);
    return value === undefined ? null : { label: "JSON in a string", step: "fromjson", value };
  }
  if (!/^eyJ[\w-]+\.eyJ[\w-]+\.[\w-]*$/.test(trimmed)) return null;
  try {
    const [head, body] = trimmed
      .split(".")
      .map((part, n) => (n < 2 ? strictBox(decodeBase64Url(part)) : null));
    if (head === undefined || body === undefined || head === null || body === null) return null;
    const value = new JsonObject();
    value.entries = [
      ["header", head],
      ["payload", body],
    ];
    return { label: "JWT, signature not checked", step: "jwt", value };
  } catch {
    return null;
  }
}

export interface JsonChild {
  name: string;
  value: Json;
  path: string;
  index: boolean;
}

/** Children with their paths, written so they paste into jq. */
export function childrenOf(value: Json, path: string): JsonChild[] | null {
  const piped = /\| \w+$/.test(path);
  const base = piped ? `${path} | ` : path;
  const dot = piped || path === "" ? "." : "";
  if (Array.isArray(value))
    return value.map((item, i) => ({
      name: String(i),
      value: item,
      path: `${base}${dot}[${i}]`,
      index: true,
    }));
  if (value instanceof JsonObject)
    return value.entries.map(([name, item]) => ({
      name,
      value: item,
      path: /^[A-Za-z_]\w*$/.test(name)
        ? `${base}.${name}`
        : `${base}${dot}[${JSON.stringify(name)}]`,
      index: false,
    }));
  return null;
}

/** What can be opened at this value, looking inside strings too. */
export function expandJson(
  value: Json,
  path: string,
): { kids: JsonChild[]; label?: string } | null {
  if (typeof value === "string") {
    const decoded = decodeString(value);
    if (!decoded) return null;
    return {
      label: decoded.label,
      kids: childrenOf(decoded.value, `${path || "."} | ${decoded.step}`) as JsonChild[],
    };
  }
  const kids = childrenOf(value, path);
  return kids && { kids };
}

export function scalarText(value: Json): string {
  return value instanceof JsonNumber ? value.source : JSON.stringify(value);
}

export function serialize(value: Json, indent: number, pad = ""): string {
  const box = Array.isArray(value)
    ? { open: "[", close: "]", items: value.map((v) => [null, v] as const) }
    : value instanceof JsonObject
      ? { open: "{", close: "}", items: value.entries }
      : null;
  if (!box) return scalarText(value);
  if (!box.items.length) return box.open + box.close;
  const inner = pad + " ".repeat(indent);
  const colon = indent ? ": " : ":";
  const body = box.items.map(
    ([key, v]) =>
      inner + (key === null ? "" : JSON.stringify(key) + colon) + serialize(v, indent, inner),
  );
  return indent
    ? `${box.open}\n${body.join(",\n")}\n${pad}${box.close}`
    : box.open + body.join(",") + box.close;
}

export function sortKeys(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!(value instanceof JsonObject)) return value;
  const out = new JsonObject();
  out.entries = value.entries
    .map(([key, v]): [string, Json] => [key, sortKeys(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

/** How many levels can be open with at most `budget` rows drawn; at least the root's. */
export function levelsWithin(root: Json, budget: number): number {
  let level = [root];
  let levels = 0;
  let total = 0;
  for (;;) {
    const next: Json[] = [];
    for (const v of level) {
      if (Array.isArray(v)) next.push(...(v.length > budget ? v.slice(0, budget + 1) : v));
      else if (v instanceof JsonObject) for (const [, item] of v.entries) next.push(item);
    }
    if (!next.length || total + next.length > budget) return Math.max(levels, 1);
    total += next.length;
    levels++;
    level = next;
  }
}

export interface JsonFound {
  hits: Set<string>;
  keep: Set<string>;
  open: Set<string>;
  count: number;
  capped: boolean;
}

/** A query starting with a dot is a path (`.users[].name`); anything else is text in keys and values. */
export function searchJson(root: Json, query: string, limit = 2000): JsonFound {
  const byPath = query.startsWith(".");
  if (byPath) {
    const out = searchWith(root, limit, pathTest(query));
    if (out.count) return out;
  }
  const lower = query.toLowerCase();
  return searchWith(root, limit, (value, _path, name) =>
    Boolean(
      name?.toLowerCase().includes(lower) ||
        (!isBox(value) &&
          (typeof value === "string" ? value : scalarText(value)).toLowerCase().includes(lower)),
    ),
  );
}

function pathTest(query: string) {
  const escaped = query.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&").replace(/\\\[\\\]/g, "\\[\\d+\\]");
  const pattern = new RegExp(`^${escaped}$`);
  return (_value: Json, path: string) => pattern.test(path || ".");
}

function searchWith(
  root: Json,
  limit: number,
  matches: (value: Json, path: string, name?: string) => boolean,
): JsonFound {
  const out: JsonFound = {
    hits: new Set(),
    keep: new Set(),
    open: new Set(),
    count: 0,
    capped: false,
  };
  function walk(value: Json, id: string, path: string, name?: string): boolean {
    if (out.count >= limit) {
      out.capped = true;
      return false;
    }
    const hit = matches(value, path, name);
    if (hit) {
      out.count++;
      out.hits.add(id);
      out.keep.add(id);
    }
    let below = false;
    expandJson(value, path)?.kids.forEach((kid, i) => {
      if (walk(kid.value, `${id}/${i}`, kid.path, kid.index ? undefined : kid.name)) below = true;
    });
    if (below) {
      out.keep.add(id);
      out.open.add(id);
    }
    return hit || below;
  }
  walk(root, "0", "");
  return out;
}

/** A piece of text cut around each place the query appears, for highlighting. */
export function marked(text: string, query: string): { text: string; hit: boolean }[] {
  if (!query || query.startsWith(".")) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: { text: string; hit: boolean }[] = [];
  let from = 0;
  for (let at = lower.indexOf(q); at >= 0; at = lower.indexOf(q, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + q.length), hit: true });
    from = at + q.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts;
}

const TIME_KEY = /(?:^|[_-])(?:at|time|timestamp|ts|date|exp|iat|nbf)$|created|updated|expires/i;
const TIME_KEY_CAMEL = /(?:At|Time|Date)$/;

/** A Unix time written as a bare number, named by its key: an id of the same size is left alone. */
export function dateHint(name: string | undefined, value: Json): string | null {
  if (!name || !(value instanceof JsonNumber) || !/^\d{10}$|^\d{13}$/.test(value.source))
    return null;
  if (!TIME_KEY.test(name) && !TIME_KEY_CAMEL.test(name)) return null;
  const n = Number(value.source);
  return new Date(value.source.length === 10 ? n * 1000 : n).toUTCString();
}

export function linkOf(value: Json): string | null {
  return typeof value === "string" && /^https?:\/\/\S+$/.test(value) ? value : null;
}

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isTable(value: Json): value is Json[] {
  return (
    Array.isArray(value) && value.length > 1 && value.every((row) => row instanceof JsonObject)
  );
}

export interface JsonTable {
  columns: string[];
  rows: (Json | undefined)[][];
}

export function tableOf(value: Json[]): JsonTable {
  const columns = new Map<string, number>();
  const rows = (value as JsonObject[]).map((row) => {
    const cells: (Json | undefined)[] = [];
    for (const [key, cell] of row.entries) {
      if (!columns.has(key)) columns.set(key, columns.size);
      cells[columns.get(key) as number] = cell;
    }
    return cells;
  });
  return { columns: [...columns.keys()], rows };
}

export function cellText(cell: Json | undefined): string {
  if (cell === undefined) return "";
  if (typeof cell === "string") return cell;
  if (Array.isArray(cell)) return `[${cell.length}]`;
  if (cell instanceof JsonObject) return `{${cell.entries.length}}`;
  return scalarText(cell);
}

export function toCsv(table: JsonTable): string {
  const quote = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  // A cell from someone else's JSON must not run as a formula when pasted into a spreadsheet.
  const cell = (c: Json | undefined) => {
    if (c === undefined) return "";
    if (typeof c === "string") return quote(/^[=+\-@\t\r]/.test(c) ? `'${c}` : c);
    return quote(isBox(c) ? serialize(c, 0) : scalarText(c));
  };
  const lines = table.rows.map((row) => table.columns.map((_, i) => cell(row[i])).join(","));
  return [table.columns.map(quote).join(","), ...lines].join("\n");
}

/** The shallowest table in the document: most API answers wrap theirs in an envelope. */
export function findTable(root: Json): { path: string; value: Json[] } | null {
  let level = [{ value: root, path: "" }];
  for (let seen = 0; level.length && seen < 20_000; seen += level.length) {
    const next: { value: Json; path: string }[] = [];
    for (const node of level) {
      if (isTable(node.value)) return { path: node.path, value: node.value };
      if (!Array.isArray(node.value) || node.value.length <= 10_000)
        next.push(...(childrenOf(node.value, node.path) ?? []));
    }
    level = next;
  }
  return null;
}

const YAML_PLAIN = /^[A-Za-z_][\w ./-]*$/;
const YAML_WORDS = /^(?:true|false|null|yes|no|on|off|y|n)$/i;

/** Double quotes are the safe fallback: a JSON string is a valid YAML string. */
function yamlString(text: string): string {
  return YAML_PLAIN.test(text) && !YAML_WORDS.test(text) && !text.endsWith(" ")
    ? text
    : JSON.stringify(text);
}

const yamlScalar = (v: Json) => (typeof v === "string" ? yamlString(v) : scalarText(v));
const isFilled = (v: Json) =>
  Array.isArray(v) ? v.length > 0 : v instanceof JsonObject && v.entries.length > 0;

function yamlLines(value: Json, indent: number): string[] {
  const pad = " ".repeat(indent);
  if (Array.isArray(value) && value.length)
    return value.flatMap((item) => {
      const [first, ...rest] = yamlLines(item, indent);
      return [`-${" ".repeat(indent - 1)}${first}`, ...rest.map((line) => pad + line)];
    });
  if (value instanceof JsonObject && value.entries.length)
    // YAML refuses a repeated key; the last one is the one parsers keep.
    return [...new Map(value.entries)].flatMap(([key, item]) =>
      isFilled(item)
        ? [`${yamlString(key)}:`, ...yamlLines(item, indent).map((line) => pad + line)]
        : [
            `${yamlString(key)}: ${item instanceof JsonObject ? "{}" : Array.isArray(item) ? "[]" : yamlScalar(item)}`,
          ],
    );
  return [value instanceof JsonObject ? "{}" : Array.isArray(value) ? "[]" : yamlScalar(value)];
}

export function toYaml(value: Json, indent: number): string {
  return `${yamlLines(value, indent).join("\n")}\n`;
}

const xmlName = (name: string) => {
  const clean = name.replace(/[^\w.-]/g, "_");
  return /^(?:[A-Za-z_])/.test(clean) && !/^xml/i.test(clean) ? clean : `_${clean}`;
};

// XML 1.0 forbids these control characters anywhere in a document, escaped or not.
const xmlText = (text: string) =>
  text
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function xmlLines(name: string, value: Json, indent: number): string[] {
  const pad = " ".repeat(indent);
  const tag = xmlName(name);
  const wrap = (inner: string[]) => [`<${tag}>`, ...inner.map((line) => pad + line), `</${tag}>`];
  if (Array.isArray(value)) {
    if (!value.length) return [`<${tag}/>`];
    // A key's list is the element repeated. A list straight inside a list has no key to repeat.
    return value.flatMap((item) =>
      Array.isArray(item) ? wrap(xmlLines("item", item, indent)) : xmlLines(name, item, indent),
    );
  }
  if (value instanceof JsonObject)
    return value.entries.length
      ? wrap(value.entries.flatMap(([key, item]) => xmlLines(key, item, indent)))
      : [`<${tag}/>`];
  if (value === null) return [`<${tag}/>`];
  return [`<${tag}>${xmlText(typeof value === "string" ? value : scalarText(value))}</${tag}>`];
}

export function toXml(value: Json, indent: number): string {
  const body = Array.isArray(value) ? xmlLines("item", value, indent) : null;
  const root = body
    ? ["<root>", ...body.map((line) => " ".repeat(indent) + line), "</root>"]
    : xmlLines("root", value, indent);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${root.join("\n")}\n`;
}

export const JSON_VIEW = "json-view";

/** What the page and every row of the tree share. */
export interface JsonTreeView {
  levels: number;
  query: string;
  found: JsonFound | null;
  selected: { id: string; path: string; value: Json } | null;
  overrides: Map<string, boolean>;
}
