import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const at = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// The version in the MCP handshake is how a client knows which build it is talking to, and it said
// 0.2.0 for two releases while the package was 0.2.2. It is read from package.json now; this pins
// that it stays read rather than written, because a literal is what drifted.
test("the MCP server reports the package version, not a literal", () => {
  const mcp = at("../src/mcp.js");
  const version = JSON.parse(at("../package.json")).version;
  assert.match(mcp, /version: VERSION/, "serverInfo takes the version from package.json");
  assert.doesNotMatch(
    mcp,
    /version:\s*"\d+\.\d+\.\d+"/,
    "no hardcoded version — `pnpm release` bumps package.json, and that has to be the only place",
  );
  assert.match(version, /^\d+\.\d+\.\d+$/);
});
