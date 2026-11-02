// Projects, documents and work are three different things, and an agent that mixes them up loses
// work: open defects written as documents have no owner, no state and tell nobody. Both MCP servers
// state one rule for sorting them, and say where a project lives, so an agent never reports a space
// it only assumed. This holds the two servers, and the public page for agents, to the same words.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
// Adjacent string literals joined, so a sentence the formatter broke across a `" + "` still reads
// as the sentence it is.
const said = (src) => src.replace(/["']\s*\+\s*\n?\s*["']/g, "");
const SOURCES = {
  stdio: said(read("../src/mcp.js")),
  http: said(read("../../../apps/api/src/mcp-http.ts")),
};
const LLMS = read("../../../apps/web/public/llms.txt");

for (const [name, src] of Object.entries(SOURCES)) {
  test(`${name}: the instructions sort everything into documents and work`, () => {
    assert.match(src, /A PROJECT IS A PLACE; ITS DOCUMENTS ARE WHAT TO KNOW; WORK IS WHAT TO DO/);
    assert.match(src, /open work recorded only as a document is lost/);
    assert.match(src, /WHERE A PROJECT LIVES is in the `space` field/);
  });
  test(`${name}: the document tool sends open work to create_work`, () => {
    const tool = src.slice(src.indexOf('"save_document"'));
    assert.match(tool.slice(0, 1200), /anything someone must still act on is work \(create_work\)/);
  });
}

// llms.txt is apps/web's, and says it in the same words for an agent reading the site.
test("llms.txt states the same rule", () => {
  assert.match(LLMS, /A project is a place; its documents are what to know; work is what to do/);
  assert.match(LLMS, /open work recorded only as a document is lost/);
  assert.match(LLMS, /`space` field/);
});
