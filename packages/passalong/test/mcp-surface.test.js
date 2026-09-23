// What the stdio server tells a client about its own tools.
//
// MCP's defaults for a tool that declares nothing are the worst case — it writes, it may destroy,
// it reaches outside — and clients act on them. apps/api/src/mcp-http.ts has said what each of its
// tools does since it was written; this server, which is the surface most agents actually reach,
// said nothing at all. These assertions are the part of that which can be checked mechanically:
// every tool describes itself, and a tool that promises a shape returns that shape.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/mcp.js";

/** The tool list as a client sees it, over a real transport pair rather than by reading exports. */
async function tools() {
  const [left, right] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([buildServer().connect(right), client.connect(left)]);
  const { tools } = await client.listTools();
  await client.close();
  return new Map(tools.map((t) => [t.name, t]));
}

const READ_ONLY = ["search_guides", "inbox", "board", "log", "get_guide", "guide_template"];
const WRITES = [
  "assign",
  "plan_tasks",
  "take",
  "progress",
  "hand_in",
  "pass",
  "file_bugs",
  "set_guide_status",
  "publish_guide",
  "attach_screenshot",
  // Reads by default, and clears the unread feed when asked to. An annotation cannot say
  // "sometimes", so it says the cautious thing.
  "activity",
];

test("every tool says what it does to the world", async () => {
  const all = await tools();
  assert.ok(all.size >= 17, `expected the whole surface, saw ${all.size}`);
  for (const [name, tool] of all)
    assert.ok(
      tool.annotations && typeof tool.annotations.readOnlyHint === "boolean",
      `${name} declares nothing, so a client assumes the worst case`,
    );
});

test("a tool that only reads says so, and a tool that writes does not claim to", async () => {
  const all = await tools();
  for (const name of READ_ONLY) {
    assert.ok(all.has(name), `${name} is missing`);
    assert.equal(all.get(name).annotations.readOnlyHint, true, `${name} only reads`);
  }
  for (const name of WRITES) {
    assert.ok(all.has(name), `${name} is missing`);
    assert.equal(all.get(name).annotations.readOnlyHint, false, `${name} writes`);
  }
  assert.equal(READ_ONLY.length + WRITES.length, all.size, "a tool was added and not classified");
});

test("nothing claims to be destructive except the one call that replaces a document", async () => {
  const all = await tools();
  const destructive = [...all]
    .filter(([, t]) => t.annotations.destructiveHint === true)
    .map(([name]) => name);
  // Publishing with an id that already exists replaces that guide. Everything else only adds.
  assert.deepEqual(destructive, ["publish_guide"]);
});

test("only the tool that reaches outside Passalong says it does", async () => {
  const all = await tools();
  const outside = [...all]
    .filter(([, t]) => t.annotations.openWorldHint === true)
    .map(([name]) => name);
  // A file on this machine that Passalong did not put there.
  assert.deepEqual(outside, ["attach_screenshot"]);
});

test("a tool promises a shape only where this server decides the shape", async () => {
  const all = await tools();
  const promised = [...all].filter(([, t]) => t.outputSchema).map(([name]) => name);
  // `outputSchema` puts the MUST on the server, so it is declared only for the calls that answer
  // with a record this server writes. `take` answers with the guide's markdown to read, which is
  // why it is not here.
  assert.deepEqual(promised.sort(), ["hand_in", "pass", "progress"]);
  for (const name of promised) {
    const schema = all.get(name).outputSchema;
    assert.equal(schema.type, "object", `${name} must describe an object`);
    assert.deepEqual(
      schema.required ?? [],
      [],
      `${name} must not require a key a kind may not have`,
    );
    // The one that bit. Handing registerTool a `.shape` instead of the object rebuilds it closed
    // and advertises `additionalProperties: false`, which is this server promising an answer
    // carries nothing else — a promise the next field added to a route breaks.
    assert.notEqual(
      schema.additionalProperties,
      false,
      `${name} would refuse a field a route adds later`,
    );
  }
});
