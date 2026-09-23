// The two parsers, held to each other.
//
// `packages/passalong/src/guide.js` defines the guide format; this package's `src/guide.ts`
// mirrors its parsing rules, and AGENTS.md says to change both. That instruction was enforced by
// attention alone until this existed: the two suites tested separate cases over separate inputs,
// and nothing compared the pair on a single byte. A guide is markdown in somebody else's
// repository, so the two drifting apart is not a bug you can deploy your way out of.
//
// The corpus itself lives beside the definition, in packages/passalong/fixtures/guides. This file
// reaches for it on purpose: guide.js is the authority, and the mirror comes to it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as js from "../../../packages/passalong/src/guide.js";
import * as ts from "../src/guide.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "..", "..", "packages", "passalong", "fixtures", "guides");
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
    // guide.js trims what it returns and guide.ts hands back the slice, so the comparison is on
    // the trimmed form — that difference is in the signatures, not in where the cut falls.
    assert.equal(ts.body(raw).trim(), js.parse(raw).body, `${name}: the body differs`);
    assert.equal(ts.split(raw)?.body.trim(), js.parse(raw).body, `${name}: split disagrees`);
  });

  test(`${name}: both parsers agree on the sections it has`, () => {
    // `splitSections` keeps the preamble and the author's order, which `sections` does not — that
    // is written down in guide.ts and is deliberate. What must not differ is the headings found
    // and the text under each.
    const mine = js.sections(js.parse(read(name)).body);
    const theirs = ts.splitSections(ts.body(read(name))).by;
    assert.deepEqual(theirs, mine, `${name}: the sections differ`);
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

test("both find the same unreachable images, and leave the same ones alone", () => {
  const doc =
    "![a](attachment://x.png)\n![b](data:image/png;base64,AAAA)\n![c](blob:http://x/y)\n" +
    "![d](file:///tmp/x.png)\n![ok](https://example.test/x.png)\n![rel](./x.png)\n";
  assert.deepEqual(ts.unreachableImages(doc), js.unreachableImages(doc));
  // Not vacuous: the foreign schemes are found, and the two legitimate ones are not.
  assert.equal(js.unreachableImages(doc).length, 4);
});
