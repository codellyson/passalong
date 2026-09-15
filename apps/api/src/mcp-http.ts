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

/** Hand a route's answer back as it came, so a tool never invents an error the API did not give. */
async function relay(call: Call, method: string, path: string, body?: unknown) {
  const res = await call(method, path, body);
  return res.status >= 400 ? failed(res.text) : text(res.text);
}

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
async function followUps(call: Call, id: string): Promise<string> {
  try {
    const res = await call("GET", `/v1/guides/${encodeURIComponent(id)}/children?markdown=1`);
    if (res.status >= 400) return "";
    const { guides = [] } = JSON.parse(res.text) as {
      guides?: { id?: string; title?: string; markdown?: unknown }[];
    };
    const withContent = guides.filter((g) => g?.id && typeof g.markdown === "string");
    if (!withContent.length) return "";
    return [
      FOLLOW_UPS_LEAD,
      ...withContent.map(
        (g) =>
          `--- follow-up ${g.id}: ${g.title || "untitled"} ---\n${String(g.markdown).trimEnd()}`,
      ),
    ].join("\n\n");
  } catch {
    return "";
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
  if (!url) return { error: "download_url has to be a public https URL" };
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
const READS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const ADDS = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

export function buildServer(call: Call, vocabulary: Vocabulary) {
  const server = new McpServer(
    { name: "passalong", version: "0.2.0" },
    {
      instructions:
        "Passalong hands work between contexts as guides: markdown with frontmatter, in two " +
        "kinds, and `kind:` in the frontmatter says which. READ IT BEFORE ACTING — the two ask " +
        "for opposite behaviour.\n" +
        "kind: transfer (or absent) is a finished implementation to repeat here. Follow its " +
        "Steps, adapting anything marked ASSUMES to this codebase; run its Verification before " +
        "declaring done, then verify_guide with the result.\n" +
        "kind: bug is a defect to FIX here. It has no Steps and nothing in it is a procedure to " +
        "apply: Reproduce is how to see the bug and running it produces the bug, Verification is " +
        "the behaviour that should have happened. Fix the defect, then check Verification and " +
        "verify_guide with the result. A bug report is not broken because you reproduced it.\n" +
        "When you find defects you are not fixing — a test run, a QA pass, a review — call " +
        "file_bugs with all of them at once; each becomes a guide someone can take on its own.\n" +
        "AN IMAGE THE USER SHOWED YOU IS EVIDENCE, NOT CONTEXT. Before filing or publishing, " +
        "attach it with attach_screenshot and pass what it returns as `evidence` — a screenshot " +
        "you described instead of attaching is the most useful thing in the report, thrown away. " +
        "A guide already filed without one is not stuck: get_guide it, add the markdown line to " +
        "the body, and publish_guide the same id — publishing claims whatever the markdown names.\n" +
        "A FOLLOW-UP IS MORE CONTEXT FOR A GUIDE, WRITTEN AS ITS OWN GUIDE. When a guide needs " +
        "more context — a missing detail, a step that needed explaining, what changed since, what " +
        "you found doing it — publish that context with publish_guide `parent` set to the guide's " +
        "id. It is listed under the original, and anyone who opens the original, person or agent, " +
        "gets it too. get_guide returns a guide's follow-ups after it; read them before acting.",
    },
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
        "solving it. Fetching a teammate's guide tells them the transfer landed.",
      inputSchema: { id: z.string().describe("passalong id, e.g. k3mq2xa7") },
    },
    async ({ id }) => {
      const res = await call("GET", `/v1/guides/${encodeURIComponent(id)}`);
      if (res.status >= 400) return failed(res.text);
      // Said in front of the document, because an agent keys on headings and a bug's headings look
      // enough like a transfer guide's to be followed by one that never opened the frontmatter.
      const lead = /^kind:\s*bug\s*$/m.test(res.text)
        ? "THIS IS A BUG REPORT, NOT WORK TO REPEAT. Do not follow Reproduce as instructions — " +
          "those steps produce the defect. Fix what Problem describes, then check Verification " +
          "and answer with verify_guide.\n\n"
        : "";
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
      const context = await followUps(call, id);
      return {
        content: [
          { type: "text" as const, text: lead + res.text },
          ...(context ? [{ type: "text" as const, text: context }] : []),
          { type: "text" as const, text: note },
        ],
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
        "Publish a guide from its full markdown — a transfer guide, or a single bug with " +
        "`kind: bug`. Use file_bugs for more than one bug. Leave `id` out for a new guide — one " +
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

  server.registerTool(
    "ack_guide",
    {
      title: "Say whether you are taking it",
      annotations: ADDS,
      description:
        "The first word back on a guide handed to you, before any work: take it, or pass it " +
        "back. Passing must say why — an unanswered handoff is indistinguishable from one nobody " +
        "has noticed, and the sender finds out in a week instead of a minute. Answer this when " +
        "you pick up an inbox, then verify_guide once you have actually run it.",
      inputSchema: {
        id: z.string(),
        taken: z.boolean().describe("true if you are doing it; false hands it back"),
        note: z
          .string()
          .optional()
          .describe("required when taken is false: why it is not yours; one line, 280 chars"),
      },
    },
    async ({ id, taken, note }) =>
      relay(call, "PUT", `/v1/guides/${encodeURIComponent(id)}/ack`, {
        taken,
        note: note ?? "",
      }),
  );

  server.registerTool(
    "verify_guide",
    {
      title: "Say whether it worked",
      annotations: ADDS,
      description:
        "Answer for a guide you took. The single most valuable thing to report back, and the " +
        "only way the sender learns their handoff did not land. A failure must say why. If the " +
        "guide needs more context than a one-line note holds — a missing detail, a step that " +
        "needed explaining, what you found doing it — publish that as a follow-up: its own guide, " +
        "with publish_guide `parent` set to this id. Whoever opens this guide then gets it too.",
      inputSchema: {
        id: z.string(),
        ok: z.boolean().describe("true if it holds up"),
        note: z.string().optional().describe("required when ok is false; one line, 280 chars"),
      },
    },
    async ({ id, ok, note }) =>
      relay(call, "PUT", `/v1/guides/${encodeURIComponent(id)}/verdict`, {
        ok,
        note: note ?? "",
      }),
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
        "file goes to it. A URL or line from attach_screenshot goes in `evidence` instead. " +
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
      return text(JSON.stringify({ report, issues: filed }, null, 2));
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
        "Store an image a user attached, so a bug report can point at it. Returns the markdown to " +
        `put in the guide body — evidence lives in the document, not beside it. ${vocabulary.shotTypes}. ` +
        "Call this before file_bugs or publish_guide, then paste the returned line into the " +
        "issue's Problem or Reproduce section; publishing claims whatever the markdown names.",
      inputSchema: {
        file: fileInput.describe("the attached image, filled in by the client"),
      },
      // The field names a client fills with files. Expressed with zod rather than the `$defs` /
      // `$ref` the Apps SDK reference writes out: the wire schema is the same object with the same
      // four properties, and one schema language in this file is worth more than matching a
      // document's formatting.
      _meta: { "openai/fileParams": ["file"] },
    },
    async ({ file }) => {
      const stored = await storeFile(call, file);
      if ("error" in stored) return failed(stored.error);
      return text(
        `${JSON.stringify(stored.shot, null, 2)}\n\nPut this in the guide body:\n${stored.line}`,
      );
    },
  );

  server.registerTool(
    "get_report",
    {
      title: "Get report",
      annotations: READS,
      description: "One bug report and its issues, grouped by product area.",
      inputSchema: { id: z.string() },
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
  const server = buildServer(call, vocabulary);
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
