/**
 * The MCP server, over HTTP.
 *
 * `passalong mcp` speaks stdio: it is a process on your machine talking down a pipe, which is why
 * an editor or a terminal agent can use it and a hosted assistant cannot. Assistants that add
 * outside tools add them as *remote* servers, reached at a URL — so this is the same server at an
 * address.
 *
 * Stateless, deliberately. Every tool here is a request and a response: nothing subscribes,
 * nothing is pushed, nothing waits. That means no session to keep, no Durable Object to keep it
 * in, and no reason for one request to remember another — a fresh server and transport per request
 * is both simpler and correct on a runtime that may hand the next request to a different isolate.
 *
 * The tools do not reimplement anything. Each one is a shape — a name, a description an agent
 * reads, and a schema — mapped onto a route this API already serves, dispatched back through the
 * app with the caller's own credential. If a route changes its rules, the tool changed with it.
 *
 * The same tools as packages/passalong/src/mcp.js (docs/WORK.md, "Agent tools: 17"), less one:
 * `accounts` lists the logins on a machine and picks one for a session, and here the bearer token
 * is the account — there is nothing to list and nothing to choose.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

/**
 * How a tool reaches the rest of the API: the app's own fetch, with the caller's credential.
 *
 * `raw` is for the routes that do not take JSON. `POST /v1/shots`, `/v1/attachments` and a folder's
 * assets read the body as bytes and the content type as the declaration of what they are, so a tool
 * uploading a file has to be able to say both.
 */
type Call = (
  method: string,
  path: string,
  body?: unknown,
  raw?: { contentType: string; headers?: Record<string, string> },
) => Promise<{ status: number; text: string }>;

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });
const failed = (value: string) => ({
  content: [{ type: "text" as const, text: value }],
  isError: true,
});

/**
 * Hand a route's answer back as it came, so a tool never invents an error the API did not give.
 *
 * The same JSON goes out twice: as text, which every client reads, and as `structuredContent`,
 * which is what a tool with an output schema has to return. A route that answered with something
 * other than a JSON object is a failure here, since the SDK would refuse the result anyway.
 */
