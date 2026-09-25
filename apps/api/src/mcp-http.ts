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
 * app with the caller's own credential. There is one implementation of "publish a guide" and it is
 * the route; if the route changes its rules, the tool changed with it.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

/**
 * How a tool reaches the rest of the API: the app's own fetch, with the caller's credential.
 *
 * `raw` is for the one route that does not take JSON. `POST /v1/shots` reads the body as bytes and
 * the content type as the declaration of what they are, so a tool uploading evidence has to be
 * able to say both. Without it the only way to reach that route from here would be to talk to R2
 * directly, which is the thing this module exists not to do.
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
      // What the call has to carry, under the call it belongs to: an agent that reads this at the
      // end of a long session should not have to remember hand_in takes evidence.
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
  return { ...text(`${res.text}${note ? `\n${note}` : ""}`), structuredContent: parsed };
}

/**
 * Where an attached image's markdown line belongs, which is not always a guide.
 *
 * This tool said one thing — "put that line in the guide body" — and hand_in said "do not publish
 * a guide to carry your evidence". For an agent holding a screenshot as proof of the work it was
 * handing in, those are contradictory, and only one of them named a destination. So it published:
 * six screenshots of a delivered change became a follow-up guide with Problem, Solution shape,
 * Decisions and rationale, Steps, Verification and Gotchas wrapped round them, because that is the
 * template a publishable document has to fill. Fifteen hundred words to deliver six pictures.
 *
 * Mirrors WHERE_THE_LINE_GOES in packages/passalong/src/mcp.js.
 */
const WHERE_THE_LINE_GOES =
  "WHERE THE LINE GOES DEPENDS ON WHAT THE IMAGE IS EVIDENCE OF. Proof that work you are handing i" +
  "n holds — a screen that renders right, a total that matches — goes in that check's `ran` on han" +
  "d_in, and nothing is published: a check answered with a picture is shown, which is what the han" +
  "d-in asks for. Only an image that is part of a DOCUMENT goes in a guide body — the screenshot i" +
  "n a bug report, a diagram a guide is explaining — and then it must be in the markdown, because " +
  "a guide travels as markdown to whoever holds its link and evidence beside the document does not" +
  " travel at all; publishing claims whatever the markdown names, so attach first and publish afte" +
  "r. DO NOT PUBLISH A GUIDE TO CARRY SCREENSHOTS. Six images and a caption each is a hand-in, not" +
  " a document, and wrapping them in Problem / Solution shape / Decisions / Steps / Verification t" +
  "o make them publishable is how a set of pictures becomes fifteen hundred words nobody asked for" +
  ". png, jpg, webp or gif.";

/**
 * Said in front of every guide an agent opens, whatever its kind: the hand-in needs evidence, and
 * evidence is collected while the work happens, not reconstructed from memory once it is done.
 * Mirrors KEEP_EVIDENCE in packages/passalong/src/mcp.js.
 */
/**
 * What a screenshot has to be a screenshot OF.
 *
 * "A check is run or shown" made a picture mandatory, and an agent short of one built a page to
 * photograph: it added `src/app/notes-preview`, shot that, then `rm -rf`'d it and published the
 * shots as evidence that the real screen rendered. The rule was satisfied and almost nothing was
 * proved — the measure had become the target, and the page the picture showed no longer existed.
 *
 * Mirrors SHOOT_THE_REAL_THING in packages/passalong/src/mcp.js.
 */
const SHOOT_THE_REAL_THING =
  "SHOOT THE RUNNING THING, NOT SOMETHING YOU BUILT TO SHOOT. A screenshot is worth what the sc" +
  "reen behind it is worth: the real route in the real app, reached the way a reader would reac" +
  "h it. A scratch page, a story, a harness or a component rendered on its own is a picture of " +
  "your scaffolding, and it can look right while the thing the guide is about does not. If the " +
  "only way you could get a picture was to build something, that is not evidence the real scree" +
  "n works — say what you built and why in `writeup`, and leave the check to the commands that " +
  "do hold. NEVER DELETE WHAT YOUR EVIDENCE POINTS AT: a shot of a page you removed afterwards " +
  "is one nobody can take again, including you.";

const KEEP_EVIDENCE =
  "KEEP YOUR EVIDENCE AS YOU GO. hand_in needs it: the commands you ran and what came back, the " +
  "test summary, the link to the change. Copy each one when it happens — at the end you will be " +
  "writing from memory, which is the thing evidence is here to replace.\n\n";

/**
 * Said in front of every guide an agent has to locate things in for itself — a bug and a task.
 *
 * The failure it is here to stop: an agent lists one directory, or opens the one file it expected,
 * and concludes from that. It then reports that a thing is absent, or that it found the only
 * occurrence, having never looked past the place it happened to start. The conclusion is confident
 * and wrong, and nothing downstream can tell, because the evidence it brings is real — it is just
 * evidence of a search that was too small.
 *
 * Mirrors SEARCH_WIDE in packages/passalong/src/mcp.js.
 */
const SEARCH_WIDE =
  "SEARCH THE WHOLE TREE BEFORE YOU CONCLUDE. Listing a directory, or reading the one file you " +
  "expected, tells you what is in that directory — not whether the thing exists, and not whether " +
  "you have found all of it. Before you report that something is absent, is the only one, or is " +
  'already handled, search across the repository and let the output be your reason. "I looked" ' +
  "is a claim; the search and what it printed is evidence.\n\n";

/** What to say in front of a guide, by kind. Mirrors leadFor() in packages/passalong/src/mcp.js. */
function leadFor(kind: string) {
  if (kind === "bug")
    return (
      "THIS IS A BUG REPORT, NOT WORK TO REPEAT. Do not follow Reproduce as instructions — " +
      "those steps produce the defect. Fix what Problem describes, then check Verification and " +
      "answer with hand_in.\n\n" +
      SEARCH_WIDE +
      SHOOT_THE_REAL_THING +
      KEEP_EVIDENCE
    );
  if (kind === "task")
    return (
      "THIS IS A TASK: WORK NOBODY HAS DONE YET. There are no Steps to follow — work out how to " +
      "reach Goal within Constraints, and leave Out of scope alone. It is done when every check " +
      "under Acceptance holds.\n\n" +
      SEARCH_WIDE +
      SHOOT_THE_REAL_THING +
      KEEP_EVIDENCE
    );
  // A transfer guide is handed over untouched: it is a document to follow, and anything in front
  // of it is one more thing that is not the document. The reminder still reaches the agent on the
  // answer's `next` line, which is where every other instruction from the server rides.
  return "";
}

/**
 * Output schemas: what each tool hands back, for clients that read results as data.
 *
 * Every object passes through fields it does not name, and almost every field is optional. The
 * routes are the source of truth and add fields freely; a schema that closed the object, or
 * required a field a route stopped sending, would turn a working tool into a validation error.
 * What is named here is what a caller is likely to act on.
 */
const verdictOut = z
  .object({
    ok: z.boolean().optional(),
    by: z.string().optional(),
    note: z.string().optional(),
    at: z.string().optional(),
  })
  .passthrough();

const guideSummaryOut = z
  .object({
    id: z.string(),
    title: z.string().optional(),
    kind: z.string().optional().describe("transfer, bug or task"),
    status: z.string().optional(),
    url: z.string().optional().describe("share link"),
    created: z.string().optional(),
    updated: z.string().optional(),
    source_context: z.string().optional(),
    from: z.string().optional(),
    team: z.string().optional(),
    to: z.string().optional(),
    for_me: z.boolean().optional(),
    report: z.string().optional(),
    parent: z.string().optional(),
    children: z.number().optional(),
    area: z.string().optional(),
    severity: z.string().optional(),
    verdict: verdictOut.nullable().optional(),
    failing: z.boolean().optional(),
  })
  .passthrough();

