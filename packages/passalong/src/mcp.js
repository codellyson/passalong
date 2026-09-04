// The Passalong MCP server (stdio). This is the rail that makes Passalong tool-agnostic: any MCP-capable
// agent can search, pull, and publish guides without leaving its session.
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
    { name: "passalong", version: "0.1.0" },
    {
      instructions:
        "Passalong hands finished implementations between contexts as transfer guides: markdown with " +
        `frontmatter and the sections ${SECTIONS.join(", ")}. ` +
        "When the user references a passalong id or link, call get_guide and follow its Steps, adapting " +
        "anything marked ASSUMES to this codebase; run its Verification before declaring done. " +
        "When the user asks to share, hand off, or passalong what was just done, distill the session " +
        "into a guide (guide_template shows the shape) and call publish_guide. Gotchas are the " +
        "highest-value section: record what failed and why.",
    },
  );

  server.registerTool(
    "search_guides",
    {
      title: "Search guides",
      description:
        "Search the user's transfer guides (local and synced) by words in the title, tags, stack, " +
        "or body. Empty query lists everything, newest first.",
      inputSchema: { query: z.string().default("") },
    },
    async ({ query }) => {
      try {
        const rows = await passalong.list(query);
        return json({ guides: rows, warning: rows.warning });
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
        "Fetch a transfer guide by passalong id or share link and return its full markdown. Also writes " +
        "it to .passalong/<id>.md in the working directory so it survives the session.",
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
        "author, and source_context are filled in. Returns the id and share link.",
      inputSchema: {
        markdown: z.string().describe("full guide markdown; start from guide_template"),
        cwd: z
          .string()
          .optional()
          .describe("directory the work happened in, used to infer source_context"),
      },
    },
    async ({ markdown, cwd }) => {
      try {
        const { guide, url, synced, path } = await passalong.share(markdown, {
          cwd: cwd || process.cwd(),
        });
        return json({ id: guide.meta.id, title: guide.meta.title, url, synced, path });
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
        "Mark a guide consumed (implemented on the receiving side) or promoted (a reusable reference).",
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