async function relay(call: Call, method: string, path: string, body?: unknown) {
  const res = await call(method, path, body);
  if (res.status >= 400) return failed(res.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    return failed(`unexpected response from ${path}: ${res.text.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return failed(`unexpected response from ${path}: ${res.text.slice(0, 200)}`);
  }
  return { ...text(res.text), structuredContent: parsed as Record<string, unknown> };
}

/** The part of a verb's answer that says what to do next. See steps() in claims.ts. */
type Answer = {
  next?: { tool: string; when: string; why: string; with?: string }[];
  say?: string;
};

/** `next` and `say`, as the last thing an agent reads. Mirrors nextNote() in the local server. */
function nextNote({ next = [], say = "" }: Answer, id = "") {
  const lines = next.map(
    (s) =>
      `  ${s.tool}${id && s.tool !== "take" ? ` ${id}` : ""} — when ${s.when} (${s.why})` +
      // What the call has to carry, under the call it belongs to.
      (s.with ? `\n      with ${s.with}` : ""),
  );
  if (say) lines.unshift(`  ${say}`);
  return lines.length ? `<!-- passalong: next:\n${lines.join("\n")}\n-->` : "";
}

/** A refusal, with the server's own next move when it sent one: usually, stop. */
function refused(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Answer & { message?: string };
    const note = nextNote(parsed);
    return failed(`${parsed.message || raw}${note ? `\n${note}` : ""}`);
  } catch {
    return failed(raw);
  }
}

/** A verb's answer: the route's JSON as data, and as text with what to call next after it. */
async function answer(call: Call, method: string, path: string, id: string, body: unknown) {
  const res = await call(method, path, body);
  if (res.status >= 400) return refused(res.text);
  let parsed: Answer & Record<string, unknown>;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    return failed(`unexpected response from ${path}: ${res.text.slice(0, 200)}`);
  }
  const note = nextNote(parsed, id);
  // A reply goes first, in prose: it is what the agent stopped for, and inside the JSON it reads as
  // one more field. Mirrors repliesNote() in packages/passalong/src/mcp.js.
  const said = repliesNote(parsed.replies);
  return {
    ...text(`${said ? `${said}\n` : ""}${res.text}${note ? `\n${note}` : ""}`),
    structuredContent: parsed,
  };
}

/** What the person said to this agent since it last heard. See claims.deliver(). */
function repliesNote(replies: unknown): string {
  if (!Array.isArray(replies) || !replies.length) return "";
  const lines = replies.map(
    (r: { body?: unknown }) => `  - ${String(r?.body ?? "").replace(/\n/g, "\n    ")}`,
  );
  const files = replies.some((r: { body?: unknown }) =>
    String(r?.body ?? "").includes("/v1/attachments/"),
  )
    ? "\n  Attached files are private: fetch one with your passalong token, e.g. " +
      'curl -H "authorization: Bearer $PASSALONG_TOKEN (or the token in ~/.passalong/config.json)" -o <name> <url>.'
    : "";
  return `<!-- passalong: the person replied:\n${lines.join("\n")}${files}\n-->`;
}

/**
 * Where the line `add_file` returns goes, which is not always new work. Proof of a hand-in belongs
 * on the hand-in: six screenshots of a delivered change were once published as a document with six
 * sections wrapped round them, because the upload tool named only one destination.
 *
 * Mirrors WHERE_THE_LINE_GOES in packages/passalong/src/mcp.js.
 */
const WHERE_THE_LINE_GOES =
  "WHERE THE LINE GOES DEPENDS ON WHAT THE FILE IS EVIDENCE OF. Proof that work you are handing in " +
  "holds — a screen that renders right, a total that matches — goes in that check's `ran` on " +
  "hand_in, and nothing new is written: a check answered with a picture is shown, which is what " +
  "the hand-in asks for. A picture that is part of the work itself — the screenshot of a bug, a " +
  "diagram it explains — goes in its text (create_work, or update_work), because work travels as " +
  "its text and a file beside it does not travel at all. DO NOT WRITE NEW WORK TO CARRY " +
  "SCREENSHOTS: six images and a caption each is a hand-in. With `project`, the file is kept in " +
  "that project instead. Pictures (png, jpg, webp, gif) are drawn where they are named; anything " +
  "else is a file to download.";

/**
 * What a screenshot has to be a screenshot OF. An agent short of a picture once built a page to
 * photograph, shot it, deleted it, and offered the shots as evidence the real screen rendered.
 *
 * Mirrors SHOOT_THE_REAL_THING in packages/passalong/src/mcp.js.
 */
const SHOOT_THE_REAL_THING =
  "SHOOT THE RUNNING THING, NOT SOMETHING YOU BUILT TO SHOOT. A screenshot is worth what the sc" +
  "reen behind it is worth: the real route in the real app, reached the way a reader would reac" +
  "h it. A scratch page, a story, a harness or a component rendered on its own is a picture of " +
  "your scaffolding, and it can look right while the thing the work is about does not. If the " +
  "only way you could get a picture was to build something, that is not evidence the real scree" +
  "n works — say what you built and why in `writeup`, and leave the check to the commands that " +
  "do hold. NEVER DELETE WHAT YOUR EVIDENCE POINTS AT: a shot of a page you removed afterwards " +
  "is one nobody can take again, including you.\n\n";

const KEEP_EVIDENCE =
  "KEEP YOUR EVIDENCE AS YOU GO. hand_in needs it: the commands you ran and what came back, the " +
  "test summary, the link to the change. Copy each one when it happens — at the end you will be " +
  "writing from memory, which is the thing evidence is here to replace.\n\n";

/**
 * The failure this stops: an agent lists one directory, or opens the one file it expected, and
 * reports that a thing is absent, or that it found the only occurrence. Confident and wrong, and
 * nothing downstream can tell. Mirrors SEARCH_WIDE in packages/passalong/src/mcp.js.
 */
const SEARCH_WIDE =
  "SEARCH THE WHOLE TREE BEFORE YOU CONCLUDE. Listing a directory, or reading the one file you " +
  "expected, tells you what is in that directory — not whether the thing exists, and not whether " +
  "you have found all of it. Before you report that something is absent, is the only one, or is " +
  'already handled, search across the repository and let the output be your reason. "I looked" ' +
  "is a claim; the search and what it printed is evidence.\n\n";

/** Said in front of every piece of work an agent takes. Mirrors LEAD in the local server. */
const LEAD = SEARCH_WIDE + SHOOT_THE_REAL_THING + KEEP_EVIDENCE;

/**
 * Said after the work an agent took: where what it learns goes. Mirrors AFTER in
 * packages/passalong/src/passalong.js.
 */
const AFTER =
  "<!-- passalong: what you learn doing this — how something works, a decision and why — goes " +
  "into the project's documents (find_projects, read_document, save_document), not into a new " +
  "piece of work. Work somebody else should now do is create_work with `parent` set to this id. " +
  "What you did and how you checked it goes on hand_in. -->";

// ---- reading work in parts ---------------------------------------------------------------------
// A copy of apps/api/src/sections.ts and packages/passalong/src/guide.js, because this file takes no
// sibling import (it is loaded straight by node's test runner). test/sections.test.mjs holds the
// three to the same answers.

/** Over this, work is read by its outline first: six of 123 held 72% of the stored text. */
const GUIDE_WARN = 20_000;

interface Heading {
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
    if (m) lines.push({ heading: (m[2] ?? "").trim(), level: (m[1] ?? "").length, start: at });
    at += raw.length + 1;
  }
  return { lines, bodyStart };
}

/** The end of the section that begins at lines[i]: the next heading at its level or above. */
function endOf(lines: Line[], i: number, total: number): number {
  const here = lines[i];
  if (!here) return total;
  for (let j = i + 1; j < lines.length; j++) {
    const next = lines[j];
    if (next && next.level <= here.level) return next.start;
  }
  return total;
}

export function outlineOf(markdown: string): Heading[] {
  const { lines } = headings(markdown);
  return lines.map((l, i) => ({
    heading: l.heading,
    level: l.level,
    chars: endOf(lines, i, markdown.length) - l.start,
  }));
}

/** One section by its heading — exact, then by its start, then by what it contains. */
export function sectionOf(
  markdown: string,
  name: string,
): { heading: string; text: string } | null {
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
  const hit = i === undefined ? undefined : lines[i];
  if (i === undefined || !hit) return null;
  return {
    heading: hit.heading,
    text: markdown.slice(hit.start, endOf(lines, i, markdown.length)).trimEnd(),
  };
}

/**
 * The work this one came out of, formatted to go in front of it — or "" when there is none.
 *
 * Said before the document, because it changes what the document is: a piece of work read on its
 * own can look like the whole job when it is one part of a bigger one. Context is never worth
 * failing the tool over. Mirrors parentWork() in packages/passalong/src/passalong.js.
 */
async function parentOf(call: Call, id: string): Promise<{ text: string; id: string }> {
  const none = { text: "", id: "" };
  try {
    const res = await call("GET", `/v1/guides/${encodeURIComponent(id)}/parent?markdown=1`);
    if (res.status >= 400) return none;
    const { guide } = JSON.parse(res.text) as {
      guide?: {
        id?: string;
        title?: string;
        state?: string;
        by?: { name?: string; handle?: string } | null;
        markdown?: unknown;
      } | null;
    };
    if (!guide?.id) return none;
    const who = guide.by?.name || (guide.by?.handle ? `@${guide.by.handle}` : "");
    const state = guide.state === "held" && who ? `held by ${who}` : guide.state || "open";
    return {
      id: String(guide.id),
      text:
        `THIS CAME OUT OF ${guide.id}: ${guide.title || "untitled"} — ${state}. It is part of that ` +
        "work, which is below; read it first. If this depends on " +
        `${guide.id} being done and it is not, say so rather than starting.\n\n` +
        `--- the work it came out of: ${guide.id} ---\n${String(guide.markdown ?? "").trimEnd()}`,
    };
  } catch {
    return none;
  }
}

/**
 * The product's own vocabulary, handed in rather than imported.
 *
 * Importing it would make this module untestable: a sibling imported as `./guide.js` is what Node's
 * type stripping cannot resolve, so a test that touches this file would not load at all — the same
 * reason the app itself is not importable, noted in hosts.ts. Passing it in keeps one source.
 */
export interface Vocabulary {
  /** Image media types `/v1/shots` accepts, for the add_file description. */
  shotTypes: string;
}

/**
 * How many bytes a download is allowed to be before this gives up on it.
 *
 * Not the rule — the upload routes own that, and answer 413 with the real limit. This only bounds
 * what gets pulled into memory on the way there: `download_url` is a string somebody handed us, and
 * a Worker that reads it to completion before the route ever sees it can be made to read anything.
 * Deliberately above the routes' own caps, so the refusal a caller reads is the route's.
 */
const FETCH_MAX = 12 * 1024 * 1024;

/**
 * Refuse a download URL that points somewhere only this Worker can reach.
 *
 * The URL arrives in a tool call. ChatGPT fills it in with its own file host, but any caller
 * holding a token can call the tool directly with whatever they like, and "fetch this and tell me
 * what came back" aimed at a private address is the shape of every SSRF. Public HTTPS or nothing.
 */
function fetchable(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal"))
    return null;
  // Literal addresses only: a name that resolves to a private address is a DNS-rebinding problem
  // this cannot see from here, and the allowlist that would fix it belongs in egress policy.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a = 0, b = 0] = host.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b < 32)) return null;
    if (a === 192 && b === 168) return null;
    if (a === 169 && b === 254) return null;
  }
  if (host.includes(":")) return null; // bare IPv6, including ::1 and fc00::/7
  return url;
}

/**
 * A file a client passes in, in the shape `openai/fileParams` requires: all four properties
 * declared, only `download_url` and `file_id` required. The client fills it; the model never sees
 * the bytes. Only a top-level input field can be declared a file — which is why create_work's
 * files sit beside `items` and each item points at them by position.
 */
const fileInput = z.object({
  download_url: z.string().describe("where the file can be fetched (https)"),
  file_id: z.string().describe("the host's id for the file"),
  mime_type: z.string().optional().describe("image/png, application/pdf, text/csv, …"),
  file_name: z.string().optional().describe("original filename, used as the label"),
});
type FileInput = z.infer<typeof fileInput>;

/** Fetch a client-passed file, bounded, or say why it could not be. */
async function fetched(
  file: FileInput,
): Promise<{ bytes: ArrayBuffer; type: string; name: string } | { error: string }> {
  const url = fetchable(file.download_url);
  if (!url)
    return {
      error:
        "download_url has to be a public https URL. If the file is one you hold — in a code " +
        "sandbox or on disk — call add_file with no `file` for an upload link, and run the " +
        "command it returns instead.",
    };
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    return { error: `could not fetch the file (${(err as Error).message})` };
  }
  if (!res.ok) return { error: `could not fetch the file: ${res.status} ${res.statusText}` };
  // The declared length is a hint and a lie is free, so the bytes are what gets measured.
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > FETCH_MAX) return { error: "that file is too large to add" };
  if (!bytes.byteLength) return { error: "that file is empty" };
  // The client's mime_type is what it says the file is; the host's own content-type is what it
  // served. Prefer the served one — the routes key storage off it and refuse what they do not know.
  const served = (res.headers.get("content-type") || "").split(";")[0]?.trim();
  return {
    bytes,
    type: served || file.mime_type || "application/octet-stream",
    name: (file.file_name || "").replace(/[^\x20-\x7e]/g, "").slice(0, 120),
  };
}

/**
 * Store a client-passed file on its own, and return the markdown line that points at it: a picture
 * through `POST /v1/shots`, drawn where it is named, and anything else through `POST
 * /v1/attachments`, a private download. Shared by every tool that takes a file, so the SSRF guard
 * and the size bound are written once.
 */
async function storeFile(
  call: Call,
  file: FileInput,
): Promise<{ line: string; id: string; url: string } | { error: string }> {
  const got = await fetched(file);
  if ("error" in got) return got;
  const picture = got.type.startsWith("image/");
  const up = await call("POST", picture ? "/v1/shots" : "/v1/attachments", got.bytes, {
    contentType: got.type,
    headers: got.name
      ? picture
        ? { "x-shot-name": got.name }
        : { "x-file-name": encodeURIComponent(got.name) }
      : {},
  });
  if (up.status >= 400) return { error: up.text };
  const parsed = JSON.parse(up.text) as {
    shot?: { id: string; url: string };
    attachment?: { id: string; url: string };
  };
  const stored = (picture ? parsed.shot : parsed.attachment) as { id: string; url: string };
  const label = (got.name || (picture ? "screenshot" : "file")).replace(/[[\]()]/g, "");
  return {
    line: picture ? `![${label}](${stored.url})` : `[${label}](${stored.url})`,
    ...stored,
  };
}

/** Store every file in order, stopping at the first that fails and naming which one it was. */
async function storeFiles(
  call: Call,
  files: FileInput[],
): Promise<{ lines: string[] } | { error: string }> {
  const lines: string[] = [];
  for (const [i, file] of files.entries()) {
    const stored = await storeFile(call, file);
    if ("error" in stored) {
      const name = file.file_name ? ` (${file.file_name})` : "";
      return { error: `file ${i}${name}: ${stored.error}` };
    }
    lines.push(stored.line);
  }
  return { lines };
}

/** Keep a client-passed file in a project, as one of its files. */
async function addProjectFile(call: Call, project: string, file: FileInput) {
  const got = await fetched(file);
  if ("error" in got) return failed(got.error);
  if (got.bytes.byteLength > 10 * 1024 * 1024) return failed("That file is over 10 MB.");
  return relayRaw(call, `/v1/folders/${encodeURIComponent(project)}/assets`, got.bytes, {
    contentType: got.type,
    headers: { "x-file-name": got.name || "file" },
  });
}

async function relayRaw(
  call: Call,
  path: string,
  bytes: ArrayBuffer,
  raw: { contentType: string; headers?: Record<string, string> },
) {
  const res = await call("POST", path, bytes, raw);
  if (res.status >= 400) return failed(res.text);
  return { ...text(res.text), structuredContent: JSON.parse(res.text) as Record<string, unknown> };
}

/** A project's picture or small text file, as something the agent can see. */
async function projectFile(call: Call, project: string, file: string) {
  const res = await call(
    "GET",
    `/v1/folders/${encodeURIComponent(project)}/assets/${encodeURIComponent(file)}/agent`,
  );
  if (res.status >= 400) return failed(res.text);
  const got = JSON.parse(res.text) as {
    id: string;
    name: string;
    type: string;
    data?: string;
    text?: string;
  };
  const { data, text: body, ...meta } = got;
  return {
    content: data
      ? [
          { type: "text" as const, text: got.name },
          { type: "image" as const, data, mimeType: got.type },
        ]
      : [{ type: "text" as const, text: `${got.name}\n\n${body || ""}` }],
    structuredContent: meta,
  };
}

/**
 * Output schemas: what each tool hands back, for clients that read results as data.
 *
 * Every object passes through fields it does not name, and almost every field is optional. The
 * routes are the source of truth and add fields freely; a schema that closed the object, or
 * required a field a route stopped sending, would turn a working tool into a validation error.
 */
const item = z.object({ id: z.string(), title: z.string().optional() }).passthrough();
const progressOut = z
  .object({ id: z.string(), lease_until: z.string().optional(), note: z.string().optional() })
  .passthrough();
// What take answers is the work's markdown to read, with the route's record beside it: promised
// as an open object and nothing more.
const takeOut = z.object({}).passthrough();
const handInOut = z.object({ id: z.string(), state: z.string().optional() }).passthrough();
const passOut = z.object({ id: z.string(), passed: z.boolean().optional() }).passthrough();
const askOut = z.object({ id: z.string(), lease_until: z.string().optional() }).passthrough();
const createOut = z.object({ work: z.array(item) }).passthrough();
const findOut = z
  .object({
    id: z.string().optional().describe("with id: the work read"),
    markdown: z.string().optional().describe("with id: its text, or the part asked for"),
    work: z.array(item).optional().describe("with query: what matched"),
    counts: z
      .object({ needs: z.number(), working: z.number(), open: z.number(), done: z.number() })
      .partial()
      .passthrough()
      .optional()
      .describe("with nothing: the board"),
    needs: z.array(item).optional(),
    working: z.array(item).optional(),
    ready: z.array(item).optional(),
  })
  .passthrough();
const updateOut = z.object({ id: z.string() }).passthrough();
const projectsOut = z.object({}).passthrough();
const projectOut = z.object({ folder: z.object({ id: z.string() }).passthrough() }).passthrough();
const documentOut = z.object({}).passthrough();
const removedOut = z.object({ removed: z.boolean() }).passthrough();
const fileOut = z
  .object({
    id: z.string().optional(),
    url: z.string().optional(),
    markdown: z.string().optional().describe("the line that points at it"),
    upload_url: z.string().optional().describe("one-time link that takes the file's bytes"),
    command: z.string().optional().describe("the curl command to run where the file is"),
  })
  .passthrough();
const readFileOut = z.object({ id: z.string(), name: z.string(), type: z.string() }).passthrough();

/**
 * What each tool does to the world, said out loud. MCP's defaults for a tool that says nothing are
 * the worst case — it writes, it may destroy, it reaches outside — and a client acts on them.
 *
 * `openWorldHint` is false for everything that stays inside Passalong. Only the tools that take a
 * file fetch a URL somebody else controls.
 */
const READS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const ADDS = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
// Removes or replaces something that cannot be brought back. Only a person's request should lead here.
const REMOVES = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

const STATUS = { ready: "published", draft: "draft", archived: "consumed" } as const;

/** Why a piece of work needs its author, or "". Mirrors needsWhy() in the local passalong.js. */
function needsWhy(t: {
  mine?: boolean;
  state: string;
  claim?: { note?: string; asking?: string } | null;
}) {
  if (!t.mine) return "";
  if (t.state === "draft") return "in Draft: read it and mark it Ready";
  if (t.state === "stalled") return "its agent went quiet";
  if (t.claim?.asking) return `asking you: ${t.claim.asking}`;
  if (/^BLOCKED:/i.test(t.claim?.note || ""))
    return `stuck on you: ${(t.claim?.note || "").replace(/^BLOCKED:\s*/i, "")}`;
  return "";
}

const quote = (value: string) =>
  /[:#[\]{}"'|>&*!%@`,]|^\s|\s$|^$/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;

/**
 * A piece of work from the fields an agent gave, as the document the route stores. The format's
 * own serializer is in guide.ts, which this file cannot import (see Vocabulary); every value here
 * is a string or a list of strings, quoted the way that serializer quotes them.
 */
function workDocument(w: {
  title: string;
  summary: string;
  body?: string;
  repo?: string;
  tags?: string[];
  blocked: string[];
  draft: boolean;
  team: string;
  to: string;
}) {
  const front = [`title: ${quote(w.title)}`, `summary: ${quote(w.summary)}`];
  if (w.repo) front.push(`target_context: ${quote(w.repo)}`);
  if (w.blocked.length) front.push(`blocked_by: [${w.blocked.join(", ")}]`);
  front.push(`status: ${w.draft ? "draft" : "published"}`);
  if (w.team) front.push(`team: ${quote(w.team)}`);
  if (w.to) front.push(`to: ${quote(w.to.replace(/^@/, ""))}`);
  if (w.tags?.length) front.push(`tags: [${w.tags.map(quote).join(", ")}]`);
  return `---\n${front.join("\n")}\n---\n\n${(w.body || "").trim()}\n`;
}

export function buildServer(call: Call, vocabulary: Vocabulary, origin = "https://passalong.dev") {
  const server = new McpServer(
    { name: "passalong", version: "0.3.0" },
    {
      instructions:
        "Passalong keeps a team's work and what it knows, as four things. WORK is something " +
        "someone must still do: one thing, with no kinds, sections or templates — a title, a " +
        "summary for a person, and whatever text, pictures and files the next reader needs, in " +
        "whatever shape fits. Read it and work out what done means; nothing tells you in advance. " +
        "A PROJECT is a place for one product or body of work; its DOCUMENTS are what to know " +
        "about it — a README saying what it is, who uses it and how it is built, a page per area, " +
        "a Log of what changed. FILES are pictures and other files, on work or in a project.\n" +
        "DOING WORK. Every call that works on something carries an `agent` name you make up once " +
        "and reuse on every call. take (with an id, or none for the next thing waiting for `repo`) " +
        "says you are doing it and returns it; nobody else can take it while you hold it, and " +
        "whoever sent it sees you are on it. progress, with a one-line note at each milestone — " +
        "30 minutes of silence marks it stalled. hand_in when it is done. pass, with the reason, " +
        "when it is not yours or you are stuck. ask, with a question, when you need the person's " +
        "answer: you keep it, stop and wait, and take it again once they have replied. Every " +
        "answer ends with `next`: what to call now. Follow it, and when it says to stop, stop. " +
        "OPEN WORK YOU MEAN TO DO WITH take, NOT find_work: find_work only reads, and nobody " +
        "learns you are on it. If take says somebody else has it, tell the user instead of doing " +
        "the work twice.\n" +
        "EVERY HAND-IN CARRIES EVIDENCE: what you ran and what came back — the command and the " +
        "lines that decided it, a test summary, a link to the change, or a screenshot url. " +
        "Collect it as you work rather than writing it from memory at the end. hand_in without " +
        "it is refused, because your note is your word for your own work and evidence is the " +
        "part a person can check.\n" +
        "WRITING WORK DOWN. create_work takes one piece of work or several. Each says what it is " +
        "to a person in `summary` — one or two plain sentences, 400 characters at most, no ids, " +
        "paths or jargon, saying what this is and whether anybody has to act. It is what the " +
        "person sees first; the text behind it is for agents: exact, dense, full of ids and " +
        "paths. New work is Ready: it reaches whoever it is for at once. Pass `draft: true` when " +
        "a person should read it first — a plan of several pieces, or something you are unsure " +
        "of — and tell them: a draft reaches nobody until they mark it Ready in the hub. A tag " +
        "such as bug, feature or question may describe it; nothing turns on one. BEFORE WRITING " +
        "ANYTHING DOWN, CHECK WHAT IS ALREADY OPEN: find_work with nothing shows the board. If " +
        "this session's work answers something you hold, hand_in that — never write a second " +
        "piece of work about it. Defects you found and are not fixing go in one create_work " +
        "call, each its own item, so each can be taken on its own. AN IMAGE THE USER SHOWED YOU " +
        "IS EVIDENCE, NOT CONTEXT: pass it in create_work's `files`, or add_file it and put the " +
        "line it returns in the text — a screenshot described instead of attached is the most " +
        "useful thing in the report, thrown away. If you hold a file rather than a file input — " +
        "in a code sandbox, or on disk — call add_file with no `file` and run the command it " +
        "returns; never base64 a file into a tool call. update_work changes work that exists: " +
        "Ready, Draft or archived, who it is for, or its text.\n" +
        "WHAT YOU LEARN GOES INTO THE PROJECT'S DOCUMENTS. When the user asks you to pass this " +
        "along, hand it off, capture it, or share what was just done, write what the next person " +
        "needs to know into the project's documents: find_projects, read_document its README and " +
        "the page for that area, and save_document to update the page that already covers it " +
        "rather than adding a new one each time, with a line on its Log. Never hand knowledge to " +
        'one person as a piece of work. "Update the passalong", "add this to passalong" and the ' +
        "like are ambiguous — hand in what you hold, update the documents, or write new work? Ask " +
        "which, in one line, rather than writing and leaving the user to undo it.\n" +
        "A PROJECT IS A PLACE; ITS DOCUMENTS ARE WHAT TO KNOW; WORK IS WHAT TO DO. Sort " +
        "everything before writing it. If someone still has to act on it — a defect still open, " +
        "work not yet done, a check nobody has run — it is work: it has an owner, a state and an " +
        "answer. A document has none of those and tells nobody, so open work recorded only as a " +
        "document is lost. If it is what someone needs to know — an overview, a decision, a " +
        "finding, something already fixed with its commit — it is a document. WHERE A PROJECT " +
        "LIVES is in the `space` field find_projects and save_project return: private, or a named " +
        "team. Tell the person that, never what you meant to do; a project made without `team` " +
        "is private, and one made inside another takes its space. Call find_projects before " +
        "save_project, so you do not make a duplicate; a short request is enough to name one and " +
        "write its first document. read_document gives a document's text and version; " +
        "save_document with that version, and on a stale-version refusal read it again before " +
        "retrying, so nobody's writing is lost. Every version is kept, and read_document with " +
        "`history` lists them, so a bad edit can be put back. delete_document and delete_file " +
        "only when the person asked for that one to go: neither can be undone, and no tool " +
        "deletes a whole project.",
    },
  );

  // ---- the board, drawn as an MCP App where the host can ---------------------------------------
  //
  // find_work with nothing is one read of everything: what needs you, who is on what, what is
  // ready. Hosts that draw MCP Apps (Claude, ChatGPT) show it as a live board in the conversation;
  // every other host gets the same answer as text.

  const WORK_UI = "ui://passalong/work";

  server.registerResource(
    "work-board",
    WORK_UI,
    {
      title: "Your work",
      description: "What needs you, who is working on what, and what is ready.",
      mimeType: "text/html;profile=mcp-app",
      _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
    },
    async () => ({
      contents: [{ uri: WORK_UI, mimeType: "text/html;profile=mcp-app", text: WORK_APP_HTML }],
    }),
  );

  const get = async <T>(path: string, fallback: T): Promise<T> => {
    const res = await call("GET", path);
    if (res.status >= 400) return fallback;
    try {
      return JSON.parse(res.text) as T;
    } catch {
      return fallback;
    }
  };

  async function board() {
    type T = {
      id: string;
      title: string;
      state: string;
      mine: boolean;
      for_me?: boolean;
      team?: string;
      to?: string;
      target?: string;
      url: string;
      claim: { note?: string; asking?: string } | null;
    };
    type W = {
      id: string;
      title: string;
      state: string;
      note: string;
      url: string;
      by: { name: string; handle: string; you: boolean };
    };
    const [{ tasks = [] }, { working = [] }] = await Promise.all([
      get<{ tasks: T[] }>("/v1/tasks", { tasks: [] }),
      get<{ working: W[] }>("/v1/working", { working: [] }),
    ]);
    const hub = `${origin}/hub`;
    const who = (b: { name?: string; handle?: string; you?: boolean }) =>
      b.you ? "You" : b.name || (b.handle ? `@${b.handle}` : "A teammate");
    const needs = tasks
      .map((t) => ({ id: t.id, title: t.title, why: needsWhy(t), url: `${hub}/g/${t.id}` }))
      .filter((t) => t.why);
    const ready = tasks.filter((t) => t.state === "ready");
    // What you may give to someone else — yours, or for you, and in a team — carries its team, and
    // each such team its choices, so the app can offer "Give to…" without asking again.
    const mayAssign = (t: T) => ((t.mine || t.for_me) && t.team ? t.team : undefined);
    const slugs = [
      ...new Set(
        ready
          .slice(0, 5)
          .map(mayAssign)
          .filter((x): x is string => !!x),
      ),
    ];
    const teams: Record<string, { to: string; label: string; hint: string }[]> = {};
    await Promise.all(
      slugs.map(async (slug) => {
        const [d, g] = await Promise.all([
          get<{ name?: string; members?: { id: string; handle: string; name: string }[] }>(
            `/v1/teams/${encodeURIComponent(slug)}`,
            {},
          ),
          get<{ groups?: { slug: string; name: string }[] }>(
            `/v1/teams/${encodeURIComponent(slug)}/groups`,
            {},
          ),
        ]);
        const seen = new Set<string>();
        teams[slug] = [
          { to: "", label: `Everyone in ${d.name || slug}`, hint: "the team" },
          ...(d.members ?? []).map((m) => ({
            to: `@${m.handle || m.id}`,
            label: m.name || (m.handle ? `@${m.handle}` : `@${m.id}`),
            hint: m.handle ? `@${m.handle}` : "no @name",
          })),
          ...(g.groups ?? [])
            .filter((x) => !seen.has(x.slug) && seen.add(x.slug))
            .map((x) => ({ to: `#${x.slug}`, label: x.name || x.slug, hint: `#${x.slug}` })),
        ];
      }),
    );
    return {
      hub,
      counts: {
        needs: needs.length,
        working: working.length,
        open: tasks.filter((t) => ["ready", "blocked", "draft"].includes(t.state)).length,
        done: tasks.filter((t) => t.state === "done").length,
      },
      needs,
      working: working.map((w) => ({
        id: w.id,
        title: w.title,
        who: who(w.by),
        note: w.note,
        stalled: w.state === "stalled",
        url: w.url,
      })),
      ready: ready.slice(0, 5).map((t) => ({
        id: t.id,
        title: t.title,
        target: t.target || "",
        url: t.url,
        team: mayAssign(t),
        to: t.to || "",
      })),
      teams,
    };
  }

  // ---- work: take, progress, hand_in, pass, ask -------------------------------------------------

  // A local agent's id comes from its worktree (packages/passalong/src/passalong.js `agent()`); an
  // assistant over HTTP has no worktree and no session, so it names itself and the name is the
  // claim's owner. Reusing it on every call is what makes it the same agent.
  const AGENT = z
    .string()
    .regex(/^[a-z0-9-]{8,64}$/, "8 to 64 of a-z, 0-9 and -")
    .describe("a name for you, the same on every call, e.g. chat-7f3k2m9q");

  const EVIDENCE = z
    .string()
    .describe(
      "what you ran and what came back: the command and the lines that decided it, a test " +
        'summary, a link to the change, or a screenshot url. "it works" is a claim, not evidence',
    );

  server.registerTool(
    "take",
    {
      title: "Take work",
      annotations: ADDS,
      outputSchema: takeOut,
      description:
        "Say you are doing it, and get it. With `id`, that piece of work. With no id, the next " +
        "thing waiting for `repo` — always a new one, never what you hold. While you hold it no " +
        "other agent can take it, and whoever sent it sees you are on it. You may hold several; " +
        "the person watches them. If somebody else has it, the answer says who: tell the user " +
        "rather than doing the work twice. Every answer ends with what to call next.",
      inputSchema: {
        agent: AGENT,
        id: z.string().optional().describe("passalong id; leave out for the next thing waiting"),
        repo: z
          .string()
          .optional()
          .describe("owner/repo the work is in; omit for work for no repo"),
        any: z.boolean().optional().describe("work for another repo — only when the user asks"),
      },
    },
    async (args) => {
      const res = await call("POST", "/v1/take", {
        agent: args.agent,
        ...(args.id ? { id: args.id } : {}),
        repo: args.repo ?? "",
        any: args.any === true,
      });
      if (res.status >= 400) return refused(res.text);
      const parsed = JSON.parse(res.text) as Answer & {
        guide: { id: string; markdown?: string; resumed?: boolean } | null;
        replies?: unknown;
      };
      const g = parsed.guide;
      if (!g)
        return {
          ...text(nextNote(parsed) || "Nothing is waiting for you. Tell the user, and stop."),
          structuredContent: parsed as Record<string, unknown>,
        };
      // Taking work is opening it, so it arrives with the work it came out of in front.
      const from = await parentOf(call, g.id);
      const said = repliesNote(parsed.replies);
      return {
        content: [
          ...(said ? [{ type: "text" as const, text: said }] : []),
          ...(from.text ? [{ type: "text" as const, text: from.text }] : []),
          {
            type: "text" as const,
            text:
              `${LEAD}${g.markdown ?? ""}\n\n<!-- passalong: ${g.id} is yours` +
              `${g.resumed ? " (you already held it — carry on from where it was left)" : ""}. -->\n` +
              `${nextNote(parsed, g.id)}\n${AFTER}`,
          },
        ],
        structuredContent: parsed as Record<string, unknown>,
      };
    },
  );

  server.registerTool(
    "progress",
    {
      title: "Report progress",
      annotations: ADDS,
      outputSchema: progressOut,
      description:
        "Say you are still on what you hold, with a one-line note the hub shows. 30 minutes " +
        "without one marks it stalled. If the answer says you no longer hold it, stop.",
      inputSchema: {
        id: z.string(),
        agent: AGENT,
        note: z
          .string()
          .optional()
          .describe(
            'one plain sentence in the first person, as you would tell the person: "Reading the ' +
              'settings page to find where the toggle goes." Start it with BLOCKED: when you are ' +
              "stopped and need an answer",
          ),
      },
    },
    async ({ id, agent, note }) =>
      answer(call, "PUT", `/v1/guides/${encodeURIComponent(id)}/progress`, id, {
        agent,
        ...(note ? { note } : {}),
      }),
  );

  server.registerTool(
    "hand_in",
    {
      title: "Hand it in",
      annotations: ADDS,
      outputSchema: handInOut,
      description:
        "Finished here, with proof. IT IS FINAL: the work goes to Done with what you showed, and " +
        "nobody reviews it after you (anyone can reopen it with a reason). So SHOW IT: a " +
        "screenshot for anything with a screen — before and after, for a defect — or, for " +
        "backend work, the one command and the line of its output that shows it works. Send " +
        "`evidence`: the commands you ran and the lines that decided it, the test summary, the " +
        "link to the change. A check only a picture can answer goes in `checks`, with the line " +
        "add_file returned in `ran` — this server has no shell to run a command, and an account " +
        "of what you saw is refused. DO NOT write new work to carry your evidence: it belongs on " +
        "this call. What you had to adapt goes in `writeup`; what you learned about the project " +
        "goes into its documents (save_document).",
      inputSchema: {
        id: z.string(),
        agent: AGENT,
        evidence: EVIDENCE.optional(),
        checks: z
          .array(
            // A bare string is a check line with nothing behind it. Let it through to the server's
            // refusal, which says what to send, rather than a schema error that says only "expected
            // object".
            z.preprocess(
              (v) => (typeof v === "string" ? { check: v } : v),
              z.object({
                check: z
                  .string()
                  .describe("what the work asked for that this answers, in its own words"),
                says: z
                  .string()
                  .optional()
                  .describe(
                    'what happened, in one plain sentence for a PERSON: "The badge reads 3 after ' +
                      'a reload." It is the row they read; the evidence stays folded behind it',
                  ),
                ran: EVIDENCE,
              }),
            ),
          )
          .optional()
          .describe("one entry per thing the work asked for that a picture shows"),
        note: z
          .string()
          .describe(
            "one plain sentence, in the first person, saying what you did and how it went: " +
              '"Added the toggle to Settings; it survives a reload." It is the first thing the ' +
              "person reads, and the evidence is behind it",
          ),
        writeup: z
          .string()
          .optional()
          .describe(
            "what you had to adapt to make it work here — a version, a name, a step the work did " +
              "not mention. 500 characters at most. Optional; leave it out when it went as written",
          ),
        risk: z
          .string()
          .optional()
          .describe(
            "what this could break, in one line: a shared helper changed, a migration that " +
              "cannot be undone, a route other clients call. Optional; leave it out when there is " +
              'nothing specific, rather than writing "low risk"',
          ),
        pr: z.string().optional().describe("PR, branch or commit link"),
      },
    },
    async (args) =>
      answer(call, "POST", `/v1/guides/${encodeURIComponent(args.id)}/hand_in`, args.id, {
        agent: args.agent,
        note: args.note,
        evidence: args.evidence ?? "",
        ...(args.checks?.length ? { checks: args.checks } : {}),
        // Each sent only when there is something to say.
        ...(args.writeup ? { writeup: args.writeup } : {}),
        ...(args.risk ? { risk: args.risk } : {}),
        ...(args.pr ? { pr: args.pr } : {}),
      }),
  );

  server.registerTool(
    "pass",
    {
      title: "Pass it",
      annotations: ADDS,
      outputSchema: passOut,
      description:
        "Not yours to do, or you are stuck: give it back with the reason. It is open again, and " +
        "the reason goes to whoever is next — say why, or they start where silence left them.",
      inputSchema: {
        id: z.string(),
        agent: AGENT,
        why: z.string().describe("one line: why it is not yours, or where you got stuck"),
      },
    },
    async ({ id, agent, why }) =>
      answer(call, "POST", `/v1/guides/${encodeURIComponent(id)}/pass`, id, { agent, why }),
  );

  server.registerTool(
    "ask",
    {
      title: "Ask the person",
      annotations: ADDS,
      outputSchema: askOut,
      description:
        "You need the person's answer before you can go on. Ask one clear question, with the " +
        "context it needs to be answered without opening your conversation. You keep what you " +
        "hold and nobody else can take it. Then STOP and tell the user you are waiting: do not " +
        "carry on guessing. When they have replied, call take with this id and their reply comes " +
        "back with it. Use `pass` instead when the work is not yours.",
      inputSchema: {
        id: z.string(),
        agent: AGENT,
        question: z
          .string()
          .describe(
            "one clear question in the first person, a few sentences at most, plain text: " +
              '"Should the dark-mode toggle live in Settings or the header? The header is ' +
              'crowded on mobile." What you were about to do, if they just say yes, helps',
          ),
      },
    },
    async ({ id, agent, question }) =>
      answer(call, "POST", `/v1/guides/${encodeURIComponent(id)}/ask`, id, { agent, question }),
  );

  // ---- work: create_work, find_work, update_work ------------------------------------------------

  server.registerTool(
    "create_work",
    {
      title: "Write work down",
      // Every item is new work, so nothing is replaced; files are fetched from outside.
      annotations: { ...ADDS, openWorldHint: true },
      outputSchema: createOut,
      description:
        "Write down work someone must still do: one piece, or several at once — a plan broken " +
        "into steps, or every defect a test run turned up, each its own item so each can be " +
        "taken on its own. Check what is open first (find_work): if this session answers " +
        "something you hold, hand_in that instead. Each item is Ready at once and reaches whoever " +
        "it is for; `draft: true` holds them all for a person to read first. Pictures and files " +
        "the user gave you go in `files`, each item naming its own by position (`files: [0]`); " +
        "with one item, every file goes to it. A line from add_file goes in `body` instead. " +
        "Knowledge is not work: what someone needs to know goes into a project's documents.",
      inputSchema: {
        files: z
          .array(fileInput)
          .optional()
          .describe("files the user gave you, filled in by the client; each item names its own"),
        items: z
          .array(
            z.object({
              title: z.string().describe("what it is, in a few words"),
              summary: z
                .string()
                .describe(
                  "one or two plain sentences for a PERSON, no ids or paths: what this is and " +
                    "whether anybody has to act. 400 characters at most",
                ),
              body: z
                .string()
                .optional()
                .describe(
                  "markdown for whoever does it: what is wrong or wanted, what you found, what " +
                    "done looks like if you know — in whatever shape fits",
                ),
              files: z
                .array(z.number().int().min(0))
                .default([])
                .describe("positions in the top-level `files` that belong to this item, from 0"),
              to: z
                .string()
                .optional()
                .describe("who it is for, when not the same as the top-level `to`"),
              parent: z
                .string()
                .optional()
                .describe("id of the work this comes out of — a bigger piece, a customer request"),
              after: z
                .array(z.number().int())
                .optional()
                .describe("positions (from 0) of earlier items this one needs done first"),
              repo: z.string().optional().describe("owner/repo it is for, when there is one"),
              tags: z
                .array(z.string())
                .optional()
                .describe(
                  "words that describe it, e.g. bug, feature, question; nothing turns on one",
                ),
            }),
          )
          .min(1)
          .max(20),
        to: z
          .string()
          .optional()
          .describe(
            "team slug, team/@handle for one teammate, team/@ada,@bola for several, or " +
              "team/#group for the people who do a thing; default is your team when you are in one",
          ),
        draft: z
          .boolean()
          .optional()
          .describe("hold it all in Draft for a person to read and make Ready"),
      },
      _meta: { "openai/fileParams": ["files"] },
    },
    async ({ items, to, draft, files = [] }) => {
      // Order and files are settled before anything is written. A guess — every file on every
      // item — puts one defect's screenshot on another, which is worse than no screenshot.
      for (const [i, w] of items.entries())
        for (const j of w.after ?? [])
          if (!Number.isInteger(j) || j < 0 || j >= i)
            return failed(`item ${i} ("${w.title}") can only wait on an earlier one, not ${j}`);
      const claims = items.map((w) =>
        items.length === 1 && !w.files.length ? files.map((_, i) => i) : w.files,
      );
      const out = claims.flat().find((i) => i >= files.length);
      if (out !== undefined)
        return failed(`an item names file ${out}, but only ${files.length} were passed`);
      const unclaimed = files.map((_, i) => i).filter((i) => !claims.some((c) => c.includes(i)));
      if (unclaimed.length)
        return failed(
          `file ${unclaimed.join(", ")} belongs to no item: list each file's position in the ` +
            "`files` of the item it shows",
        );
      // Stored before anything is written, so a file that cannot be fetched leaves nothing half-done.
      const stored = await storeFiles(call, files);
      if ("error" in stored) return failed(stored.error);

      // With no team named, the one you are in: the same as the CLI's current team, and nothing
      // is guessed when you are in several or none.
      let fallback = "";
      if (!String(to || "").trim() || items.some((w) => !w.to)) {
        const me = await get<{ teams?: { slug: string }[] }>("/v1/me", {});
        if (me.teams?.length === 1) fallback = me.teams[0]?.slug ?? "";
      }

      // One at a time: they are writes against a rate limit, and a partial failure should be
      // able to say which already landed.
      const made: { id: string; title: string; url: string; status: string }[] = [];
      for (const [n, w] of items.entries()) {
        const [team = "", who = ""] = String(w.to || to || fallback).split("/");
        const id = newId();
        const lines = [...new Set(claims[n])].map((i) => stored.lines[i] as string);
        const markdown = workDocument({
          ...w,
          body: [w.body ?? "", ...lines].filter(Boolean).join("\n\n"),
          blocked: (w.after ?? []).map((j) => made[j]?.id as string),
          draft: draft === true,
          team: team.trim(),
          to: who.trim(),
        });
        const res = await call(
          "PUT",
          `/v1/guides/${id}`,
          w.parent ? { markdown, parent: w.parent } : { markdown },
        );
        if (res.status >= 400)
          return failed(`wrote ${made.length} of ${items.length} before failing: ${res.text}`);
        made.push({
          id,
          title: w.title,
          url: (JSON.parse(res.text) as { url: string }).url,
          status: draft ? "draft" : "ready",
        });
      }
      const result = {
        work: made,
        ...(draft
          ? { next: `in Draft: ask the user to read it and mark it Ready at ${origin}/hub/work` }
          : {}),
      };
      return { ...text(JSON.stringify(result, null, 2)), structuredContent: result };
    },
  );

  server.registerTool(
    "find_work",
    {
      title: "Find work",
      annotations: READS,
      outputSchema: findOut,
      description:
        "READ work without taking it. With `id`, that piece of work — its markdown, read only; " +
        "work over 20,000 characters comes back as an outline unless you ask for `section` or " +
        "`full`. With `query`, the work whose words match. With neither, the board: what needs " +
        "the user, who is on what, and what is ready — hosts that draw MCP Apps show it as one. " +
        "To DO the work, call take instead: it is the only way anyone learns somebody picked it up.",
      inputSchema: {
        id: z.string().optional().describe("passalong id, e.g. k3mq2xa7"),
        query: z.string().optional().describe("words to look for in titles, tags and text"),
        scope: z
          .string()
          .optional()
          .describe('with query: "all" (default), "mine", or a team slug'),
        section: z
          .string()
          .optional()
          .describe("with id: only the part under this heading; see the outline"),
        full: z.boolean().optional().describe("with id: the whole text, however long"),
      },
      _meta: { ui: { resourceUri: WORK_UI }, "ui/resourceUri": WORK_UI },
    },
    async ({ id, query, scope, section, full }) => {
      if (id) {
        const res = await call("GET", `/v1/guides/${encodeURIComponent(id)}?peek=1`);
        if (res.status >= 400) return failed(res.text);
        // Work over 20,000 characters is read by its outline first, and one part at a time.
        // Mirrors find_work in packages/passalong/src/mcp.js.
        if (section || (!full && res.text.length > GUIDE_WARN)) {
          const part = section ? sectionOf(res.text, section) : null;
          const rows = outlineOf(res.text)
            .filter((h) => h.level <= 3)
            .map(
              (h) =>
                `${"  ".repeat(h.level - 1)}- ${h.heading} (${h.chars.toLocaleString("en")} chars)`,
            );
          const shown = part
            ? part.text
            : [
                section ? `No heading matching "${section}".` : "",
                `${id}: ${res.text.length.toLocaleString("en")} characters. Sections:`,
                ...rows,
                `Read one with find_work id=${id} section="<heading>", or all of it with full=true.`,
              ]
                .filter(Boolean)
                .join("\n");
          return { ...text(shown), structuredContent: { id, markdown: shown, partial: true } };
        }
        const from = await parentOf(call, id);
        return {
          content: [
            ...(from.text ? [{ type: "text" as const, text: from.text }] : []),
            { type: "text" as const, text: res.text },
            {
              type: "text" as const,
              text: `<!-- passalong: reading it does not make it yours: to work on it, call take ${id}. -->`,
            },
          ],
          // The document untouched, for a client that reads results as data.
          structuredContent: { id, markdown: res.text, parent: from.id },
        };
      }
      if (query) {
        const params = new URLSearchParams({ q: query, ...(scope ? { scope } : {}) });
        const res = await call("GET", `/v1/guides?${params}`);
        if (res.status >= 400) return failed(res.text);
        const result = { work: (JSON.parse(res.text) as { guides: unknown[] }).guides };
        return { ...text(JSON.stringify(result, null, 2)), structuredContent: result };
      }
      const b = await board();
      const lines = [
        `${b.counts.needs} need you · ${b.counts.working} being worked on · ${b.counts.open} open`,
        ...b.needs.map((n) => `- needs you: ${n.title} (${n.id}) — ${n.why}`),
        ...b.working.map(
          (w) => `- ${w.who} on ${w.title} (${w.id})${w.note ? ` — “${w.note}”` : ""}`,
        ),
        ...b.ready.map((t) => `- ready: ${t.title} (${t.id})${t.to ? ` for ${t.to}` : ""}`),
        `The board: ${b.hub}/work`,
      ];
      return { ...text(lines.join("\n")), structuredContent: b };
    },
  );

  server.registerTool(
    "update_work",
    {
      title: "Change work",
      // Destructive because `markdown` replaces the text that was there.
      annotations: REMOVES,
      outputSchema: updateOut,
      description:
        "Change work that exists, when the person asks or when you wrote it. `status`: ready " +
        "(whoever it is for may take it), draft (held for a person to read), or archived (off the " +
        "board; it comes back to Draft). `to`: who it is for — @handle, several as @ada,@bola, " +
        '#group, or "" for the whole team; whoever held it and is left out has it taken back and ' +
        "is told. `markdown`: its whole text, frontmatter first, as find_work gave it — say " +
        "what changed, keep what did not.",
      inputSchema: {
        id: z.string(),
        status: z.enum(["ready", "draft", "archived"]).optional(),
        to: z.string().optional().describe('"@handle", "@ada,@bola", "#group", or "" for the team'),
        markdown: z
          .string()
          .optional()
          .describe("the whole document, frontmatter first, to replace its text"),
      },
    },
    async ({ id, status, to, markdown }) => {
      if (!markdown && !status && to === undefined)
        return failed("say what to change: status, to, or markdown");
      const at = `/v1/guides/${encodeURIComponent(id)}`;
      const done: Record<string, unknown> = { id };
      for (const [method, path, body, key] of [
        markdown ? ["PUT", at, { markdown }, "url"] : null,
        to !== undefined ? ["POST", `${at}/assign`, { to }, "to"] : null,
        status ? ["PATCH", `${at}/status`, { status: STATUS[status] }, "status"] : null,
      ].filter(Boolean) as [string, string, unknown, string][]) {
        const res = await call(method, path, body);
        if (res.status >= 400) return failed(res.text);
        const said = JSON.parse(res.text) as Record<string, unknown>;
        done[key] = key === "status" ? status : (said[key] ?? to);
      }
      return { ...text(JSON.stringify(done, null, 2)), structuredContent: done };
    },
  );

  // ---- projects and documents -------------------------------------------------------------------

  server.registerTool(
    "find_projects",
    {
      title: "Find projects",
      annotations: READS,
      outputSchema: projectsOut,
      description:
        "With `id`, one project: its documents, files and the projects inside it. With `query`, " +
        "the projects whose name, description or any document mentions those words, each naming " +
        "its matching documents. With neither, every project you can see. Each answer's `space` " +
        'says where it lives: private, or a named team; `repo` is the repo it is built from, "" ' +
        "when it has none. Read that repo when you write or check its documents.",
      inputSchema: {
        id: z.string().optional().describe("project id"),
        query: z.string().optional().describe("words to look for in projects and their documents"),
        scope: z.string().optional().describe('"all" (default), "mine", or a team slug'),
      },
    },
    async ({ id, query, scope }) => {
      if (id) return relay(call, "GET", `/v1/folders/${encodeURIComponent(id)}`);
      const params = new URLSearchParams(
        Object.entries({ scope: scope || "", q: query || "" }).filter(([, v]) => v),
      ).toString();
      return relay(call, "GET", `/v1/folders${params ? `?${params}` : ""}`);
    },
  );

  server.registerTool(
    "save_project",
    {
      title: "Save a project",
      annotations: ADDS,
      outputSchema: projectOut,
      description:
        "With no `id`, make a project, after find_projects shows none fits: a `title` and a short " +
        "`description`, and its `repo` when it has one. Leave out `team` for a private one, and " +
        "pass a team slug only when the person wants it shared; `parent` puts it inside another, " +
        'in that one\'s space. With `id`, change its title, description, repo ("" for none), ' +
        'colour or place (`parent` "" for the top level); ' +
        "its space never changes. The answer's `space` says where it is: tell the person.",
      inputSchema: {
        id: z.string().optional().describe("the project to change; leave out to make one"),
        title: z.string().optional().describe("name of the product or body of work"),
        description: z.string().optional().describe("what it is for, in a line"),
        team: z.string().optional().describe("new project only: team slug; omit for private"),
        parent: z.string().optional().describe('project to put it inside; "" for the top level'),
        color: z.enum(["", "coral", "amber", "green", "blue", "violet"]).optional(),
        repo: z
          .string()
          .optional()
          .describe('the repo it is built from, e.g. github.com/acme/billing; "" for none'),
      },
    },
    async ({ id, title, description, team, parent, color, repo }) => {
      if (!id) {
        if (!title) return failed("a new project needs a `title`");
        return relay(call, "POST", "/v1/folders", {
          title,
          description,
          team,
          parent,
          color,
          repo,
        });
      }
      if (team) return failed("a project's space does not change; leave out `team`");
      return relay(
        call,
        "PATCH",
        `/v1/folders/${encodeURIComponent(id)}`,
        Object.fromEntries(
          Object.entries({ title, description, parent, color, repo }).filter(
            ([, v]) => v !== undefined,
          ),
        ),
      );
    },
  );

  const doc = (project: string, document: string) =>
    `/v1/folders/${encodeURIComponent(project)}/documents/${encodeURIComponent(document)}`;

  server.registerTool(
    "read_document",
    {
      title: "Read a document",
      annotations: READS,
      outputSchema: documentOut,
      description:
        "One document's Markdown and its `version`, which save_document needs. `history: true` " +
        "lists its earlier versions, newest first; `version` returns that version's text. To " +
        "bring one back, save it over the current version.",
      inputSchema: {
        project: z.string().describe("project id"),
        document: z.string().describe("document id"),
        history: z.boolean().optional().describe("list its earlier versions"),
        version: z.number().int().positive().optional().describe("read this earlier version"),
      },
    },
    async ({ project, document, history, version }) =>
      relay(
        call,
        "GET",
        history || version
          ? `${doc(project, document)}/revisions${version ? `/${version}` : ""}`
          : doc(project, document),
      ),
  );

  server.registerTool(
    "save_document",
    {
      title: "Save a document",
      annotations: ADDS,
      outputSchema: documentOut,
      description:
        "Write what someone needs to know into a project. With no `document`, a new one: `name` " +
        "and `body`. With `document`, change it: `body` with the `version` read_document gave you " +
        "— a newer edit is refused, so nobody's writing is lost — and/or `name` to rename it, " +
        "and/or `move_to` another project in the same space. Its id and history stay. Update the " +
        "page that already covers something rather than adding another. A document has no owner " +
        "and no state and tells nobody: anything someone must still act on is work (create_work).",
      inputSchema: {
        project: z.string().describe("project id"),
        document: z.string().optional().describe("the document to change; leave out for a new one"),
        name: z
          .string()
          .optional()
          .describe("its name: required for a new one, a rename otherwise"),
        body: z.string().optional().describe("the whole Markdown text"),
        version: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("with `body` on an existing document: the version you read"),
        move_to: z.string().optional().describe("a project id in the same space to move it into"),
      },
    },
    async ({ project, document, name, body, version, move_to }) => {
      if (!document) {
        if (!name || body === undefined) return failed("a new document needs `name` and `body`");
        return relay(call, "POST", `/v1/folders/${encodeURIComponent(project)}/documents`, {
          name,
          body,
        });
      }
      if (body === undefined && !name && !move_to)
        return failed("say what to change: `body` with `version`, `name`, or `move_to`");
      let saved: Awaited<ReturnType<typeof relay>> | undefined;
      if (body !== undefined) {
        if (!version) return failed("send the `version` read_document gave you with `body`");
        saved = await relay(call, "PUT", doc(project, document), { version, body });
        if ("isError" in saved) return saved;
      }
      if (name || move_to)
        saved = await relay(call, "PATCH", doc(project, document), {
          ...(name ? { name } : {}),
          ...(move_to ? { folder: move_to } : {}),
        });
      return saved as Awaited<ReturnType<typeof relay>>;
    },
  );

  server.registerTool(
    "delete_document",
    {
      title: "Delete a document",
      annotations: REMOVES,
      outputSchema: removedOut,
      description:
        "Delete one document, with its earlier versions. It cannot be brought back, so do it only " +
        "when the person asked for that document to go; to change what it says, use save_document.",
      inputSchema: { project: z.string(), document: z.string() },
    },
    async ({ project, document }) => relay(call, "DELETE", doc(project, document)),
  );

  // ---- files -------------------------------------------------------------------------------------

  /**
   * A file into Passalong, two ways. A client that fills file inputs (`openai/fileParams`: ChatGPT
   * declares which inputs are files and fills them with a `download_url` its own host serves) passes
   * `file`, and the bytes never pass through the model. An agent that holds the file in a sandbox
   * passes nothing and gets a one-time link to send it to with curl (`POST /v1/uploads`, spent by
   * `PUT /v1/uploads/:token`; see uploads.ts). Either way the upload route does its own checking.
   */
  server.registerTool(
    "add_file",
    {
      title: "Add a file",
      annotations: { ...ADDS, openWorldHint: true },
      outputSchema: fileOut,
      description:
        "Put a picture or any other file into Passalong and get back the markdown line that " +
        "points at it. With `file` (a file the user gave you, filled in by the client), it is " +
        "stored now. Without it, you get a one-time upload link and the curl command that sends " +
        "the file to it: run that where the file is — a code sandbox, a disk — and its JSON " +
        "answer has the line. The link works once and expires in 10 minutes; never base64 a file " +
        "into a tool call instead. If the command cannot reach passalong.dev, the sandbox's " +
        `network settings block it: tell the user to allow that domain. ${vocabulary.shotTypes}; ` +
        "other files up to 10MB. " +
        WHERE_THE_LINE_GOES,
      inputSchema: {
        file: fileInput.optional().describe("the file the user gave you, filled in by the client"),
        project: z.string().optional().describe("keep it in this project instead"),
        name: z
          .string()
          .optional()
          .describe("for an upload link: the filename with its extension, which says what it is"),
        kind: z
          .enum(["image", "file"])
          .optional()
          .describe(
            "for an upload link: `image` (the default) for a picture, `file` for a log, PDF, CSV " +
              "or zip. The link takes only what it was made for",
          ),
      },
      _meta: { "openai/fileParams": ["file"] },
    },
    async ({ file, project, name, kind }) => {
      if (file) {
        if (project) return addProjectFile(call, project, file);
        const stored = await storeFile(call, file);
        if ("error" in stored) return failed(stored.error);
        const result = { id: stored.id, url: stored.url, markdown: stored.line };
        return {
          ...text(
            `${JSON.stringify(result, null, 2)}\n\nThe line that points at it:\n${stored.line}`,
          ),
          structuredContent: result,
        };
      }
      const res = await call(
        "POST",
        "/v1/uploads",
        project
          ? { folder: project, name: name ?? "" }
          : { name: name ?? "", kind: kind ?? "image" },
      );
      if (res.status >= 400) return failed(res.text);
      const { upload_url, expires } = JSON.parse(res.text) as {
        upload_url: string;
        expires: string;
      };
      // PUT spelled out, and no content-type: the route reads the type from the bytes, so the one
      // thing an agent could get wrong in this command is not in it.
      const command = `curl -sS --fail-with-body -X PUT --data-binary @FILE_PATH '${upload_url}'`;
      return {
        ...text(
          `Upload link (one use, expires ${expires}):\n${upload_url}\n\n` +
            `Run this where the file is, with FILE_PATH replaced by its path:\n${command}\n\n` +
            (project
              ? "The response is the project's new file."
              : "The response's `markdown` is the line that points at it."),
        ),
        structuredContent: { upload_url, expires, command },
      };
    },
  );

  server.registerTool(
    "read_file",
    {
      title: "Read a file",
      annotations: READS,
      outputSchema: readFileOut,
      description:
        "Read a picture or a small text file kept in a project into this conversation. Other " +
        "files stay downloads in the hub.",
      inputSchema: { project: z.string(), file: z.string().describe("file id") },
    },
    async ({ project, file }) => projectFile(call, project, file),
  );

  server.registerTool(
    "delete_file",
    {
      title: "Delete a file",
      annotations: REMOVES,
      outputSchema: removedOut,
      description:
        "Delete one file from a project. It cannot be brought back, so do it only when the person " +
        "asked for that file to go.",
      inputSchema: { project: z.string(), file: z.string().describe("file id") },
    },
    async ({ project, file }) =>
      relay(
        call,
        "DELETE",
        `/v1/folders/${encodeURIComponent(project)}/assets/${encodeURIComponent(file)}`,
      ),
  );

  return server;
}

/** The CLI's alphabet, so an id minted here is indistinguishable from one minted there. */
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function newId(length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += ID_ALPHABET[(bytes[i] as number) % ID_ALPHABET.length];
  return out;
}

/**
 * Answer one MCP request.
 *
 * A server and a transport per request, both closed when it is done. That is the stateless shape
 * the transport documents, and on a Worker it is the only honest one: the next request may not
 * reach this isolate.
 */
export async function handleMcp(
  request: Request,
  call: Call,
  vocabulary: Vocabulary,
): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // Plain JSON rather than an SSE stream: every tool here answers in one message, and a stream
    // that carries exactly one event is a stream for the sake of it.
    enableJsonResponse: true,
  });
  const server = buildServer(call, vocabulary, new URL(request.url).origin);
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