const guidesOut = z.object({ guides: z.array(guideSummaryOut) }).passthrough();

const boardOut = z
  .object({
    waiting: z.array(guideSummaryOut).optional().describe("handed to you, not taken"),
    failing: z.array(guideSummaryOut).optional().describe("yours, with a failing verdict"),
    in_flight: z.array(guideSummaryOut).optional().describe("handed over, no answer yet"),
    landed: z.array(guideSummaryOut).optional().describe("handed over and verified"),
    unread: z.number().optional(),
  })
  .passthrough();

const logOut = z
  .object({
    log: z.array(
      z
        .object({
          act: z.string().optional(),
          at: z.string().optional(),
          guide: z.string().optional(),
          title: z.string().optional(),
          repo: z.string().optional(),
          url: z.string().optional(),
          note: z.string().optional(),
          text: z.string().optional().describe("the act as one readable line"),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const getGuideOut = z
  .object({
    id: z.string(),
    kind: z.string().describe("transfer, bug or task"),
    markdown: z.string().describe("the document as published, frontmatter first"),
    follow_ups: z
      .array(z.object({ id: z.string(), title: z.string(), markdown: z.string() }).passthrough())
      .describe("more context published under this guide, oldest first"),
  })
  .passthrough();

const publishOut = z
  .object({
    id: z.string(),
    url: z.string().optional().describe("share link"),
    status: z.string().optional(),
    created: z.boolean().optional().describe("false when an existing guide was replaced"),
    team: z.string().optional(),
    to: z.string().optional(),
  })
  .passthrough();

const ackOut = z
  .object({ id: z.string(), taken: z.boolean().optional(), note: z.string().optional() })
  .passthrough();

const verdictResultOut = z
  .object({ id: z.string(), ok: z.boolean().optional(), note: z.string().optional() })
  .passthrough();

const fileBugsOut = z
  .object({
    report: z
      .object({
        id: z.string(),
        title: z.string().optional(),
        environment: z.string().optional(),
      })
      .passthrough(),
    issues: z.array(
      z.object({ id: z.string(), url: z.string().optional(), title: z.string() }).passthrough(),
    ),
  })
  .passthrough();

const uploadOut = z
  .object({
    upload_url: z.string().describe("one-time link that takes the image's bytes"),
    expires: z.string().describe("when the link stops working"),
    command: z.string().describe("the curl command to run where the file is"),
  })
  .passthrough();

const shotOut = z
  .object({
    id: z.string(),
    url: z.string(),
    markdown: z.string().describe("the line to put in the guide body"),
  })
  .passthrough();

const reportOut = z
  .object({
    report: z
      .object({
        id: z.string(),
        title: z.string().optional(),
        environment: z.string().optional(),
        issues: z.number().optional(),
        open: z.number().optional(),
        failing: z.number().optional(),
        areas: z
          .array(
            z
              .object({ area: z.string().optional(), issues: z.array(guideSummaryOut).optional() })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * What heads a guide's follow-ups when they are handed to an agent. Mirrors `FOLLOW_UPS_LEAD` in
 * packages/passalong/src/passalong.js, so an agent reads the same words from either server.
 */
export const FOLLOW_UPS_LEAD =
  "FOLLOW-UPS — more context added to this guide, oldest first. Read them before acting; where " +
  "one contradicts the original, the follow-up is newer.";

/**
 * A guide's follow-ups with their content, formatted to go after the document — or "" when there
 * are none or anything fails. A follow-up is more context for the guide, so whoever opens the
 * original gets them; but context is never worth failing the tool over, since the guide itself is
 * what was asked for. `?markdown=1` records no pull on the children: reading context for a guide is
 * not opening those guides.
 */
async function followUps(
  call: Call,
  id: string,
): Promise<{ text: string; guides: { id: string; title: string; markdown: string }[] }> {
  const none = { text: "", guides: [] };
  try {
    const res = await call("GET", `/v1/guides/${encodeURIComponent(id)}/children?markdown=1`);
    if (res.status >= 400) return none;
    const { guides = [] } = JSON.parse(res.text) as {
      guides?: { id?: string; title?: string; markdown?: unknown }[];
    };
    const withContent = guides
      .filter((g) => g?.id && typeof g.markdown === "string")
      .map((g) => ({
        id: String(g.id),
        title: g.title || "untitled",
        markdown: String(g.markdown).trimEnd(),
      }));
    if (!withContent.length) return none;
    return {
      text: [
        FOLLOW_UPS_LEAD,
        ...withContent.map((g) => `--- follow-up ${g.id}: ${g.title} ---\n${g.markdown}`),
      ].join("\n\n"),
      guides: withContent,
    };
  } catch {
    return none;
  }
}

/**
 * The guide a follow-up came out of, formatted to go in front of it — or "" when there is none.
 *
 * Said before the document, not after, because it changes what the document is: a follow-up read
 * on its own looks like a small piece of work, and is actually a note on a bigger one. Where the
 * parent has got to is part of that — a follow-up to work nobody has started is not work to start.
 *
 * Context is never worth failing the tool over; the guide itself is what was asked for.
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
        `THIS IS A FOLLOW-UP TO ${guide.id}: ${guide.title || "untitled"} — ${state}. It is more ` +
        "context for that guide, not a piece of work on its own. Read the guide it follows first; " +
        "it is below, and where the two disagree this follow-up is newer. If what it asks for " +
        `depends on ${guide.id} being done and it is not, say so rather than starting.\n\n` +
        `--- the guide it follows: ${guide.id} ---\n${String(guide.markdown ?? "").trimEnd()}`,
    };
  } catch {
    return none;
  }
}

/**
 * The product's own vocabulary, handed in rather than imported.
 *
 * `guide.ts` is the single source for the areas and severities, and importing it here would make
 * this module untestable: it is a sibling imported as `./guide.js`, which Node's type stripping
 * cannot resolve, so a test that touches this file would not load at all — the same reason the app
 * itself is not importable, noted in hosts.ts. Passing it in keeps one source and one test.
 */
export interface Vocabulary {
  /** Product area slugs, for the file_bugs schema description. */
  areas: string;
  /** Severity slugs and what they mean. */
  severities: string;
  /** Image media types `/v1/shots` accepts, for the attach_screenshot description. */
  shotTypes: string;
}

/**
 * How many bytes an evidence download is allowed to be before this gives up on it.
 *
 * Not the rule — `/v1/shots` owns that, and answers 413 with the real limit. This only bounds what
 * gets pulled into memory on the way there: `download_url` is a string somebody handed us, and a
 * Worker that reads it to completion before the route ever sees it can be made to read anything.
 * Deliberately above the route's own cap, so the refusal a caller reads is the route's.
 */
const FETCH_MAX = 8 * 1024 * 1024;

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
 * the bytes. Only a top-level input field can be declared a file — which is why the attachments on
 * file_bugs sit beside `issues` and each issue points at them by position.
 */
const fileInput = z.object({
  download_url: z.string().describe("where the file can be fetched (https)"),
  file_id: z.string().describe("the host's id for the file"),
  mime_type: z.string().optional().describe("image/png, image/jpeg, image/webp, image/gif"),
  file_name: z.string().optional().describe("original filename, used as the label"),
});
type FileInput = z.infer<typeof fileInput>;

/**
 * Fetch a client-passed file and store it through `POST /v1/shots`. Returns the markdown line that
 * points at it, or the reason it could not be stored. Shared by every tool that takes a file, so
 * the SSRF guard and the size bound are written once.
 */
async function storeFile(
  call: Call,
  file: FileInput,
): Promise<{ line: string; shot: { id: string; url: string } } | { error: string }> {
  const url = fetchable(file.download_url);
  if (!url) {
    return {
      error:
        "download_url has to be a public https URL. If the image is a file you hold — in a code " +
        "sandbox or on disk — call create_upload and run the command it returns instead.",
    };
  }
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    return { error: `could not fetch the file (${(err as Error).message})` };
  }
  if (!res.ok) return { error: `could not fetch the file: ${res.status} ${res.statusText}` };
  // The declared length is a hint and a lie is free, so the bytes are what gets measured.
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > FETCH_MAX) return { error: "that file is too large to attach" };
  if (!bytes.byteLength) return { error: "that file is empty" };
  // The client's mime_type is what it says the file is; the host's own content-type is what it
  // served. Prefer the served one — `/v1/shots` keys storage off this and refuses what it does
  // not know, so being wrong here is a 415 rather than a mislabelled image.
  const served = (res.headers.get("content-type") || "").split(";")[0]?.trim();
  const type = served || file.mime_type || "";
  const up = await call("POST", "/v1/shots", bytes, {
    contentType: type,
    headers: file.file_name ? { "x-shot-name": file.file_name.replace(/[^\x20-\x7e]/g, "") } : {},
  });
  if (up.status >= 400) return { error: up.text };
  const shot = (JSON.parse(up.text) as { shot: { id: string; url: string } }).shot;
  const label = (file.file_name || "screenshot").replace(/[[\]]/g, "");
  return { line: `![${label}](${shot.url})`, shot };
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
      return { error: `attachment ${i}${name}: ${stored.error}` };
    }
    lines.push(stored.line);
  }
  return { lines };
}

/**
 * Put evidence lines into a guide's markdown: at the end of its Problem section when it has one,
 * where a bug's reader looks first and where `bugDocument` puts them; otherwise at the end.
 */
export function withEvidence(markdown: string, lines: string[]): string {
  if (!lines.length) return markdown;
  const block = lines.join("\n");
  const problem = /^## Problem[ \t]*$/m.exec(markdown);
  if (problem) {
    const after = problem.index + problem[0].length;
    const next = /^## /m.exec(markdown.slice(after));
    if (next) {
      const at = after + next.index;
      return `${markdown.slice(0, at).trimEnd()}\n\n${block}\n\n${markdown.slice(at)}`;
    }
  }
  return `${markdown.trimEnd()}\n\n${block}\n`;
}

/**
 * What each tool does to the world, said out loud. MCP's defaults for a tool that says nothing are
 * the worst case — it writes, it may destroy, it reaches outside — and a client acts on them:
 * ChatGPT badged every tool here, `inbox` included, as a destructive public write.
 *
 * `openWorldHint` is false for everything that stays inside Passalong. Only attach_screenshot and
 * the tools that take attachments fetch a URL somebody else controls.
 */
// The task queue's answers. Open like the rest: the routes add fields freely.
const taskOut = z
  .object({
    task: z
      .object({ id: z.string(), markdown: z.string().optional(), state: z.string().optional() })
      .passthrough()
      .nullable(),
  })
  .passthrough();
const progressOut = z
  .object({ id: z.string(), lease_until: z.string().optional(), note: z.string().optional() })
  .passthrough();
const takeOut = z
  .object({
    guide: z
      .object({ id: z.string(), kind: z.string().optional(), markdown: z.string().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();
const workItem = z.object({ id: z.string(), title: z.string().optional() }).passthrough();
const workOut = z
  .object({
    hub: z.string().optional(),
    counts: z
      .object({ needs: z.number(), working: z.number(), open: z.number(), done: z.number() })
      .partial()
      .passthrough()
      .optional(),
    needs: z.array(workItem).optional(),
    working: z.array(workItem).optional(),
    ready: z.array(workItem).optional(),
  })
  .passthrough();
const assignOut = z
  .object({ id: z.string(), to: z.string().optional(), taken_back: z.number().optional() })
  .passthrough();
const passOut = z.object({ id: z.string(), passed: z.boolean().optional() }).passthrough();
const finishOut = z
  .object({ id: z.string(), state: z.string().optional(), report: z.string().optional() })
  .passthrough();

const READS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const ADDS = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

export function buildServer(call: Call, vocabulary: Vocabulary, origin = "https://passalong.dev") {
  const server = new McpServer(
    { name: "passalong", version: "0.2.0" },
    {
      instructions:
        "Passalong hands work between contexts as guides: markdown with frontmatter, in three " +
        "kinds, and `kind:` in the frontmatter says which. READ IT BEFORE ACTING — each asks " +
        "for different behaviour. Every kind is worked with the same four calls, each with an " +
        "`agent` name you reuse on every call: take (with an id, or none for the next ready task " +
        "for `repo`) says you are doing it and returns it — nobody else can take it there while " +
        "you hold it. progress with a one-line note at each milestone; 30 minutes of silence " +
        "marks it stalled. hand_in when done. pass, with the reason, when it is not yours or you " +
        "are stuck. Every answer ends with `next`: what to call now. Follow it, and when it says " +
        "to stop, stop. If take says somebody else has it, tell the user instead of doing the " +
        "work twice.\n" +
        "EVERY HAND-IN CARRIES EVIDENCE: what you ran and what came back — the command and the " +
        "lines that decided it, a test summary, a link to the change, or a screenshot url. " +
        "Collect it as you work rather than writing it from memory at the end. hand_in without " +
        "it is refused, because the write-up and the verdict are both your word for your own " +
        "work and evidence is the part the person reviewing it can check.\n" +
        "SAY WHICH KIND IT IS. There is no default: a guide with no `kind:` line is refused, and so " +
        "is a spelling that is not one of the three. " +
        "kind: task is work nobody has done yet. It has no Steps: work out how to " +
        "reach Goal within Constraints, leave Out of scope alone, and treat Acceptance as the " +
        "definition of done. When Acceptance holds, publish_guide a transfer guide about what you " +
        "did, then hand_in with its id as `report`.\n" +
        "kind: transfer (or no kind: line) is a finished implementation to repeat here. Follow " +
        "its Steps, adapting anything marked ASSUMES to this codebase; run its Verification, then " +
        "hand_in with ok and, when it failed, a note saying what went wrong.\n" +
        "kind: bug is a defect to FIX here. It has no Steps and nothing in it is a procedure to " +
        "apply: Reproduce is how to see the bug and running it produces the bug, Verification is " +
        "the behaviour that should have happened. Fix the defect, then check Verification and " +
        "hand_in with the result. A bug report is not broken because you reproduced it.\n" +
        "BEFORE PUBLISHING ANYTHING, CHECK WHAT IS ALREADY OPEN: call work, or take with no id, " +
        "and see what you hold. If this session's work answers something you hold, hand_in that — " +
        "never publish a second guide about it. A transfer guide is for work that has to cross a " +
        "boundary: another repo, another machine, a teammate without your branch. Work you " +
        "committed and pushed where the team can already see it has crossed no boundary, and a " +
        "guide about it is one more thing for somebody to read and review; what is worth " +
        "publishing from a session like that is what is still open, as a bug or a task. " +
        '"Update the passalong", "add this to passalong" and the like are ambiguous — hand in ' +
        "what you hold, add a follow-up, or publish something new? Ask which, in one line, rather " +
        "than publishing and leaving the user to undo it.\n" +
        "When you find defects you are not fixing — a test run, a QA pass, a review — call " +
        "file_bugs with all of them at once; each becomes a guide someone can take on its own.\n" +
        "AN IMAGE THE USER SHOWED YOU IS EVIDENCE, NOT CONTEXT. Before filing or publishing, " +
        "attach it with attach_screenshot and pass what it returns as `evidence` — a screenshot " +
        "you described instead of attaching is the most useful thing in the report, thrown away. " +
        "If you hold the image as a file rather than as a file input — in a code sandbox, or on " +
        "disk — call create_upload and run the command it returns; never base64 an image into a " +
        "tool call. " +
        "A guide already filed without one is not stuck: get_guide it, add the markdown line to " +
        "the body, and publish_guide the same id — publishing claims whatever the markdown names.\n" +
        "A FOLLOW-UP IS MORE CONTEXT FOR A GUIDE, WRITTEN AS ITS OWN GUIDE. When a guide needs " +
        "more context — a missing detail, a step that needed explaining, what changed since, what " +
        "you found doing it — publish that context with publish_guide `parent` set to the guide's " +
        "id. It is listed under the original, and anyone who opens the original, person or agent, " +
        "gets it too. take and get_guide return a guide's follow-ups after it; read them before " +
        "acting. They also return the guide it follows, in front of it: a follow-up is a note on " +
        "a bigger piece of work, not the work. If it needs that guide done and it is not, say so " +
        "rather than starting.\n" +
        "If you were taught next_task, task_progress, finish_task, ack_guide or verify_guide, " +
        "those are gone: take, progress, hand_in and pass do all of it, for every kind of guide.",
    },
  );

  // ---- the work board, drawn as an MCP App where the host can (docs/V2.md §11) ----------------
  //
  // One read of everything: what needs you, who is on what, what is open. Hosts that draw MCP Apps
  // (Claude, ChatGPT) show it as a live board in the conversation; every other host gets the same
  // answer as text. The board is read-only on purpose. Approving or sending work back is a person's
  // decision, and a tool the app could press is a tool a host that ignores `visibility` would hand
  // the model — so the board's buttons open the hub, where that decision is made.

  const WORK_UI = "ui://passalong/work";

  server.registerResource(
    "work-board",
    WORK_UI,
    {
      title: "Your work",
      description: "What needs you, who is working on what, and what is open.",
      mimeType: "text/html;profile=mcp-app",
      _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
    },
    async () => ({
      contents: [{ uri: WORK_UI, mimeType: "text/html;profile=mcp-app", text: WORK_APP_HTML }],
    }),
  );

  server.registerTool(
    "work",
    {
      title: "Your work",
      annotations: READS,
      outputSchema: workOut,
      description:
        "Show the user their work at a glance: what needs them (work handed in for review, agents " +
        "stuck on them, guides handed to them), who is working on what right now, and what is open. " +
        "Use it when the user asks what is going on, what needs them, or who is on what. Hosts " +
        "that support MCP Apps draw it as a board; review happens in the hub it links to.",
      inputSchema: {},
      _meta: { ui: { resourceUri: WORK_UI }, "ui/resourceUri": WORK_UI },
    },
    async () => {
      const get = async <T>(path: string, fallback: T): Promise<T> => {
        const res = await call("GET", path);
        if (res.status >= 400) return fallback;
        try {
          return JSON.parse(res.text) as T;
        } catch {
          return fallback;
        }
      };
      type T = {
        id: string;
        title: string;
        state: string;
        mine: boolean;
        for_me?: boolean;
        team?: string;
        to?: string;
        url: string;
        claim: { note?: string } | null;
      };
      type W = {
        id: string;
        title: string;
        kind: string;
        state: string;
        note: string;
        url: string;
        by: { name: string; handle: string; you: boolean };
      };
      type H = {
        id: string;
        title: string;
        place: string;
        note: string;
        url: string;
        by: { name: string; handle: string };
      };
      const [{ tasks = [] }, { working = [] }, { handed_in = [] }, { guides = [] }] =
        await Promise.all([
          get<{ tasks: T[] }>("/v1/tasks", { tasks: [] }),
          get<{ working: W[] }>("/v1/working", { working: [] }),
          get<{ handed_in: H[] }>("/v1/handed_in", { handed_in: [] }),
          get<{ guides: { id: string; title: string; url: string }[] }>("/v1/inbox", {
            guides: [],
          }),
        ]);
      const hub = `${origin}/hub`;
      const who = (b: { name?: string; handle?: string }) =>
        b.name || (b.handle ? `@${b.handle}` : "A teammate");
      const stuck = (t: T) => /^BLOCKED:/i.test(t.claim?.note || "");
      const needs = [
        ...tasks
          .filter(
            (t) =>
              t.mine &&
              (t.state === "review" ||
                t.state === "stalled" ||
                (t.state === "claimed" && stuck(t))),
          )
          .map((t) => ({
            id: t.id,
            title: t.title,
            kind: "task",
            why:
              t.state === "review"
                ? "handed in for your review"
                : t.state === "stalled"
                  ? "its agent went quiet"
                  : `stuck on you: ${t.claim?.note?.replace(/^BLOCKED:\s*/i, "")}`,
            url: `${hub}?tab=needs`,
          })),
        ...handed_in.map((h) => ({
          id: h.id,
          title: h.title,
          kind: "handoff",
          why: `${who(h.by)} handed it in${h.note ? `: “${h.note}”` : ""}`,
          url: `${hub}?tab=needs`,
        })),
        ...guides.map((g) => ({
          id: g.id,
          title: g.title,
          kind: "guide",
          why: "sent to you",
          url: g.url,
        })),
      ];
      const ready = tasks.filter((t) => t.state === "ready");
      // What you may give to someone else — yours, or assigned to you, and in a team — carries its
      // team, and each such team its choices, so the app can offer "Give to…" without asking again.
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
      const open = tasks.filter((t) => ["ready", "blocked", "draft"].includes(t.state)).length;
      const board = {
        hub,
        counts: {
          needs: needs.length,
          working: working.length,
          open,
          done: tasks.filter((t) => t.state === "done").length,
        },
        needs,
        working: working.map((w) => ({
          id: w.id,
          title: w.title,
          kind: w.kind,
          who: w.by.you ? "You" : who(w.by),
          note: w.note,
          stalled: w.state === "stalled",
          url: w.url,
        })),
        ready: ready.slice(0, 5).map((t) => ({
          id: t.id,
          title: t.title,
          url: t.url,
          team: mayAssign(t),
          to: t.to || "",
        })),
        teams,
      };
      const lines = [
        `${needs.length} need you · ${working.length} being worked on · ${open} open`,
        ...needs.map((n) => `- needs you: ${n.title} (${n.id}) — ${n.why}`),
        ...board.working.map(
          (w) => `- ${w.who} on ${w.title} (${w.id})${w.note ? ` — “${w.note}”` : ""}`,
        ),
        `Review in the hub: ${hub}`,
      ];
      return { ...text(lines.join("\n")), structuredContent: board };
    },
  );

  server.registerTool(
    "assign",
    {
      title: "Give it to someone else",
      annotations: ADDS,
      outputSchema: assignOut,
      description:
        "Reassign a guide or task the user wrote, or one assigned to them, to someone else in its team, when the user asks: " +
        "`to` is @handle for one person, #group for the people who do a thing, or empty for the " +
        "whole team. Whoever held it and is left out has it taken back and is told; a task then " +
        "only goes to the new assignee's agents. Its author, or whoever it is assigned to, can do this.",
      inputSchema: {
        id: z.string(),
        to: z.string().describe('"@handle", "#group", or "" for the whole team'),
      },
    },
    async ({ id, to }) =>
      relay(call, "POST", `/v1/guides/${encodeURIComponent(id)}/assign`, { to }),
  );

  server.registerTool(
    "search_guides",
    {
      title: "Search guides",
      annotations: READS,
      description:
        "Search guides by words in the title, tags, stack or body. Returns summaries, not the " +
        "documents — follow up with get_guide.",
      inputSchema: {
        q: z.string().optional().describe("words to match"),
        scope: z.string().optional().describe('"all" (default), "mine", or a team slug'),
      },
      outputSchema: guidesOut,
    },
    async ({ q, scope }) => {
      const query = new URLSearchParams();
      if (q) query.set("q", q);
      if (scope) query.set("scope", scope);
      const suffix = query.toString();
      return relay(call, "GET", `/v1/guides${suffix ? `?${suffix}` : ""}`);
    },
  );

  server.registerTool(
    "get_guide",
    {
      title: "Get guide",
      // Not read-only: fetching a teammate's guide records a pull, and that tells them it landed.
      annotations: ADDS,
      description:
        "Fetch one guide's full markdown by id. Read `kind` in its frontmatter before acting: a " +
        "bug is a defect to fix, and its Reproduce section produces the problem rather than " +
        "solving it; a task is work nobody has done yet, done when its Acceptance holds. Fetching a teammate's guide tells them the transfer landed.",
      inputSchema: { id: z.string().describe("passalong id, e.g. k3mq2xa7") },
      outputSchema: getGuideOut,
    },
    async ({ id }) => {
      const res = await call("GET", `/v1/guides/${encodeURIComponent(id)}`);
      if (res.status >= 400) return failed(res.text);
      // Said in front of the document, because an agent keys on headings and a bug's or a task's
      // headings look enough like a transfer guide's to be followed by one that never opened the
      // frontmatter. Mirrors `leadFor()` in packages/passalong/src/mcp.js.
      const kind = /^kind:\s*(bug|task)\s*$/m.exec(res.text)?.[1] ?? "";
      const lead =
        leadFor(kind) +
        (kind
          ? "Reading it here does not make it yours: to work on it, call take with its id.\n\n"
          : "");
      // A second content block, not text added to the first. The document is handed over as it
      // came — a transfer guide byte for byte — so an agent that writes it back out cannot carry
      // the note into it, and nothing lands in front of `---`. Mirrors `followUpNote()`.
      const bug = /^kind:\s*bug\s*$/m.test(res.text);
      const note = bug
        ? "<!-- passalong: once this is fixed, if the fix is worth repeating somewhere else, " +
          `that is more context for this bug: publish it as a transfer guide with publish_guide ` +
          `parent=${id}, and whoever opens this bug gets it too. -->`
        : "<!-- passalong: a follow-up is more context for this guide, written as its own guide. " +
          "If this guide needs more — a missing detail, a step that needed explaining, what " +
          "changed since, what you found doing it — publish that with publish_guide " +
          `parent=${id}, and whoever opens this guide gets it too. -->`;
      const [context, from] = await Promise.all([followUps(call, id), parentOf(call, id)]);
      return {
        content: [
          ...(from.text ? [{ type: "text" as const, text: from.text }] : []),
          { type: "text" as const, text: lead + res.text },
          ...(context.text ? [{ type: "text" as const, text: context.text }] : []),
          { type: "text" as const, text: note },
        ],
        // The document untouched — no lead, no note — for a client that reads results as data.
        structuredContent: {
          id,
          kind: bug ? "bug" : /^kind:\s*task\s*$/m.test(res.text) ? "task" : "transfer",
          markdown: res.text,
          parent: from.id,
          follow_ups: context.guides,
        },
      };
    },
  );

  server.registerTool(
    "inbox",
    {
      title: "Inbox",
      annotations: READS,
      description: "Guides handed to you or your teams that nobody has taken yet.",
      inputSchema: {},
      outputSchema: guidesOut,
    },
    async () => relay(call, "GET", "/v1/inbox"),
  );

  server.registerTool(
    "board",
    {
      title: "Board",
      annotations: READS,
      description:
        "What is waiting on you and what you handed over, in queues: waiting, not working, in " +
        "flight, landed.",
      inputSchema: {},
      outputSchema: boardOut,
    },
    async () => relay(call, "GET", "/v1/board"),
  );

  server.registerTool(
    "log",
    {
      title: "What this user did",
      annotations: READS,
      description:
        "This user's own acts on guides, newest first: published, pulled, and every verdict and " +
        "ack they gave, each with a rendered `text` line and the guide's repo. Use it for 'what " +
        "have I been working on', a standup, or finding work by when it happened. The opposite " +
        "of activity, which is what other people did. IMPORTANT: it records what was passed " +
        "along, not what was worked on — work that never became a guide has no entry, so never " +
        "present it as a complete record, and never read a quiet period as an idle one.",
      inputSchema: {
        repo: z.string().optional().describe("narrow to guides whose source repo matches this"),
        since: z
          .string()
          .optional()
          .describe("only what happened on or after: 2026, 2026-09, or 2026-09-11"),
      },
      outputSchema: logOut,
    },
    async ({ repo, since }) => {
      const query = new URLSearchParams();
      if (repo) query.set("repo", repo);
      if (since) query.set("since", since);
      const suffix = query.toString();
      return relay(call, "GET", `/v1/log${suffix ? `?${suffix}` : ""}`);
    },
  );

  server.registerTool(
    "publish_guide",
    {
      title: "Publish guide",
      // Destructive because passing an existing id replaces that guide's document. Open world
      // because `attachments` are fetched from wherever the client says they are.
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      description:
        "Publish a guide from its full markdown. Check what is already open first (work): if this " +
        "session answers something you hold, hand_in that instead, and if the work never left a " +
        "branch the team can see, publish what is still open as a bug or a task rather than a " +
        "write-up of the fix. A transfer guide, a single bug with " +
        "`kind: bug`, or a task with `kind: task`. Use file_bugs for more than one bug. Leave `id` out for a new guide — one " +
        "is minted and returned. To change a guide, pass the id it came back with; inventing a " +
        "fresh id to retry or to correct one publishes a second copy, and every copy counts " +
        "against the author's synced limit. Created, author and source_context are filled in. " +
        "Addressing is frontmatter: `team:` and `to:`. A screenshot the user attached " +
        "is evidence: pass it in `attachments` and it is stored and put in the body under Problem " +
        "(or at the end). A line from attach_screenshot already in the markdown works too, " +
        "because publishing claims whatever the markdown names.",
      inputSchema: {
        attachments: z
          .array(fileInput)
          .optional()
          .describe("images the user attached, filled in by the client; each lands in the body"),
        id: z
          .string()
          .optional()
          .describe(
            "omit for a new guide; to update one, the id it was published under — never a new one",
          ),
        markdown: z.string().describe("the whole document, frontmatter first"),
        parent: z
          .string()
          .optional()
          .describe(
            "id of the guide this one adds context to — set it and this is published as that " +
              "guide's follow-up: listed under it, and read by whoever opens it",
          ),
      },
      outputSchema: publishOut,
      _meta: { "openai/fileParams": ["attachments"] },
    },
    // `parent` rides beside the document and the route writes it into the frontmatter, so a model
    // never has to edit YAML to record where its work came from.
    //
    // The id is minted here when none is given. Requiring one made the model name every guide
    // itself, and a model that re-files names it again: one bug reached a hub as three guides,
    // `khaimeteam4`, `5` and `6`. The route's answer carries the id, so the caller has it to reuse.
    //
    // Attachments are stored before the guide is written, so a file that cannot be fetched fails
    // the call instead of publishing a guide that names evidence it does not have.
    async ({ id, markdown, parent, attachments }) => {
      const stored = await storeFiles(call, attachments ?? []);
      if ("error" in stored) return failed(stored.error);
      const document = withEvidence(markdown, stored.lines);
      return relay(
        call,
        "PUT",
        `/v1/guides/${encodeURIComponent(id || newId())}`,
        parent ? { markdown: document, parent } : { markdown: document },
      );
    },
  );

  // The task queue. A local agent's id comes from its worktree (packages/passalong/src/passalong.js
  // `agent()`); an assistant over HTTP has no worktree and no session, so it names itself and the
  // name is the claim's owner. Reusing it on every call is what makes it the same agent.
  const AGENT = z
    .string()
    .regex(/^[a-z0-9-]{8,64}$/, "8 to 64 of a-z, 0-9 and -")
    .describe("a name for you, the same on every task call, e.g. chat-7f3k2m9q");

  /**
   * What the hand-in has to carry. Described here once, in the words the server refuses with, so
   * the schema an agent reads before calling and the error it gets for a bad call agree.
   */
  const EVIDENCE = z
    .string()
    .describe(
      "what you ran and what came back: the command and the lines that decided it, a test " +
        'summary, a link to the change, or a screenshot url. "it works" is a claim, not evidence',
    );

  // ---- the four verbs (docs/V2.md §11) --------------------------------------------------------
  // take, progress, hand_in and pass work every kind of guide. They replaced next_task,
  // task_progress, finish_task, start_guide, ack_guide and verify_guide, which are gone: ten tools
  // for four jobs, each pair described almost the same way, is a list a model misreads.

  async function doTake(args: { agent: string; id?: string; repo?: string; any?: boolean }) {
    const res = await call("POST", "/v1/take", {
      agent: args.agent,
      ...(args.id ? { id: args.id } : {}),
      repo: args.repo ?? "",
      any: args.any === true,
    });
    if (res.status >= 400) return refused(res.text);
    const parsed = JSON.parse(res.text) as Answer & {
      guide: { id: string; kind?: string; markdown?: string; resumed?: boolean } | null;
    };
    const g = parsed.guide;
    if (!g)
      return {
        ...text(nextNote(parsed) || "Nothing is waiting for you. Tell the user, and stop."),
        structuredContent: parsed as Record<string, unknown>,
      };
    // Taking a guide is opening it, so it arrives with what it belongs to: the guide it follows,
    // and the follow-ups written under it. An agent handed a follow-up on its own reads a document
    // that assumes work it has never seen.
    const [from, context] = await Promise.all([parentOf(call, g.id), followUps(call, g.id)]);
    return {
      content: [
        ...(from.text ? [{ type: "text" as const, text: from.text }] : []),
        {
          type: "text" as const,
          text:
            `${leadFor(g.kind || "")}${g.markdown ?? ""}\n\n<!-- passalong: ${g.id} is yours` +
            `${g.resumed ? " (you already held it — carry on from where it was left)" : ""}. -->\n` +
            nextNote(parsed, g.id),
        },
        ...(context.text ? [{ type: "text" as const, text: context.text }] : []),
      ],
      structuredContent: parsed as Record<string, unknown>,
    };
  }

  const doProgress = (args: { id: string; agent: string; note?: string }) =>
    answer(call, "PUT", `/v1/guides/${encodeURIComponent(args.id)}/progress`, args.id, {
      agent: args.agent,
      ...(args.note ? { note: args.note } : {}),
    });

  const doHandIn = (args: {
    id: string;
    agent: string;
    evidence?: string;
    checks?: { check: string; ran: string }[];
    ok?: boolean;
    note?: string;
    writeup?: string;
    report?: string;
    pr?: string;
  }) =>
    answer(call, "POST", `/v1/guides/${encodeURIComponent(args.id)}/hand_in`, args.id, {
      agent: args.agent,
      note: args.note ?? "",
      evidence: args.evidence ?? "",
      ...(args.checks?.length ? { checks: args.checks } : {}),
      // Sent only when there is something to say: the field is for a hand-in that had to adapt
      // something, and most did not.
      ...(args.writeup ? { writeup: args.writeup } : {}),
      ...(args.report ? { report: args.report, pr: args.pr ?? "" } : {}),
      ...(typeof args.ok === "boolean" ? { ok: args.ok } : {}),
    });

  const takeIn = {
    agent: AGENT,
    id: z
      .string()
      .optional()
      .describe("passalong id; leave out for the next thing waiting for you"),
    repo: z.string().optional().describe("owner/repo the work is in; omit for work for no repo"),
    any: z.boolean().optional().describe("a task for another repo — only when the user asks"),
  };

  server.registerTool(
    "take",
    {
      title: "Take work",
      annotations: ADDS,
      outputSchema: takeOut,
      description:
        "Say you are doing it, and get it. With `id`, that guide — any kind: a task, a bug, a " +
        "handoff. With no id, the next ready task for `repo`. While you hold it no other agent " +
        "can take it there, and its sender sees you are on it. One at a time. If somebody else " +
        "has it, the answer says who: tell the user rather than doing the work twice. Every " +
        "answer ends with what to call next.",
      inputSchema: takeIn,
    },
    async (args) => doTake(args),
  );

  const progressIn = {
    id: z.string(),
    agent: AGENT,
    note: z.string().optional().describe("one line, 280 chars"),
  };

  server.registerTool(
    "progress",
    {
      title: "Report progress",
      annotations: ADDS,
      outputSchema: progressOut,
      description:
        "Say you are still on what you hold, with a one-line note the hub shows. 30 minutes " +
        "without one marks it stalled. If the answer says you no longer hold it, stop.",
      inputSchema: progressIn,
    },
    async (args) => doProgress(args),
  );

  server.registerTool(
    "hand_in",
    {
      title: "Hand it in",
      annotations: ADDS,
      outputSchema: finishOut,
      description:
        "Done here, with proof. Every hand-in carries what you ran and what came back. On a TASK " +
        "send `checks`: one entry per Acceptance line, each with that line and the evidence for " +
        "it — that is what its author reads, line against line, instead of hunting through a wall " +
        "of output for the part that answers each one. `evidence` is the same thing as one block, " +
        "for a handoff or a bug, which have no Acceptance lines; send it when you are not sending " +
        "`checks`. A task also takes `report`, the id of a transfer guide you published about the " +
        "work (publish_guide it first). A handoff or a bug takes `ok`, whether its Verification " +
        "held, and `note` saying what went wrong when it did not. EVERY CHECK IS RUN OR SHOWN: put the " +
        "command in `cmd` and it is executed here before this hand-in lands, or, when no command " +
        "can settle it, call attach_screenshot and put the line it returns in `ran` — capture it to " +
        "a file first if your browser hands images back inline. DO NOT PUBLISH A GUIDE TO CARRY " +
        "EVIDENCE, screenshots included: it belongs on this call, and a set of pictures wrapped " +
        "in Problem / Steps / Verification to make it publishable is a document nobody asked " +
        "for. A command " +
        "you paste into `ran` is you typing, and an account of what you saw is refused. If it held but you had to change " +
        "something to get there, put that in `writeup`: the next person to open the guide is " +
        "shown it, so it does not need to be a guide of its own.",
      inputSchema: {
        id: z.string(),
        agent: AGENT,
        evidence: EVIDENCE.optional(),
        checks: z
          .array(
            z.object({
              check: z
                .string()
                .describe("the Acceptance line this answers, in the task's own words"),
              ran: EVIDENCE,
            }),
          )
          .optional()
          .describe("task: one entry per Acceptance line, in the order you worked them"),
        ok: z.boolean().optional().describe("handoff or bug: did its Verification hold"),
        note: z.string().optional().describe("one line; required when ok is false"),
        writeup: z
          .string()
          .optional()
          .describe(
            "handoff or bug: what you had to adapt to make it work here — a version, a name, a " +
              "step that needed something the guide does not mention. Optional; leave it out " +
              "when it worked as written. The next person to open the guide is shown it",
          ),
        report: z.string().optional().describe("task: id of the transfer guide about this work"),
        pr: z.string().optional().describe("task: PR or branch link"),
      },
    },
    async (args) => doHandIn(args),
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
    "file_bugs",
    {
      title: "File bugs",
      // Every issue is a new guide, so nothing is replaced; attachments are fetched from outside.
      annotations: { ...ADDS, openWorldHint: true },
      description:
        "File defects you found but are not fixing, as one report. Each issue becomes its own " +
        "guide — own id, share link and verdict — so any of them can be handed to whoever fixes " +
        "it. Send them all in one call rather than one call each. If the user showed you an " +
        "image of any of this, it is evidence: pass the files in `attachments` and list each " +
        "file's position in the issue it belongs to (`attachments: [0]`); with one issue, every " +
        "file goes to it. A URL or line from attach_screenshot or create_upload goes in " +
        "`evidence` instead. " +
        "Describing a screenshot you were given, instead of attaching it, throws away the most " +
        "useful thing in the report.",
      inputSchema: {
        attachments: z
          .array(fileInput)
          .optional()
          .describe(
            "images the user attached, filled in by the client; each issue names its own by position",
          ),
        title: z.string().optional().describe('what the sweep was, e.g. "Checkout pass, 8 Sep"'),
        environment: z.string().optional().describe("production, staging or development"),
        to: z
          .string()
          .optional()
          .describe("team slug, team/@handle for one teammate, or team/#group for a set of them"),
        issues: z
          .array(
            z.object({
              evidence: z
                .array(z.string())
                .default([])
                .describe(
                  "screenshot URLs from attach_screenshot, or the markdown lines it returned; " +
                    "they go under Problem, where a reader looks first",
                ),
              attachments: z
                .array(z.number().int().min(0))
                .default([])
                .describe("positions in the top-level `attachments` that show this issue, from 0"),
              title: z.string().describe("what is broken, in one line"),
              problem: z.string().describe("what is broken and what it stops someone doing"),
              reproduce: z
                .string()
                .describe("numbered steps that show the bug — they produce it, they do not fix it"),
              verification: z
                .string()
                .optional()
                .describe("the behaviour that should have happened"),
              gotchas: z.string().optional().describe("what is already ruled out"),
              area: z.string().optional().describe(`which surface — known: ${vocabulary.areas}`),
              severity: z.string().optional().describe(`${vocabulary.severities} (default s3)`),
            }),
          )
          .min(1),
        cwd: z.string().optional().describe("ignored; this server has no working directory"),
      },
      outputSchema: fileBugsOut,
      _meta: { "openai/fileParams": ["attachments"] },
    },
    async ({ title, environment, to, issues, attachments: files = [] }) => {
      // Which issue each file belongs to is settled before anything is written. A guess — every
      // file on every issue, or the unclaimed ones on the first — puts one bug's screenshot on
      // another bug, which is worse than no screenshot. With a single issue there is nothing to
      // guess.
      const claims = issues.map((issue) =>
        issues.length === 1 && !issue.attachments.length
          ? files.map((_, i) => i)
          : issue.attachments,
      );
      const out = claims.flat().find((i) => i >= files.length);
      if (out !== undefined) {
        return failed(`an issue names attachment ${out}, but only ${files.length} were passed`);
      }
      const unclaimed = files.map((_, i) => i).filter((i) => !claims.some((c) => c.includes(i)));
      if (unclaimed.length) {
        return failed(
          `attachment ${unclaimed.join(", ")} belongs to no issue: list each file's position in ` +
            "the `attachments` of the issue it shows",
        );
      }
      // Stored before the report opens, so a file that cannot be fetched leaves nothing half-filed.
      const stored = await storeFiles(call, files);
      if ("error" in stored) return failed(stored.error);

      // The report first, because each issue's frontmatter names it.
      const [team, handle] = String(to || "").split("/");
      const opened = await call("POST", "/v1/reports", {
        title: title || "",
        environment: environment || "",
        team: team || "",
        to: handle || "",
      });
      if (opened.status >= 400) return failed(opened.text);
      const report = (JSON.parse(opened.text) as { report: { id: string } }).report;

      // One at a time: they are writes to the same account against a rate limit, and a partial
      // failure should be able to say which issues already landed.
      const filed: { id: string; url: string; title: string }[] = [];
      for (const [n, issue] of issues.entries()) {
        const id = newId();
        const markdown = bugDocument({
          ...issue,
          evidence: [
            ...issue.evidence,
            ...[...new Set(claims[n])].map((i) => stored.lines[i] as string),
          ],
          report: report.id,
          environment,
          team,
          to: handle,
        });
        const res = await call("PUT", `/v1/guides/${id}`, { markdown });
        if (res.status >= 400) {
          return failed(
            `filed ${filed.length} of ${issues.length} issues before failing: ${res.text}`,
          );
        }
        filed.push({ id, url: (JSON.parse(res.text) as { url: string }).url, title: issue.title });
      }
      const result = { report, issues: filed };
      return { ...text(JSON.stringify(result, null, 2)), structuredContent: result };
    },
  );

  /**
   * Evidence, from a chat surface that has the file and no way to hand it over.
   *
   * A bug report's screenshot is the part a reader trusts most, and until now only the web form
   * could carry one: every MCP tool takes JSON, and a model cannot type out bytes of an image it
   * was shown. `openai/fileParams` is how ChatGPT closes that — it declares which inputs are
   * files, and fills them with a `download_url` its own file host serves. The bytes never pass
   * through the model, which is why this works at all.
   *
   * The upload itself is `POST /v1/shots`, unchanged and doing its own validation. This fetches,
   * bounds what it read, and hands it on.
   *
   * Vendor-shaped on purpose, and worth knowing when it moves: `openai/fileParams` is OpenAI's
   * extension, the standard file input is still a proposal (modelcontextprotocol SEP-2356), and
   * ChatGPT's mobile apps send file references this cannot download. The browser works today.
   */
  server.registerTool(
    "attach_screenshot",
    {
      title: "Attach a screenshot",
      annotations: { ...ADDS, openWorldHint: true },
      description:
        "Store an image as evidence and get back the markdown line that points at it. " +
        `${vocabulary.shotTypes}. ` +
        WHERE_THE_LINE_GOES,
      inputSchema: {
        file: fileInput.describe("the attached image, filled in by the client"),
      },
      outputSchema: shotOut,
      // The field names a client fills with files. Expressed with zod rather than the `$defs` /
      // `$ref` the Apps SDK reference writes out: the wire schema is the same object with the same
      // four properties, and one schema language in this file is worth more than matching a
      // document's formatting.
      _meta: { "openai/fileParams": ["file"] },
    },
    async ({ file }) => {
      const stored = await storeFile(call, file);
      if ("error" in stored) return failed(stored.error);
      return {
        ...text(
          `${JSON.stringify(stored.shot, null, 2)}\n\nPut this in the guide body:\n${stored.line}`,
        ),
        structuredContent: { ...stored.shot, markdown: stored.line },
      };
    },
  );

  /**
   * Evidence, from an agent that holds the image as a file: Claude's sandbox, or anything else that
   * can run a command but cannot fill a file input.
   *
   * The link is minted here and the bytes go to it from wherever the file is, so they never pass
   * through the model. The route in index.ts spends the link and stores the shot.
   */
  server.registerTool(
    "create_upload",
    {
      title: "Get an upload link",
      annotations: ADDS,
      description:
        "For an image you hold as a file — in a code sandbox, or on disk — that you cannot pass " +
        "as a file input. Returns a one-time link and the curl command that sends the file to " +
        "it. Run the command where the file is, with IMAGE_PATH replaced by the file's path; its " +
        "JSON response has `markdown`, the line to put in the guide body or pass as file_bugs " +
        "`evidence`. The link works once and expires in 10 minutes, so ask for one per image, " +
        "right before sending it. The bytes go straight to Passalong and never through the " +
        "conversation — never base64 an image into a tool call instead. If the command cannot " +
        "reach passalong.dev, the sandbox's network settings block it: tell the user to allow " +
        "that domain for code execution.",
      inputSchema: {
        name: z.string().optional().describe("label for the image, e.g. its filename"),
      },
      outputSchema: uploadOut,
    },
    async ({ name }) => {
      const res = await call("POST", "/v1/uploads", { name: name ?? "" });
      if (res.status >= 400) return failed(res.text);
      const { upload_url, expires } = JSON.parse(res.text) as {
        upload_url: string;
        expires: string;
      };
      // PUT spelled out, and no content-type: the route reads the type from the bytes, so the one
      // thing an agent could get wrong in this command is not in it.
      const command = `curl -sS --fail-with-body -X PUT --data-binary @IMAGE_PATH '${upload_url}'`;
      return {
        ...text(
          `Upload link (one use, expires ${expires}):\n${upload_url}\n\n` +
            `Run this where the file is, with IMAGE_PATH replaced by its path:\n${command}\n\n` +
            "The response's `markdown` is the line to put in the guide body.",
        ),
        structuredContent: { upload_url, expires, command },
      };
    },
  );

  server.registerTool(
    "get_report",
    {
      title: "Get report",
      annotations: READS,
      description: "One bug report and its issues, grouped by product area.",
      inputSchema: { id: z.string() },
      outputSchema: reportOut,
    },
    async ({ id }) => relay(call, "GET", `/v1/reports/${encodeURIComponent(id)}`),
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

const quote = (value: string) =>
  /[:#[\]{}"'|>&*!%@`,]|^\s|\s$|^$/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;

/** Mirrors `bugGuide()` in packages/passalong/src/guide.js — same sections, same lead line. */
function bugDocument(issue: {
  title: string;
  problem: string;
  reproduce: string;
  verification?: string;
  gotchas?: string;
  area?: string;
  severity?: string;
  report: string;
  environment?: string;
  team?: string;
  to?: string;
  evidence?: string[];
}) {
  const front = [
    `title: ${quote(issue.title)}`,
    "kind: bug",
    "status: published",
    `report: ${issue.report}`,
  ];
  if (issue.area) front.push(`area: ${issue.area}`);
  front.push(`severity: ${issue.severity || "s3"}`);
  if (issue.environment) front.push(`source_context: ${quote(issue.environment)}`);
  if (issue.team) front.push(`team: ${issue.team}`);
  if (issue.to) front.push(`to: ${issue.to.replace(/^@/, "")}`);
  const tags = ["bug", issue.environment, issue.area].filter(Boolean) as string[];
  front.push(`tags: [${tags.map(quote).join(", ")}]`);

  // Under Problem, not a heading of their own: for a visual defect the picture *is* the problem
  // statement, and a bug's sections are a fixed set. Naming them in the body is also what binds
  // them — `claimShots` claims whatever the markdown points at, so a URL anywhere else uploads
  // evidence no guide owns and the nightly sweep takes it.
  const shots = (issue.evidence || [])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("![") ? s : `![evidence](${s})`));
  const body = [
    "> **Bug report.** The steps under Reproduce show the problem — they are not a fix to apply. " +
      "Fix what Problem describes, then check Verification.",
    "",
    "## Problem",
    issue.problem.trim() || "_No description given._",
  ];
  if (shots.length) body.push("", ...shots);
  body.push("", "## Reproduce", issue.reproduce.trim() || "_Not recorded._");
  if (issue.verification?.trim()) body.push("", "## Verification", issue.verification.trim());
  if (issue.gotchas?.trim()) body.push("", "## Gotchas", issue.gotchas.trim());
  return `---\n${front.join("\n")}\n---\n\n${body.join("\n")}\n`;
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
 * draws whatever `ui/notifications/tool-result` carries. Refresh calls the `work` tool again; every
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

  // "Give to…" opens the choices under the row. Reassigning is not the review gate, so the app may
  // call the assign tool itself; the server still refuses anyone but the author or the assignee.
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
    if (!b || !b.counts) return;
    board = b;
    const c = b.counts;
    let html = '<div class="top"><div><h1>Your work</h1><p class="counts"><b>' + c.needs + '</b> need you · <b>' +
      c.working + '</b> being worked on · <b>' + c.open + '</b> open · <b>' + c.done + '</b> done</p></div></div>';
    html += '<h2>Needs you</h2>';
    html += b.needs && b.needs.length
      ? '<ul>' + b.needs.map((n) => row("", n.title, esc(n.why), n.id, n.url, n.kind === "guide" ? "Open" : "Review")).join("") + '</ul>'
      : '<div class="clear"><b>Nothing needs you.</b> Work handed in, or sent to you, lands here.</div>';
    if (b.working && b.working.length) {
      html += '<h2>Working now</h2><ul>' + b.working.map((w) => row(w.stalled ? "warn" : "ok", w.title,
        esc(w.who) + (w.stalled ? " · went quiet" : "") + (w.note ? " · “" + esc(w.note) + "”" : ""), w.id, w.url, "Open")).join("") + '</ul>';
    }
    if (b.ready && b.ready.length) {
      html += '<h2>Ready for an agent</h2><ul>' + b.ready.map((t) => row("idle", t.title,
        t.to ? "for " + esc(t.to) : "waiting for the next agent in its repo", t.id, t.url, "Open",
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
      request("tools/call", { name: "assign", arguments: { id: t.dataset.assign, to: t.dataset.to } }).then(() => {
        giving = null;
        return request("tools/call", { name: "work", arguments: {} });
      }).then((r) => render(r && r.structuredContent));
      return;
    }
    if (t.id === "refresh") {
      t.disabled = true;
      request("tools/call", { name: "work", arguments: {} }).then((r) => {
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
