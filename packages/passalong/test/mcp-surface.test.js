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

const READ_ONLY = [
  "search_guides",
  "inbox",
  "board",
  "log",
  "get_guide",
  "guide_template",
  "activity",
];
const WRITES = [
  "ask",
  "attach_file",
  "reply",
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
  // Was `activity` with a `mark_read` flag, which made one tool read on one call and write on the
  // next — so its annotation had to claim it writes, on every call, to be honest about one of them.
  "clear_activity",
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

test("only the tools that reach outside Passalong say so", async () => {
  const all = await tools();
  const outside = [...all]
    .filter(([, t]) => t.annotations.openWorldHint === true)
    .map(([name]) => name);
  // A file on this machine that Passalong did not put there.
  assert.deepEqual(outside.sort(), ["attach_file", "attach_screenshot"]);
});

test("a tool promises a shape only where this server decides the shape", async () => {
  const all = await tools();
  const promised = [...all].filter(([, t]) => t.outputSchema).map(([name]) => name);
  // `outputSchema` puts the MUST on the server, so it is declared only for the calls that answer
  // with a record this server writes. `take` answers with the guide's markdown to read, which is
  // why it is not here.
  assert.deepEqual(promised.sort(), ["ask", "hand_in", "pass", "progress"]);
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

test("a hand-in has somewhere to say what it took, and both servers offer it", async () => {
  // The last channel an agent had to publish a guide for. A handoff that WORKED, and had to adapt
  // something to get there, could answer with `ok` (a boolean), `note` (280 characters) and
  // `evidence` (refused unless it is what you ran). The adaptation went out as a follow-up guide
  // with an id, a share link and an inbox row asking somebody to take it.
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
 * The two servers say the same things in front of a guide.
 *
 * `KEEP_EVIDENCE` and `SEARCH_WIDE` are written out once per server and held together by a comment
 * that says "mirrors the other one". A comment does not fail. An agent reaching Passalong over
 * HTTP and an agent reaching it over stdio are the same agent doing the same work, and a rule that
 * reached one of them was a rule half the users never got.
 */
test("both servers say the same thing in front of a guide", async () => {
  const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
  const [stdio, http] = await Promise.all([
    read("../src/mcp.js"),
    read("../../../apps/api/src/mcp-http.ts"),
  ]);
  // Adjacent string literals are joined before matching. These blocks are written as a run of
  // concatenated pieces and the formatter chooses the breaks, so a sentence that reads as one
  // thing in the file crosses a `" + "` in the source — and matching the raw text would fail on a
  // reflow that changed nothing anybody reads.
  const said = (src) => src.replace(/["']\s*\+\s*\n?\s*["']/g, "");
  for (const line of [
    "KEEP YOUR EVIDENCE AS YOU GO",
    "SEARCH THE WHOLE TREE BEFORE YOU CONCLUDE",
    '"I looked" is a claim; the search and what it printed is evidence',
    // This one is why the rule has a test. attach_screenshot said "put that line in the guide
    // body" while hand_in said "do not publish a guide to carry your evidence", and only the first
    // named a destination — so six screenshots of a delivered change were published as a guide
    // with Problem, Solution shape, Decisions, Steps, Verification and Gotchas wrapped round them.
    "WHERE THE LINE GOES DEPENDS ON WHAT THE IMAGE IS EVIDENCE OF",
    "DO NOT PUBLISH A GUIDE TO CARRY SCREENSHOTS",
    // Added after an agent short of a picture built `src/app/notes-preview` to have something to
    // photograph, shot it, `rm -rf`'d it, and offered the shots as evidence that the real screen
    // rendered. The rule was satisfied; the page in the picture no longer existed.
    "SHOOT THE RUNNING THING, NOT SOMETHING YOU BUILT TO SHOOT",
    "NEVER DELETE WHAT YOUR EVIDENCE POINTS AT",
  ]) {
    assert.ok(said(stdio).includes(line), `stdio is missing: ${line}`);
    assert.ok(said(http).includes(line), `the HTTP server is missing: ${line}`);
  }
  // And both attach it to the two kinds an agent has to locate things in for itself. A transfer
  // guide gets neither, on purpose: it is handed over untouched, and anything in front of it is
  // one more thing that is not the document.
  for (const src of [stdio, http]) {
    assert.equal(src.split("SEARCH_WIDE +").length - 1, 2, "on the bug lead and the task lead");
    assert.equal(src.split("SHOOT_THE_REAL_THING +").length - 1, 2, "and so is this one");
  }
});

test("a screenshot goes in whether you have a file or only the bytes", async () => {
  // The rule that a check is run or shown is only as good as the door into "shown". attach_screenshot
  // took a path on this machine, and an agent driving a browser usually has the opposite: the pane
  // hands the image back as a tool result and never writes a file. The agent did what anyone would
  // — swapped to grep and tsc checks, put what it saw in `writeup` — and said so: "a grep proves
  // the code changed, not that the screen renders right."
  const shot = (await tools()).get("attach_screenshot");
  const props = shot.inputSchema.properties;
  assert.ok(props.file, "a path still works");
  assert.ok(props.data, "and so do the bytes");
  assert.match(props.data.description, /base64/);
  assert.deepEqual(shot.inputSchema.required ?? [], [], "neither is required on its own");
  assert.match(props.type.description, /image\/png/);
});

test("attach_screenshot sends hand-in evidence to the hand-in, not to a guide", async () => {
  // The contradiction that produced a 1500-word guide to deliver six pictures: this tool named one
  // destination, the guide body, and hand_in said not to publish a guide for evidence. An agent
  // holding a screenshot of work it was handing in could satisfy only one of them.
  const shot = (await tools()).get("attach_screenshot");
  assert.match(shot.description, /`ran` on hand_in/, "proof of a hand-in goes on the hand-in");
  assert.match(shot.description, /nothing is published/);
  assert.match(shot.description, /part of a DOCUMENT goes in a guide body/, "and the other case");
  assert.match(shot.description, /DO NOT PUBLISH A GUIDE TO CARRY SCREENSHOTS/);
});

test("get_guide reads a large guide by outline, by section, or whole", async () => {
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
      "summary: A guide with a lot in it.",
      "kind: transfer",
      "status: published",
      "---",
      "",
      "## Problem",
      filler,
      "",
      "## Steps",
      "1. do the one thing",
      "",
    ].join("\n"),
  );
  const [left, right] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([buildServer().connect(right), client.connect(left)]);
  const read = async (args) =>
    (await client.callTool({ name: "get_guide", arguments: { ref: file, cwd: dir, ...args } }))
      .content[0].text;

  const first = await read({});
  assert.match(first, /Sections:/);
  assert.match(first, /- Problem \(/);
  assert.match(first, /A guide with a lot in it\./, "the summary comes first");
  assert.ok(first.length < 1500, "a large guide comes back as an outline");

  const part = await read({ section: "steps" });
  assert.match(part, /do the one thing/);
  assert.ok(!part.includes(filler), "only the part asked for");

  const missing = await read({ section: "nothing like it" });
  assert.match(missing, /No heading matching/);
  assert.match(missing, /- Steps \(/, "and it says what there is instead");

  const whole = await read({ full: true });
  assert.ok(whole.includes(filler), "full gives all of it");
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
