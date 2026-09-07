// The Passalong MCP server (stdio). This is the rail that makes Passalong tool-agnostic: any
// MCP-capable agent can search, pull, and publish guides without leaving its session. With a
// team, the same tools see the team's guides and the user's inbox.
//
//   claude mcp add passalong -- passalong mcp
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SECTIONS, template } from "./guide.js";
import * as passalong from "./passalong.js";

const text = (s) => ({ content: [{ type: "text", text: s }] });
const json = (data) => text(JSON.stringify(data, null, 2));
const fail = (err) => ({ content: [{ type: "text", text: err.message }], isError: true });

export async function serve() {
  const server = new McpServer(
    { name: "passalong", version: "0.2.0" },
    {
      instructions:
        "Passalong hands finished implementations between contexts as transfer guides: markdown " +
        `with frontmatter and the sections ${SECTIONS.join(", ")}. ` +
        "When the user references a passalong id or link, call get_guide and follow its Steps, " +
        "adapting anything marked ASSUMES to this codebase; run its Verification before declaring " +
        "done, then set_guide_status consumed and verify_guide with the result. " +
        "When the user asks to pass along, hand off, or " +
        "share what was just done, distill the session into a guide (guide_template shows the " +
        "shape) and call publish_guide, with `to` as team or team/handle when it is for a teammate. " +
        "At the start of work, inbox shows guides teammates have handed to this user, and activity " +
        "shows whether the guides they handed off have landed. Gotchas are " +
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
        return text(`${markdown}\n\n<!-- passalong: ${from}; written to ${path} -->`);
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
        "Publish a transfer guide from markdown (frontmatter + sections). Missing id, created, " +
        'author, and source_context are filled in. `to` addresses it to a team ("khaime") or a ' +
        'teammate ("khaime/lukman"), who is notified. Returns the id and share link.',
      inputSchema: {
        markdown: z.string().describe("full guide markdown; start from guide_template"),
        to: z.string().optional().describe("team slug, or team/handle for a specific teammate"),
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
    "guide_template",
    {
      title: "Guide template",
      description: "The empty transfer guide skeleton with guidance comments for each section.",
      inputSchema: {},
    },
    async () => text(template()),
  );

  server.registerTool(
    "set_guide_status",
    {
      title: "Set guide status",
      description:
        "Mark a guide consumed (implemented on the receiving side) or promoted (a reusable reference). " +
        "Only the author can promote.",
      inputSchema: { id: z.string(), status: z.enum(["published", "consumed", "promoted"]) },
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
