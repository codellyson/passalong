// The format, held still.
//
// `src/guide.js` defines the guide format and `apps/api/src/guide.ts` mirrors its parsing rules.
// AGENTS.md says to change both, and until this existed that instruction was enforced by
// attention alone: the two suites tested separate cases, and nothing asserted the pair agreed on
// a single byte. Measured against 214 real guides, `serialize(parse(x)) !== x` for 14.5% of them.
//
// This side holds guide.js to the corpus. `apps/api/test/corpus.test.mjs` reads the same files
// and holds the two implementations to each other.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse, sections, serialize, tag, tagList, validate } from "../src/guide.js";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "guides");
const NAMES = readdirSync(DIR)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .sort();
const read = (name) => readFileSync(join(DIR, name), "utf8");

test("the corpus is not empty, and grows with the format", () => {
  // A corpus that quietly emptied itself would make every assertion below vacuous.
  assert.ok(NAMES.length >= 5, `expected the fixtures to still be there, found ${NAMES.length}`);
});

for (const name of NAMES) {
  test(`${name} is written in the form the serializer writes`, () => {
    const raw = read(name);
    // Identity, not a fixed point. The fixtures are canonical on purpose, so a change to
    // META_ORDER, quote() or how a list is written cannot land without editing a file somebody
    // has to read — which is the same file shape as a guide in somebody else's repository.
    assert.equal(
      serialize(parse(raw)),
      raw,
      `${name} changed when it was read and written back. If that is intended, the fixture is ` +
        "the smallest place to see what every published guide would become.",
    );
  });

  test(`${name} still validates`, () => {
    // These are shapes that exist in the wild. A guide shared a month ago has to re-share today,
    // so a new rule that rejects one of these is a breaking change to other people's files.
    assert.deepEqual(validate(parse(read(name))), [], `${name} no longer validates`);
  });
}

test("reading and writing settles after one pass, for every fixture", () => {
  for (const name of NAMES) {
    const once = serialize(parse(read(name)));
    assert.equal(serialize(parse(once)), once, `${name} does not settle`);
  }
});

// The normalisations that are meant to happen, written as the pairs they are. A fixture file
// cannot hold these: it would be its own output, and the transformation would be invisible.
const NORMALISED = [
  {
    why: "frontmatter comes back in META_ORDER, whatever order it was written in",
    from: "---\ntitle: T\nid: aaaaaaaa\nstatus: draft\nkind: transfer\n---\n\n## Problem\np\n",
    to: "---\nid: aaaaaaaa\ntitle: T\nkind: transfer\nstatus: draft\nstack_assumptions: []\ntags: []\n---\n\n## Problem\np\n",
  },
  {
    why: "a key the format does not know keeps its place after the ones it does",
    from: "---\nurl: https://a.test\nid: aaaaaaaa\ntitle: T\n---\n\n## Problem\np\n",
    to: '---\nid: aaaaaaaa\ntitle: T\nstack_assumptions: []\ntags: []\nurl: "https://a.test"\n---\n\n## Problem\np\n',
  },
  {
    why: "a timestamp is quoted, because a bare one has colons in it",
    from: "---\nid: aaaaaaaa\ntitle: T\ncreated: 2026-01-02T03:04:05.000Z\n---\n\n## Problem\np\n",
    to: '---\nid: aaaaaaaa\ntitle: T\ncreated: "2026-01-02T03:04:05.000Z"\nstack_assumptions: []\ntags: []\n---\n\n## Problem\np\n',
  },
  {
    why: "tags are one style: lowercase, hyphenated, deduped once two spellings become one",
    from: '---\nid: aaaaaaaa\ntitle: T\ntags: [Rate_Limit, rate limit, "", rate-limit]\n---\n\n## Problem\np\n',
    to: "---\nid: aaaaaaaa\ntitle: T\nstack_assumptions: []\ntags: [rate-limit]\n---\n\n## Problem\np\n",
  },
  {
    why: "a list written as a block sequence comes back inline",
    from: "---\nid: aaaaaaaa\ntitle: T\nstack_assumptions:\n- hono\n- d1\n---\n\n## Problem\np\n",
    to: "---\nid: aaaaaaaa\ntitle: T\nstack_assumptions: [hono, d1]\ntags: []\n---\n\n## Problem\np\n",
  },
  {
    // Pinned as it is, not as it might be nicer. The frontmatter is read line by line on `\r?\n`
    // so it comes back as LF, but the body is taken whole and only trimmed, so a `\r` inside it
    // survives. Normalising the body would rewrite the bytes of every guide anybody ever wrote on
    // Windows, which is the silent rewrite this corpus exists to make visible rather than commit.
    why: "CRLF leaves the frontmatter and stays in the body",
    from: "---\r\nid: aaaaaaaa\r\ntitle: T\r\n---\r\n\r\n## Problem\r\np\r\n",
    to: "---\nid: aaaaaaaa\ntitle: T\nstack_assumptions: []\ntags: []\n---\n\n## Problem\r\np\n",
  },
  {
    why: "a document with no frontmatter is a body, and gets the fields every guide has",
    from: "## Problem\np\n",
    to: "---\nstack_assumptions: []\ntags: []\n---\n\n## Problem\np\n",
  },
];

for (const { why, from, to } of NORMALISED)
  test(`normalised: ${why}`, () => {
    assert.equal(serialize(parse(from)), to);
    // Whatever it becomes, it stays there.
    assert.equal(serialize(parse(to)), to, "the normalised form is not stable");
  });

test("every guide comes back with the two lists every guide has", () => {
  // `stack_assumptions` and `tags` are seeded on read, so they appear in every normalised form
  // above. `blocked_by` is deliberately not: it belongs to a task, and defaulting it would write
  // an empty one into every guide anybody re-shares.
  const { meta } = parse("## Problem\np\n");
  assert.deepEqual(meta.stack_assumptions, []);
  assert.deepEqual(meta.tags, []);
  assert.equal("blocked_by" in meta, false);
});

test("a tag is one word, and two spellings of it are one tag", () => {
  assert.equal(tag("Rate_Limit"), "rate-limit");
  assert.equal(tag("  spaced  out  "), "spaced-out");
  assert.equal(tag("#hash!marks?"), "hashmarks");
  assert.equal(tag("--leading-and-trailing--"), "leading-and-trailing");
  assert.equal(tag(""), "");
  assert.deepEqual(tagList(["a_b", "a b", "A-B", ""]), ["a-b"]);
});

test("a heading written twice adds to its section rather than replacing it", () => {
  // This is the first thing the corpus caught. guide.js reset the section on every heading, so a
  // guide with two `## Verification` blocks was validated against the second alone, while
  // splitSections() in apps/api/src/guide.ts — which the web view reads — kept both.
  assert.deepEqual(sections("## Steps\nfirst\n\n## Steps\nsecond\n"), {
    Steps: "first\n\nsecond",
  });
});
