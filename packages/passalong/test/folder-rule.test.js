// Folders, documents and guides are three different things, and an agent that mixes them up loses
// work: open defects filed as documents have no owner, no state and tell nobody. Both MCP servers
// state one rule for sorting them, and say where a folder lives, so an agent never reports a space
// it only assumed. This holds the two servers and the public guide to the same words.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const SOURCES = {
  stdio: read("../src/mcp.js"),
  http: read("../../../apps/api/src/mcp-http.ts"),
};
const LLMS = read("../../../apps/web/public/llms.txt");

for (const [name, src] of Object.entries(SOURCES)) {
  test(`${name}: the instructions sort folder items into documents and guides`, () => {
    assert.match(src, /A FOLDER IS A PLACE; ITS DOCUMENTS ARE WHAT TO KNOW; GUIDES ARE WHAT TO DO/);
    assert.match(src, /open work recorded only as a document is lost/);
    assert.match(src, /WHERE A FOLDER LIVES is in the `space` field/);
  });
  test(`${name}: the document tool sends open work to a guide`, () => {
    const tool = src.slice(src.indexOf('"create_folder_document"'));
    assert.match(tool.slice(0, 800), /belongs in a bug or task guide linked to the folder instead/);
  });
}

test("llms.txt states the same rule", () => {
  assert.match(LLMS, /A folder is a place; its documents are what to know; guides are what to do/);
  assert.match(LLMS, /`space` field/);
});
