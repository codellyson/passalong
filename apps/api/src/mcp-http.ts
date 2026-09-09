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

/** How a tool reaches the rest of the API: the app's own fetch, with the caller's credential. */
type Call = (
  method: string,
  path: string,
  body?: unknown,
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
}

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
        "file_bugs with all of them at once; each becomes a guide someone can take on its own.",
    },
  );

  server.registerTool(
    "search_guides",
    {
      title: "Search guides",
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
      return text(lead + res.text);
    },
  );

  server.registerTool(
    "inbox",
    {
      title: "Inbox",
      description: "Guides handed to you or your teams that nobody has taken yet.",
      inputSchema: {},
    },
    async () => relay(call, "GET", "/v1/inbox"),
  );

  server.registerTool(
    "board",
    {
      title: "Board",
      description:
        "What is waiting on you and what you handed over, in queues: waiting, not working, in " +
        "flight, landed.",
      inputSchema: {},
    },
    async () => relay(call, "GET", "/v1/board"),
  );

  server.registerTool(
    "publish_guide",
    {
      title: "Publish guide",
      description:
        "Publish a guide from its full markdown — a transfer guide, or a single bug with " +
        "`kind: bug`. Use file_bugs for more than one bug. Missing id, created, author and " +
        "source_context are filled in. Addressing is frontmatter: `team:` and `to:`.",
      inputSchema: {
        id: z
          .string()
          .describe("passalong id: 6-12 lowercase letters and digits, chosen by you if new"),
        markdown: z.string().describe("the whole document, frontmatter first"),
      },
    },
    async ({ id, markdown }) =>
      relay(call, "PUT", `/v1/guides/${encodeURIComponent(id)}`, { markdown }),
  );

  server.registerTool(
    "ack_guide",
    {
      title: "Say whether you are taking it",
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
      description:
        "Answer for a guide you took. The single most valuable thing to report back, and the " +
        "only way the sender learns their handoff did not land. A failure must say why.",
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
      description:
        "File defects you found but are not fixing, as one report. Each issue becomes its own " +
        "guide — own id, share link and verdict — so any of them can be handed to whoever fixes " +
        "it. Send them all in one call rather than one call each.",
      inputSchema: {
        title: z.string().optional().describe('what the sweep was, e.g. "Checkout pass, 8 Sep"'),
        environment: z.string().optional().describe("production, staging or development"),
        to: z.string().optional().describe("team slug, or team/handle for a teammate"),
        issues: z
          .array(
            z.object({
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
    },
    async ({ title, environment, to, issues }) => {
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
      for (const issue of issues) {
        const id = newId();
        const markdown = bugDocument({
          ...issue,
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

  server.registerTool(
    "get_report",
    {
      title: "Get report",
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

  const body = [
    "> **Bug report.** The steps under Reproduce show the problem — they are not a fix to apply. " +
      "Fix what Problem describes, then check Verification.",
    "",
    "## Problem",
    issue.problem.trim() || "_No description given._",
    "",
    "## Reproduce",
    issue.reproduce.trim() || "_Not recorded._",
  ];
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
