// public/llms.txt is what an agent reads to learn how to use Passalong. A doc that names a
// status or a section the code does not have is worse than no doc: the reader has no way to tell
// it is wrong. These tests pin the parts that are defined in code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { STATUSES, VERIFY_LEAD } from "../src/guide.ts";

const llms = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "public", "llms.txt"),
  "utf8",
);

// Kept in step with packages/passalong/src/guide.js, which is the other half of this format.
const SECTIONS = [
  "Problem",
  "Solution shape",
  "Decisions and rationale",
  "Steps",
  "Verification",
  "Gotchas",
];

test("every guide section is documented, spelled the way the parser expects", () => {
  for (const s of SECTIONS) {
    assert.ok(llms.includes(`## ${s}`), `llms.txt does not document the "${s}" section`);
  }
});

test("the sections are listed in the order a guide presents them", () => {
  const positions = SECTIONS.map((s) => llms.indexOf(`## ${s}`));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
    "llms.txt lists the sections out of order",
  );
});

test("every status is documented", () => {
  for (const s of STATUSES) {
    assert.ok(llms.includes(`\`${s}\``), `llms.txt does not mention the "${s}" status`);
  }
});

test("the sections the verify view leads with are the ones a reader is told to read first", () => {
  // If VERIFY_LEAD changes, the "Verification is what done means" guidance needs to change too.
  for (const s of VERIFY_LEAD) {
    assert.ok(llms.includes(s), `llms.txt does not mention "${s}", which the verify view leads on`);
  }
});

test("every MCP tool the server registers is documented", () => {
  // Read the source rather than importing it: importing mcp.js starts a server. The registration
  // shape is `server.registerTool(\n  "name",` — the README drifted three tools behind this list
  // before the test existed.
  const mcp = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "packages",
      "passalong",
      "src",
      "mcp.js",
    ),
    "utf8",
  );
  const tools = [...mcp.matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(tools.length >= 9, `expected to find the registered tools, found ${tools.length}`);
  for (const t of tools) {
    assert.ok(llms.includes(`\`${t}\``), `llms.txt does not document the "${t}" MCP tool`);
  }
});

test("it points at the canonical host, not a stale one", () => {
  assert.ok(llms.includes("https://passalong.dev"), "llms.txt does not name the canonical host");
  assert.ok(!llms.includes("kreativekorna"), "llms.txt still points at the old host");
});
