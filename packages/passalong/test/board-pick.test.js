import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// In a coding agent the board is text, so the Ready list comes as a picker the person clicks
// (elicitation). The choice goes back to the agent to `take`; find_work itself only reads.
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-board-pick-"));
process.env.PASSALONG_API = "http://fake.test";
process.env.PASSALONG_TOKEN = "t";
process.env.PASSALONG_NO_UPDATE_CHECK = "1";
const { buildServer } = await import("../src/mcp.js");

const json = (body) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (u.pathname === "/v1/tasks")
    return json({
      tasks: [
        { id: "aaaaaaaa", title: "Old one", state: "ready", url: "u" },
        { id: "bbbbbbbb", title: "For me", state: "ready", to: "@me", for_me: true, url: "u" },
      ],
    });
  if (u.pathname === "/v1/working") return json({ working: [] });
  return json({});
};

async function board(answer, capabilities = { elicitation: {} }) {
  const [left, right] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" }, { capabilities });
  const asked = [];
  if (capabilities.elicitation)
    client.setRequestHandler(ElicitRequestSchema, (req) => {
      asked.push(req.params.requestedSchema.properties.work.enum);
      return answer(req.params.requestedSchema.properties.work.enum);
    });
  await Promise.all([buildServer().connect(right), client.connect(left)]);
  const r = await client.callTool({ name: "find_work", arguments: {} });
  await client.close();
  return { b: r.structuredContent, asked };
}

test("the person picks Ready work and the agent is told to take it", async () => {
  const { b, asked } = await board((labels) => ({
    action: "accept",
    content: { work: labels[0] },
  }));
  assert.deepEqual(asked, [["For me · You · bbbbbbbb", "Old one · Anyone · aaaaaaaa"]]);
  assert.equal(b.chosen, "bbbbbbbb");
  assert.match(b.next, /call take bbbbbbbb/);
});

test("declined, or a client without the picker, is the board as before", async () => {
  const declined = await board(() => ({ action: "decline" }));
  assert.equal(declined.b.chosen, undefined);
  assert.equal(declined.b.ready_by_lane.length, 2);
  const plain = await board(null, {});
  assert.deepEqual(plain.asked, []);
  assert.equal(plain.b.chosen, undefined);
});

test("the stdio board is drawn as the same MCP App page, with Take", async () => {
  const [left, right] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([buildServer().connect(right), client.connect(left)]);
  const { tools } = await client.listTools();
  const finder = tools.find((t) => t.name === "find_work");
  assert.equal(finder._meta.ui.resourceUri, "ui://passalong/work");
  const { contents } = await client.readResource({ uri: "ui://passalong/work" });
  await client.close();
  assert.equal(contents[0].mimeType, "text/html;profile=mcp-app");
  assert.match(contents[0].text, /data-take=/);
});

test("a host that draws the board is told not to list it again", async () => {
  const { b } = await board(undefined, {
    extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } },
  });
  assert.match(b.next, /do not list it again/);
  const { b: plain } = await board(undefined, {});
  assert.equal(plain.next, undefined);
});
