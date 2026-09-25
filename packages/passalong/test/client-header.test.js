import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// The server refuses a CLI below its floor, and knows which CLI it is only from this header. A
// build that stopped sending it would look like one from before 0.12.0 and be refused.
test("every authenticated call says which passalong it is", async () => {
  process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-header-"));
  process.env.PASSALONG_API = "http://localhost:1";
  process.env.PASSALONG_TOKEN = "t";
  const version = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ).version;
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push(init.headers);
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const api = await import("../src/api.js");
    assert.equal(api.VERSION, version);
    await api.me();
    await api.uploadShot(Buffer.from("x"), "image/png");
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(seen.length, 2);
  for (const h of seen) assert.equal(h["x-passalong-version"], version);
});
