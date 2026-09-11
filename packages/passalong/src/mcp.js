// The Passalong MCP server (stdio). This is the rail that makes Passalong tool-agnostic: any
// MCP-capable agent can search, pull, and publish guides without leaving its session. With a
// team, the same tools see the team's guides and the user's inbox.
//
//   claude mcp add passalong -- passalong mcp
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as api from "./api.js";
import { AREAS, BUG_SECTIONS, parse, SECTIONS, template } from "./guide.js";
import * as passalong from "./passalong.js";

const text = (s) => ({ content: [{ type: "text", text: s }] });

/**
 * The rest of the report this issue came from.
 *
 * A QA pass files six bugs at once, and they arrive in an inbox as six unrelated guides — which
 * is how the same root cause gets fixed three times, or how someone fixes one of a pair and calls
 * the sweep done. Naming the siblings costs one request and only happens for a guide that has a
 * parent. A failure here is not worth failing the pull over: the issue itself is what was asked
 * for, and it is already in hand.
 */
async function related(meta) {
  if (!meta.report) return "";
  try {
    const { report } = await api.report(meta.report);
    const others = (report.areas || [])
      .flatMap((a) => a.issues.map((i) => ({ ...i, area: a.area })))
      .filter((i) => i.id !== meta.id);
    if (!others.length) return "";
    const lines = others.map(
      (i) => `  ${i.id}  [${i.severity || "--"}] ${i.area || "no area"} — ${i.title}`,
    );
    return (
      `\n\n<!-- passalong: filed with ${others.length} other issue${others.length === 1 ? "" : "s"}` +
      `${report.title ? ` in "${report.title}"` : ""}. Fix only this one unless asked; the others are\n` +
      `${lines.join("\n")}\n-->`
    );
  } catch {
    return "";
  }
}
const json = (data) => text(JSON.stringify(data, null, 2));
const fail = (err) => ({ content: [{ type: "text", text: err.message }], isError: true });

