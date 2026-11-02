// The two parsers, held to each other.
//
// `packages/passalong/src/work.js` defines the work format; this package's `src/work.ts`
// mirrors its parsing rules, and AGENTS.md says to change both. That instruction was enforced by
// attention alone until this existed: the two suites tested separate cases over separate inputs,
// and nothing compared the pair on a single byte. A piece of work is markdown in somebody else's
// repository, so the two drifting apart is not a bug you can deploy your way out of.
//
// The corpus itself lives beside the definition, in packages/passalong/fixtures/work. This file
// reaches for it on purpose: work.js is the authority, and the mirror comes to it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as js from "../../../packages/passalong/src/work.js";
import * as ts from "../src/work.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "..", "..", "packages", "passalong", "fixtures", "work");
const NAMES = readdirSync(DIR)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .sort();
const read = (name) => readFileSync(join(DIR, name), "utf8");

test("the corpus is where both sides think it is", () => {
  assert.ok(NAMES.length >= 5, `expected the shared fixtures, found ${NAMES.length}`);
});

for (const name of NAMES) {
  test(`${name}: both parsers read the same frontmatter`, () => {
    const raw = read(name);
    // Key for key and value for value. `parseMeta` returns the same object `parse().meta` does,
    // or one of them has taught itself something the other has not.
    assert.deepEqual(ts.parseMeta(raw), js.parse(raw).meta, `${name}: the frontmatter differs`);
  });

  test(`${name}: both parsers cut the body in the same place`, () => {
    const raw = read(name);
    // work.js trims what it returns and work.ts hands back the slice, so the comparison is on
    // the trimmed form — that difference is in the signatures, not in where the cut falls.
    assert.equal(ts.body(raw).trim(), js.parse(raw).body, `${name}: the body differs`);
    assert.equal(ts.split(raw)?.body.trim(), js.parse(raw).body, `${name}: split disagrees`);
  });

  test(`${name}: both parsers agree on which images are unreachable`, () => {
    const raw = read(name);
    assert.deepEqual(ts.unreachableImages(raw), js.unreachableImages(raw), name);
  });
}

// Inputs a fixture cannot hold, because what is being pinned is the transformation.
const BOTH = [
  ["a tag with an underscore", "---\nid: aaaaaaaa\ntags: [Rate_Limit, rate limit]\n---\n\nb\n"],
  ["a list as a block sequence", "---\nid: aaaaaaaa\nstack_assumptions:\n- hono\n- d1\n---\n\nb\n"],
  ["an empty inline list", "---\nid: aaaaaaaa\ntags: []\n---\n\nb\n"],
  ["a quoted value with a comma", '---\nid: aaaaaaaa\ntitle: "a, b"\n---\n\nb\n'],
  ["a value with a colon", '---\nid: aaaaaaaa\ntitle: "x: y"\n---\n\nb\n'],
  ["a key the format does not know", "---\nid: aaaaaaaa\npriority: 2\n---\n\nb\n"],
  ["a comment line", "---\n# a note\nid: aaaaaaaa\n---\n\nb\n"],
  ["a line that is not a pair", "---\nid: aaaaaaaa\nnot a field\n---\n\nb\n"],
  ["no frontmatter at all", "## Problem\np\n"],
  ["CRLF throughout", "---\r\nid: aaaaaaaa\r\ntags: [a_b]\r\n---\r\n\r\n## Problem\r\np\r\n"],
  ["an unterminated fence", "---\nid: aaaaaaaa\n"],
];

for (const [why, doc] of BOTH)
  test(`both parsers read ${why} the same way`, () => {
    assert.deepEqual(ts.parseMeta(doc), js.parse(doc).meta, "the frontmatter differs");
  });

test("both normalise a tag to the same string", () => {
  for (const raw of ["Rate_Limit", "  spaced  out  ", "#hash!marks?", "--edges--", "", "A-B"])
    assert.equal(ts.tag(raw), js.tag(raw), `tag(${JSON.stringify(raw)})`);
  assert.deepEqual(ts.tagList(["a_b", "a b", "A-B", ""]), js.tagList(["a_b", "a b", "A-B", ""]));
});

test("both refuse a document that says what kind it is, and only that field", () => {
  const doc = (front) => `---\ntitle: t\nsummary: s\n${front}---\n\nb\n`;
  for (const k of ["task", "bug", "transfer"]) {
    assert.deepEqual(ts.retiredFields(doc(`kind: ${k}\n`)), ["kind"]);
    assert.ok(js.validate(js.parse(doc(`kind: ${k}\n`))).some((e) => /`kind:` is gone/.test(e)));
  }
  // A word in the body, or a field that merely starts with the letters, is not the field.
  assert.deepEqual(ts.retiredFields(doc("kindness: yes\n").replace("\nb\n", "\nkind: bug\n")), []);
  for (const name of NAMES) assert.deepEqual(ts.retiredFields(read(name)), [], name);
});

test("both find the same unreachable images, and leave the same ones alone", () => {
  const doc =
    "![a](attachment://x.png)\n![b](data:image/png;base64,AAAA)\n![c](blob:http://x/y)\n" +
    "![d](file:///tmp/x.png)\n![ok](https://example.test/x.png)\n![rel](./x.png)\n";
  assert.deepEqual(ts.unreachableImages(doc), js.unreachableImages(doc));
  // Not vacuous: the foreign schemes are found, and the two legitimate ones are not.
  assert.equal(js.unreachableImages(doc).length, 4);
});
