// What the stdio server tells a client about its own tools.
//
// MCP's defaults for a tool that declares nothing are the worst case — it writes, it may destroy,
// it reaches outside — and clients act on them. apps/api/src/mcp-http.ts has said what each of its
// tools does since it was written; this server, which is the surface most agents actually reach,
// said nothing at all. These assertions are the part of that which can be checked mechanically:
// every tool describes itself, and a tool that promises a shape returns that shape.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

/** docs/WORK.md, "Agent tools: 17, four nouns". */
const TOOLS = [
  "take",
  "progress",
  "hand_in",
  "pass",
  "ask",
  "create_work",
  "find_work",
  "update_work",
  "find_projects",
  "save_project",
  "read_document",
  "save_document",
  "delete_document",
  "add_file",
  "read_file",
  "delete_file",
  "accounts",
];
// `accounts` reads, and `use` is this process remembering a name: nothing on disk or on the server
// changes, so the machine's default stays where it was.
const READ_ONLY = ["find_work", "find_projects", "read_document", "read_file", "accounts"];

test("the surface is the seventeen tools, and nothing else", async () => {
  assert.deepEqual([...(await tools()).keys()].sort(), [...TOOLS].sort());
});

test("no tool name, description or instruction says guide: four nouns, work, project, document, file", async () => {
  const [left, right] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([buildServer().connect(right), client.connect(left)]);
  const { tools: listed } = await client.listTools();
  const said = JSON.stringify({ instructions: client.getInstructions(), listed });
  await client.close();
  assert.doesNotMatch(said, /guide/i);
});

test("every tool says what it does to the world", async () => {
  const all = await tools();
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
  for (const name of TOOLS.filter((t) => !READ_ONLY.includes(t)))
    assert.equal(all.get(name).annotations.readOnlyHint, false, `${name} writes`);
});

test("only the calls that replace or remove something say they are destructive", async () => {
  const all = await tools();
  const destructive = [...all]
    .filter(([, t]) => t.annotations.destructiveHint === true)
    .map(([name]) => name);
  // update_work's `markdown` replaces the text that was there, and the two deletes remove what
  // cannot be brought back. save_document is not here: every version of a document is kept.
  assert.deepEqual(destructive.sort(), ["delete_document", "delete_file", "update_work"]);
});

test("only the tools that reach outside Passalong say so", async () => {
  const all = await tools();
  const outside = [...all]
    .filter(([, t]) => t.annotations.openWorldHint === true)
    .map(([name]) => name);
  // A file on this machine that Passalong did not put there.
  assert.deepEqual(outside, ["add_file"]);
});