export async function serve() {
  const server = new McpServer(
    { name: "passalong", version: "0.2.0" },
    {
      instructions:
        "Passalong hands work between contexts as guides: markdown with frontmatter, in two " +
        "kinds, and `kind:` in the frontmatter says which. READ IT BEFORE ACTING — the two ask " +
        "for opposite behaviour.\n" +
        `kind: transfer (or absent) is a finished implementation to repeat here. Sections: ${SECTIONS.join(", ")}. ` +
        "Follow its Steps, adapting anything marked ASSUMES to this codebase; run its " +
        "Verification before declaring done, then verify_guide with the result.\n" +
        `kind: bug is a defect to FIX here. Sections: ${BUG_SECTIONS.join(", ")}. ` +
        "It has no Steps and nothing in it is a procedure to apply: Reproduce is how to see the " +
        "bug and running it produces the bug, Verification is the behaviour that should have " +
        "happened. Fix the defect, then check Verification and verify_guide with the result — " +
        "ok true once the behaviour it describes actually holds. A bug report is not broken " +
        "because you reproduced it. " +
        "When you find defects you are not fixing — a test run, a QA pass, a review — call " +
        "file_bugs with all of them at once; each becomes a guide someone can take on its own. " +
        "When the user asks to pass along, hand off, or " +
        "share what was just done, distill the session into a guide (guide_template shows the " +
        "shape) and call publish_guide, with `to` as team, team/@handle for one teammate, or " +
        "team/#group for the people who do a thing. " +
        "At the start of work, inbox shows guides teammates have handed to this user, and activity " +
        "shows whether the guides they handed off have landed. When the user asks what they have " +
        "been working on, or wants a standup or a summary of a period, call log — but say that it " +
        "holds what they passed along and not everything they did. Gotchas are " +
        "the highest-value section: record what failed and why.",
    },
  );

  server.registerTool(
    "search_guides",
    {
      title: "Search guides",
      description:
        "Search transfer guides by words in the title, tags, stack, or body: the user's own " +
        "(local and synced) plus every team they belong to. Empty query lists everything, newest first.",
      inputSchema: {
        query: z.string().default(""),
        scope: z.string().optional().describe('"mine", "all" (default), or a team slug'),
      },
    },
    async ({ query, scope }) => {
      try {
        const rows = await passalong.list(query, { scope: scope || "" });
        return json({ guides: rows, warning: rows.warning });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "inbox",
    {
      title: "Inbox",
      description:
        "Guides handed to this user (or to their teams) that they have not pulled yet. Call it " +
        "when starting work so handoffs are not missed. Needs sync (passalong login).",
      inputSchema: {},
    },
    async () => {
      try {
        return json({ guides: await passalong.inbox() });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "board",
    {
      title: "Board",
      description:
        "The state of this user's transfers as queues: waiting on you (handed to you, not " +
        "pulled), not working (someone gave it a failing verdict — the most urgent), in flight " +
        "(handed over, nobody has taken it — `stale` means it has sat over a week), and landed " +
        "(someone else has it). Use it to answer 'what is outstanding?'.",
      inputSchema: {},
    },
    async () => {
      try {
        return json(await passalong.board());
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "log",
    {
      title: "What this user did",
      description:
        "This user's own acts on guides, newest first: what they published, what they took " +
        "delivery of, and every verdict and ack they gave. Each item has a rendered `text` line " +
        "and the guide's repo. Use it to answer 'what have I been working on', to write a " +
        "standup or a weekly summary, or to find work from a repo by when it happened rather " +
        "than by what it was called. This is the opposite of `activity`, which is what other " +
        "people did. IMPORTANT: it records what was passed along, not what was worked on — work " +
        "that never became a guide has no entry, so never present it as a complete record of " +
        "this user's work, and never infer that a quiet period was an idle one.",
      inputSchema: {
        repo: z.string().default("").describe("narrow to guides whose source repo matches this"),
        since: z
          .string()
          .default("")
          .describe("only what happened on or after this date: 2026, 2026-09, or 2026-09-11"),
      },
    },
    async ({ repo, since }) => {
      try {
        return json({ log: await passalong.log({ repo: repo || "", since: since || "" }) });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "ack_guide",
    {
      title: "Say whether you are taking it",
      description:
        "The first word back on a guide handed to you, before any work: take it, or pass it " +
        "back. Passing must say why — an unanswered handoff is indistinguishable from one nobody " +
        "has noticed, and the sender finds out in a week instead of a minute. Answer this when " +
        "you pick up an inbox; verify_guide comes later, once you have actually run it.",
      inputSchema: {
        id: z.string().describe("passalong id"),
        taken: z.boolean().describe("true if you are doing it; false hands it back"),
        note: z
          .string()
          .default("")
          .describe("why it is not yours (required when taken is false); one line, max 280 chars"),
      },
    },
    async ({ id, taken, note }) => {
      try {
        return json(await passalong.ack(id, taken, note || ""));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "verify_guide",
    {
      title: "Report whether a guide works",
      description:
        "After following a guide's Verification section, report the result. This is the only way " +
        "the author learns their handoff did not land — `set_guide_status consumed` says it was " +
        "implemented, this says it actually works. A failing verdict must say what went wrong.",
      inputSchema: {
        id: z.string().describe("passalong id"),
        ok: z.boolean().describe("true if the Verification steps passed"),
        note: z
          .string()
          .default("")
          .describe("what went wrong (required when ok is false); one line, max 280 chars"),
      },
    },
    async ({ id, ok, note }) => {
      try {
        return json(await passalong.verdict(id, ok, note || ""));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "activity",
    {
      title: "Activity",
      description:
        "What has happened to this user's guides and handoffs: who pulled one, who marked one " +
        "consumed, who was handed what, who joined a team. Each item has a ready-made `text` " +
        "line. Read-only by default — it does not clear the user's unread feed unless asked.",
      inputSchema: {
        all: z.boolean().default(false).describe("include what the user has already seen"),
        mark_read: z.boolean().default(false).describe("clear the unread feed after reading"),
      },
    },
    async ({ all, mark_read }) => {
      try {
        const res = await passalong.activity({ all });
        if (mark_read && res.unread) await passalong.seen();
        return json(res);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_guide",
    {
      title: "Get guide",
      description:
        "Fetch a transfer guide by passalong id or share link and return its full markdown. Also " +
        "writes it to .passalong/<id>.md in the working directory so it survives the session. " +
        "Pulling a teammate's guide tells them the transfer landed.",
      inputSchema: {
        ref: z.string().describe("passalong id (e.g. k3mq2xa7) or share URL"),
        cwd: z
          .string()
          .optional()
          .describe("directory to write .passalong/<id>.md into; default is the server's cwd"),
      },
    },
    async ({ ref, cwd }) => {
      try {
        const { markdown, path, from } = await passalong.pull(ref, { cwd: cwd || process.cwd() });
        // The heading text is what an agent keys on, and a bug's headings look enough like a
        // transfer guide's to be followed by one that never opened the frontmatter. So the kind
        // is stated in front of the document, in the imperative, every time.
        const meta = parse(markdown).meta;
        const lead =
          meta.kind === "bug"
            ? "THIS IS A BUG REPORT, NOT WORK TO REPEAT. Do not follow Reproduce as instructions " +
              "— those steps produce the defect. Fix what Problem describes, then check " +
              "Verification and answer with verify_guide.\n\n"
            : "";
        const siblings = await related(meta);
        return text(
          `${lead}${markdown}${siblings}\n\n<!-- passalong: ${from}; written to ${path} -->`,
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "publish_guide",
    {
      title: "Publish guide",
      description:
        "Publish a guide from markdown (frontmatter + sections) — a transfer guide by default, or " +
        "a single bug with `kind: bug`; use file_bugs for more than one. Missing id, created, " +
        'author, and source_context are filled in. `to` addresses it to a team ("khaime") or a ' +
        'teammate ("khaime/lukman"), who is notified. Returns the id and share link.',
      inputSchema: {
        markdown: z.string().describe("full guide markdown; start from guide_template"),
        to: z
          .string()
          .optional()
          .describe("team slug, team/@handle for one teammate, or team/#group for a set of them"),
        cwd: z
          .string()
          .optional()
          .describe("directory the work happened in, used to infer source_context"),
      },
    },
    async ({ markdown, to, cwd }) => {
      try {
        const { guide, url, synced, notified, path } = await passalong.share(markdown, {
          cwd: cwd || process.cwd(),
          to,
        });
        return json({
          id: guide.meta.id,
          title: guide.meta.title,
          url,
          synced,
          team: guide.meta.team || "",
          to: guide.meta.to || "",
          notified,
          path,
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "file_bugs",
    {
      title: "File bugs",
      description:
        "File one or more bugs you found but are not fixing, as a set. Opens a report and " +
        "publishes each issue as its own guide — its own id, share link, and verdict — so a " +
        "reviewer can hand any one of them to whoever fixes it. Use this after a test run, a QA " +
        "pass, or a review that turned up defects; use publish_guide instead for work you " +
        "finished and want repeated elsewhere. Needs sync (`passalong login`).",
      inputSchema: {
        title: z
          .string()
          .optional()
          .describe('what the sweep was, e.g. "Checkout regression pass, 8 Sep build"'),
        environment: z
          .string()
          .optional()
          .describe("production, staging or development — where you saw these"),
        to: z
          .string()
          .optional()
          .describe("team slug, team/@handle for one teammate, or team/#group for a set of them"),
        issues: z
          .array(
            z.object({
              title: z.string().describe("what is broken, in one line"),
              problem: z
                .string()
                .describe(
                  "what is broken and what it stops someone doing; the error if there is one",
                ),
              reproduce: z
                .string()
                .describe(
                  "numbered steps that show the bug — these produce it, they are not a fix",
                ),
              verification: z
                .string()
                .optional()
                .describe(
                  "the behaviour that should have happened, as something a fixer can check",
                ),
              gotchas: z
                .string()
                .optional()
                .describe("anything already ruled out, or that made it hard to pin down"),
              area: z
                .string()
                .optional()
                .describe(`which surface it is on — known: ${AREAS.map((a) => a.slug).join(", ")}`),
              severity: z
                .string()
                .optional()
                .describe("s1 blocker, s2 major, s3 minor, s4 cosmetic (default s3)"),
            }),
          )
          .min(1)
          .describe("one entry per defect; file them together rather than one call each"),
        cwd: z.string().optional().describe("directory the bugs were found in"),
      },
    },
    async ({ title, environment, to, issues, cwd }) => {
      try {
        const filed = await passalong.fileBugs(
          { title: title || "", environment: environment || "", issues },
          { cwd: cwd || process.cwd(), to },
        );
        return json(filed);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "guide_template",
    {
      title: "Guide template",
      description:
        "The empty guide skeleton with guidance comments for each section. `kind: bug` gives the " +
        "bug report skeleton instead, which has a Reproduce section and no Steps.",
      inputSchema: {
        kind: z
          .enum(["transfer", "bug"])
          .optional()
          .describe("transfer (default) for finished work to repeat; bug for a defect to fix"),
      },
    },
    async ({ kind }) => text(template(kind === "bug" ? { kind: "bug" } : {})),
  );

  server.registerTool(
    "set_guide_status",
    {
      title: "Set guide status",
      description:
        "Archive a guide (`consumed`) or put it back on the board (`published`). Archiving is the " +
        "author's shelf: off the board, out of the free tier's count, reversible — it is not a " +
        "judgement that the work landed, which is what verify_guide reports. `promoted` was " +
        "retired and the server refuses it.",
      inputSchema: { id: z.string(), status: z.enum(["published", "consumed"]) },
    },
    async ({ id, status }) => {
      try {
        const g = await passalong.setStatus(id, status);
        return json(passalong.summary(g));
      } catch (err) {
        return fail(err);
      }
    },
  );

  await server.connect(new StdioServerTransport());
}
