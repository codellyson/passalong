// public/llms.txt is what an agent reads to learn how to use Passalong. A doc that names a
// status or a section the code does not have is worse than no doc: the reader has no way to tell
// it is wrong. These tests pin the parts that are defined in code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { STATUSES } from "../src/work.ts";

// llms.txt moved to apps/web with the rest of what a browser or a crawler fetches; the test stays
// here because what it pins llms.txt against — STATUSES — is defined here.
const llms = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "public", "llms.txt"),
  "utf8",
);

test("every status is documented", () => {
  for (const s of STATUSES) {
    assert.ok(llms.includes(`\`${s}\``), `llms.txt does not mention the "${s}" status`);
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