/**
 * The work board as an MCP App: one self-contained page the host draws in a sandboxed frame.
 *
 * It speaks the MCP Apps protocol (2026-01-26) over postMessage: `ui/initialize` to start, then it
 * draws whatever `ui/notifications/tool-result` carries. Refresh calls `find_work` again; every
 * link goes through `ui/open-link`, because a sandboxed frame cannot navigate on its own. Nothing is
 * loaded from anywhere, so it needs no CSP domains. Colours follow the host's theme when it says
 * one, and the system's when it does not.
 */
const WORK_APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your work</title>
<style>
  :root { --bg:#fbfaf7; --fg:#1c1b19; --muted:#6b675f; --line:#e7e3da; --raised:#ffffff; --accent:#b5451b; --ok:#3f6b45; --warn:#9a6a12; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#141310; --fg:#ece8df; --muted:#a39e93; --line:#2e2b25; --raised:#1c1a16; --accent:#e5825a; --ok:#86c493; --warn:#e0b25c; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#141310; --fg:#ece8df; --muted:#a39e93; --line:#2e2b25; --raised:#1c1a16; --accent:#e5825a; --ok:#86c493; --warn:#e0b25c; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  h1 { margin: 0; font-size: 16px; font-weight: 600; }
  .top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .counts { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
  .counts b { color: var(--fg); font-weight: 600; font-variant-numeric: tabular-nums; }
  h2 { margin: 16px 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  ul { margin: 0; padding: 0; list-style: none; border-radius: 12px; background: var(--raised); box-shadow: 0 0 0 1px var(--line); overflow: hidden; }
  li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; }
  li + li { border-top: 1px solid var(--line); }
  .dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 99px; background: var(--accent); }
  .dot.ok { background: var(--ok); } .dot.warn { background: var(--warn); } .dot.idle { background: var(--muted); opacity: .45; }
  .grow { min-width: 0; flex: 1; }
  .title { font-weight: 600; overflow-wrap: anywhere; }
  .sub { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
  .id { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); }
  .clear { padding: 10px 12px; border-radius: 12px; background: var(--raised); box-shadow: 0 0 0 1px var(--line); color: var(--muted); }
  .clear b { color: var(--fg); }
  button { font: inherit; font-size: 13px; cursor: pointer; border-radius: 8px; padding: 6px 10px; border: 0; box-shadow: 0 0 0 1px var(--line); background: var(--raised); color: var(--fg); transition: scale .15s; }
  button:active { scale: .96; }
  button.primary { background: var(--accent); color: #fff; box-shadow: none; }
  .actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  .link { flex: none; padding: 4px 8px; }
  .empty { color: var(--muted); padding: 24px 0; text-align: center; }
  .choices { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; padding: 6px; border-radius: 10px; background: var(--bg); box-shadow: 0 0 0 1px var(--line); }
  .choice { display: flex; justify-content: space-between; gap: 8px; text-align: left; box-shadow: none; background: transparent; }
  .choice:hover { background: var(--raised); }
  .choice.on { font-weight: 600; }
  .note { margin: 4px 6px 2px; color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
<div id="app"><p class="empty">Loading your work…</p></div>
<script>
(() => {
  let seq = 0;
  const pending = new Map();
  const post = (msg) => window.parent.postMessage(msg, "*");
  const request = (method, params) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    post({ jsonrpc: "2.0", id, method, params });
  });
  const notify = (method, params) => post({ jsonrpc: "2.0", method, params: params || {} });
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const app = document.getElementById("app");
  let board = null;

  function theme(ctx) {
    const t = ctx && (ctx.theme || (ctx.hostContext && ctx.hostContext.theme));
    if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
  }

  function size() {
    notify("ui/notifications/size-changed", { height: document.documentElement.scrollHeight });
  }

  function open(url) {
    if (url) request("ui/open-link", { url });
  }

  function row(dot, title, sub, id, url, label, assign) {
    return '<li><span class="dot ' + dot + '"></span><div class="grow"><div class="title">' + esc(title) +
      '</div><div class="sub">' + sub + (id ? ' <span class="id">' + esc(id) + '</span>' : "") + '</div>' +
      (assign ? picker(assign) : "") + '</div>' +
      (assign ? '<button class="link" data-give="' + esc(id) + '">Give to…</button>' : "") +
      (url ? '<button class="link" data-url="' + esc(url) + '">' + esc(label || "Open") + '</button>' : "") + '</li>';
  }

  // "Give to…" opens the choices under the row. The app may call update_work itself for this; the
  // server still refuses anyone who may not move the work.
  let giving = null;
  function picker(a) {
    if (giving !== a.id) return "";
    const choices = (board.teams && board.teams[a.team]) || [];
    return '<div class="choices">' + choices.map((c) =>
      '<button class="choice' + (c.to === a.to ? " on" : "") + '" data-assign="' + esc(a.id) + '" data-to="' + esc(c.to) + '">' +
      esc(c.label) + ' <span class="id">' + esc(c.hint) + '</span></button>').join("") +
      '<p class="note">Whoever has it now and is left out gets it taken back, and is told.</p></div>';
  }

  function render(b) {
    // find_work answers with one piece of work or a search too, and those are read in the
    // conversation: the frame draws only the board.
    if (!b || !b.counts) {
      app.innerHTML = "";
      size();
      return;
    }
    board = b;
    const c = b.counts;
    let html = '<div class="top"><div><h1>Your work</h1><p class="counts"><b>' + c.needs + '</b> need you · <b>' +
      c.working + '</b> being worked on · <b>' + c.open + '</b> open · <b>' + c.done + '</b> done</p></div></div>';
    html += '<h2>Needs you</h2>';
    html += b.needs && b.needs.length
      ? '<ul>' + b.needs.map((n) => row("", n.title, esc(n.why), n.id, n.url, "Open")).join("") + '</ul>'
      : '<div class="clear"><b>Nothing needs you.</b> Drafts to read and agents waiting on you land here.</div>';
    if (b.working && b.working.length) {
      html += '<h2>Working now</h2><ul>' + b.working.map((w) => row(w.stalled ? "warn" : "ok", w.title,
        esc(w.who) + (w.stalled ? " · went quiet" : "") + (w.note ? " · “" + esc(w.note) + "”" : ""), w.id, w.url, "Open")).join("") + '</ul>';
    }
    if (b.ready && b.ready.length) {
      html += '<h2>Ready for an agent</h2><ul>' + b.ready.map((t) => row("idle", t.title,
        t.to ? "for " + esc(t.to) : "waiting for whoever takes it next", t.id, t.url, "Open",
        t.team ? { id: t.id, team: t.team, to: t.to || "" } : null)).join("") + '</ul>';
    }
    html += '<div class="actions"><button class="primary" data-url="' + esc(b.hub) + '">Open the hub</button><button id="refresh">Refresh</button></div>';
    app.innerHTML = html;
    size();
  }

  app.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.give) {
      giving = giving === t.dataset.give ? null : t.dataset.give;
      render(board);
      return;
    }
    if (t.dataset.assign) {
      t.disabled = true;
      request("tools/call", { name: "update_work", arguments: { id: t.dataset.assign, to: t.dataset.to } }).then(() => {
        giving = null;
        return request("tools/call", { name: "find_work", arguments: {} });
      }).then((r) => render(r && r.structuredContent));
      return;
    }
    if (t.id === "refresh") {
      t.disabled = true;
      request("tools/call", { name: "find_work", arguments: {} }).then((r) => {
        t.disabled = false;
        render(r && r.structuredContent);
      });
    } else open(t.dataset.url);
  });

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id != null && pending.has(m.id) && ("result" in m || "error" in m)) {
      const done = pending.get(m.id);
      pending.delete(m.id);
      done(m.result || null);
      return;
    }
    if (m.method === "ui/notifications/tool-result") render(m.params && m.params.structuredContent);
    if (m.method === "ui/notifications/host-context-changed") theme(m.params);
  });

  new ResizeObserver(size).observe(document.body);
  request("ui/initialize", {
    protocolVersion: "2026-01-26",
    clientInfo: { name: "passalong-work", version: "1.0.0" },
    appCapabilities: {},
  }).then((r) => {
    theme(r);
    notify("ui/notifications/initialized");
  });
})();
</script>
</body>
</html>`;
