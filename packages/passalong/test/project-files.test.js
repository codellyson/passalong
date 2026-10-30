import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { addFolderAsset } from "../src/api.js";

test("a local agent uploads folder asset bytes with their name, not JSON", async () => {
  const file = fileURLToPath(import.meta.url);
  const expected = await readFile(file);
  const realFetch = globalThis.fetch;
  const token = process.env.PASSALONG_TOKEN;
  process.env.PASSALONG_TOKEN = "test-token";
  globalThis.fetch = async (url, init) => {
    assert.match(url, /\/v1\/folders\/folder123\/assets$/);
    assert.equal(init.method, "POST");
    assert.equal(init.headers["content-type"], "application/octet-stream");
    assert.equal(init.headers["x-file-name"], "notes.txt");
    assert.deepEqual(new Uint8Array(init.body), new Uint8Array(expected));
    return Response.json({ asset: { id: "asset123", name: "notes.txt" } }, { status: 201 });
  };
  try {
    const result = await addFolderAsset("folder123", file, "notes.txt");
    assert.equal(result.asset.id, "asset123");
  } finally {
    globalThis.fetch = realFetch;
    if (token === undefined) delete process.env.PASSALONG_TOKEN;
    else process.env.PASSALONG_TOKEN = token;
  }
});
