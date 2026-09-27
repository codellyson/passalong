// Frontmatter the format cannot hold is refused by name, never emptied.
//
// Both parsers keep only a key's own line, so a nested map, a block scalar or a sequence under a
// field that is not a list came back as `""` with its content gone. A design.md whose `colors:` and
// `typography:` blocks were its whole point shrank by a quarter on a round trip and would have
// published without a word. `unheldFields` names those keys; this holds the two copies of it to the
// same answers, and holds the corpus to having none.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as js from "../../../packages/passalong/src/guide.js";
import * as ts from "../src/guide.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "..", "..", "packages", "passalong", "fixtures", "guides");

const doc = (front) => `---\n${front}\n---\n\nbody\n`;

const CASES = [
  ["a nested map", "title: t\nkind: transfer\ncolors:\n  primary: \"#3ECF8E\"\n  accent: x", ["colors"]],
  [
    "a map nested two deep",
    "title: t\nkind: transfer\ntypography:\n  display:\n    fontSize: 72px",
    ["typography"],
  ],
  ["a block scalar", "title: t\nkind: transfer\ndescription: |\n  line one\n  line two", ["description"]],
  ["a sequence under a field that is not a list", "title: t\nkind: transfer\nowners:\n  - ada", ["owners"]],
  ["several at once, each named once", "colors:\n  a: 1\n  b: 2\nspacing:\n  xs: 4px\ntitle: t", ["colors", "spacing"]],
  ["a block list under a list field", "title: t\ntags:\n  - ui\n  - design", []],
  ["a block list flush with its key", "title: t\nstack_assumptions:\n- node 22", []],
  ["an inline list", "title: t\ntags: [ui, design]", []],
  ["blank lines and comments", "title: t\n\n# a note\nkind: bug", []],
  ["an empty scalar", "title: t\nto:", []],
];

for (const [name, front, want] of CASES) {
  test(`unheldFields: ${name}`, () => {
    assert.deepEqual(js.unheldFields(doc(front)), want, "guide.js");
    assert.deepEqual(ts.unheldFields(doc(front)), want, "guide.ts");
  });
}

test("unheldFields: a document with no frontmatter holds nothing it could lose", () => {
  assert.deepEqual(js.unheldFields("# just a body\n"), []);
  assert.deepEqual(ts.unheldFields("# just a body\n"), []);
});

test("unheldFields: nothing in the corpus is refused", () => {
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".md") && f !== "README.md")) {
    const md = readFileSync(join(DIR, f), "utf8");
    assert.deepEqual(js.unheldFields(md), [], `${f} (guide.js)`);
    assert.deepEqual(ts.unheldFields(md), [], `${f} (guide.ts)`);
  }
});