test("a tool promises a shape only where this server decides the shape", async () => {
  const all = await tools();
  const promised = [...all].filter(([, t]) => t.outputSchema).map(([name]) => name);
  // `outputSchema` puts the MUST on the server, so it is declared only for the calls that answer
  // with a record this server writes. `take` answers with the work's markdown to read, which is
  // why it is not here.
  assert.deepEqual(promised.sort(), ["ask", "hand_in", "pass", "progress"]);
  for (const name of promised) {
    const schema = all.get(name).outputSchema;
    assert.equal(schema.type, "object", `${name} must describe an object`);
    assert.deepEqual(
      schema.required ?? [],
      [],
      `${name} must not require a key a route may stop sending`,
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

test("a hand-in has somewhere to say what it took, and both servers offer it", async () => {
  // What had to be adapted to make it work once went out as a second document with an id, a share
  // link and an inbox row asking somebody to take it. It belongs on the hand-in.
  const hand = (await tools()).get("hand_in");
  const writeup = hand.inputSchema.properties.writeup;
  assert.ok(writeup, "hand_in takes a write-up");
  assert.doesNotMatch(
    JSON.stringify(hand.inputSchema.required ?? []),
    /writeup/,
    "and never requires one: most hand-ins have nothing to adapt",
  );
  assert.match(writeup.description, /adapt/i);

  // Said the same way on the surface reached over HTTP. Two servers describing one call two
  // different ways is how an agent learns a rule on one and breaks it on the other.
  const http = await readFile(
    new URL("../../../apps/api/src/mcp-http.ts", import.meta.url),
    "utf8",
  );
  assert.match(http, /writeup: z\s*\n?\s*\.string\(\)/, "the HTTP server takes it too");
  assert.match(http, /writeup: args\.writeup/, "and passes it on");
});

/**
 * The two servers say the same things in front of the work an agent takes. Each block is written
 * out once per server and held together by a comment saying "mirrors the other one"; a comment does
 * not fail. An agent reaching Passalong over HTTP and one reaching it over stdio do the same work.
 */
test("both servers say the same thing in front of the work", async () => {
  const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
  const [stdio, http] = await Promise.all([
    read("../src/mcp.js"),
    read("../../../apps/api/src/mcp-http.ts"),
  ]);
  // Adjacent string literals are joined before matching: the formatter chooses the breaks.
  const said = (src) => src.replace(/["']\s*\+\s*\n?\s*["']/g, "");
  for (const line of [
    "KEEP YOUR EVIDENCE AS YOU GO",
    "SEARCH THE WHOLE TREE BEFORE YOU CONCLUDE",
    '"I looked" is a claim; the search and what it printed is evidence',
    // The upload tool once named one destination, the document, while hand_in said not to publish
    // anything for evidence — so six screenshots of a delivered change became a second document.
    "WHERE THE LINE GOES DEPENDS ON WHAT THE FILE IS EVIDENCE OF",
    "DO NOT WRITE NEW WORK TO CARRY SCREENSHOTS",
    // Added after an agent short of a picture built a page to photograph, shot it, deleted it, and
    // offered the shots as evidence that the real screen rendered.
    "SHOOT THE RUNNING THING, NOT SOMETHING YOU BUILT TO SHOOT",
    "NEVER DELETE WHAT YOUR EVIDENCE POINTS AT",
    "A PROJECT IS A PLACE; ITS DOCUMENTS ARE WHAT TO KNOW; WORK IS WHAT TO DO",
    "WHAT YOU LEARN GOES INTO THE PROJECT'S DOCUMENTS",
  ]) {
    assert.ok(said(stdio).includes(line), `stdio is missing: ${line}`);
    assert.ok(said(http).includes(line), `the HTTP server is missing: ${line}`);
  }
  // And both put all three in front of every piece of work taken, with no kind to choose by.
  for (const src of [stdio, http]) {
    assert.match(src, /const LEAD = SEARCH_WIDE \+ SHOOT_THE_REAL_THING \+ KEEP_EVIDENCE;/);
    assert.equal(src.split("${LEAD}").length - 1, 1, "and LEAD is said once, on take");
  }
});

test("a file goes in whether you have a path or only the bytes", async () => {
  // The rule that a check is run or shown is only as good as the door into "shown". An agent
  // driving a browser usually has the image as a tool result and never a file on disk.
  const add = (await tools()).get("add_file");
  const props = add.inputSchema.properties;
  assert.ok(props.file, "a path works");
  assert.ok(props.data, "and so do the bytes");
  assert.ok(props.project, "and it can be kept in a project instead");
  assert.match(props.data.description, /base64/);
  assert.deepEqual(add.inputSchema.required ?? [], [], "none is required on its own");
  assert.match(props.type.description, /image\/png/);
  assert.match(add.description, /`ran` on hand_in/, "proof of a hand-in goes on the hand-in");
  assert.match(add.description, /DO NOT WRITE NEW WORK TO CARRY SCREENSHOTS/);
});

test("find_work reads large work by outline, by section, or whole", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "passalong-sections-"));
  const filler = "x".repeat(25_000);
  const file = join(dir, "big.md");
  writeFileSync(
    file,
    [
      "---",
      "id: bigguide",
      "title: A big one",
      "summary: Work with a lot in it.",
      "status: published",
      "---",
      "",
      "## Background",
      filler,
      "",
      "## What to change",
      "1. the one thing",
      "",
    ].join("\n"),
  );
  const [left, right] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([buildServer().connect(right), client.connect(left)]);
  const read = async (args) =>
    (await client.callTool({ name: "find_work", arguments: { id: file, ...args } })).content[0]
      .text;

  const first = await read({});
  assert.match(first, /Sections:/);
  assert.match(first, /- Background \(/);
  assert.match(first, /Work with a lot in it\./, "the summary comes first");
  assert.match(first, /find_work id=bigguide section=/);
  assert.ok(first.length < 1500, "large work comes back as an outline");

  const part = await read({ section: "what to" });
  assert.match(part, /the one thing/);
  assert.ok(!part.includes(filler), "only the part asked for");

  const missing = await read({ section: "nothing like it" });
  assert.match(missing, /No heading matching/);
  assert.match(missing, /- What to change \(/, "and it says what there is instead");

  const whole = await read({ full: true });
  assert.ok(whole.includes(filler), "full gives all of it");
  assert.match(whole, /call take bigguide/, "and reading it is not taking it");
  await client.close();
});

test("hand_in takes a bare string as a check line, so the refusal is ours and not a schema error", async () => {
  const [left, right] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([buildServer().connect(right), client.connect(left)]);
  const res = await client.callTool({
    name: "hand_in",
    arguments: { id: "abcd1234", note: "did it", checks: ["tsc --noEmit -p ."] },
  });
  await client.close();
  const said = JSON.stringify(res.content);
  assert.doesNotMatch(said, /Expected object, received string/);
  assert.doesNotMatch(said, /Invalid arguments/i);
  const t = (await tools()).get("hand_in");
  assert.equal(t.inputSchema.properties.checks.items.type, "object", "listed as an object still");
});
