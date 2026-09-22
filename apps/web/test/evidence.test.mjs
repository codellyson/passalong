// What a hand-in's evidence is made of, so the hub can show it as more than a wall of text.
//
// Evidence arrives as whatever the agent pasted: commands and their output, a link to the change,
// a screenshot it uploaded. The output is the bulk of it and has to stay monospace and literal;
// the links and the screenshots are the parts a reviewer follows, and a raw URL in a <pre> is
// neither followable nor a picture.
import assert from "node:assert/strict";
import { test } from "node:test";
import { evidenceParts } from "../app/utils/evidence.ts";

const SHOT = "https://passalong.dev/v1/shots/k3mq2xa7";

test("plain output is one run, kept exactly as it was written", () => {
  const text = "$ npm test\n> 285 pass, 0 fail\n\n  indented, and  spaced";
  assert.deepEqual(evidenceParts(text), [{ kind: "run", parts: [{ text }] }]);
});

test("a screenshot is its own block, in the order it was written", () => {
  const parts = evidenceParts(`before\n![the 429](${SHOT})\nafter`);
  assert.deepEqual(parts, [
    { kind: "run", parts: [{ text: "before" }] },
    { kind: "shot", url: SHOT, alt: "the 429" },
    { kind: "run", parts: [{ text: "after" }] },
  ]);
});

test("a bare screenshot url is a screenshot too, with no alt to give it", () => {
  assert.deepEqual(evidenceParts(SHOT), [{ kind: "shot", url: SHOT, alt: "" }]);
});

test("any other link is followable where it sits, and stays in the run", () => {
  const pr = "https://github.com/acme/shop/pull/311";
  assert.deepEqual(evidenceParts(`shipped in ${pr} today`), [
    { kind: "run", parts: [{ text: "shipped in " }, { text: pr, url: pr }, { text: " today" }] },
  ]);
});

test("only a screenshot this server serves is drawn; anything else is a link", () => {
  // An <img> pointing anywhere a stranger controls would fetch on the reviewer's behalf every time
  // the hub drew the row. A URL that is not one of our own shots is a link, never an image.
  const outside = "https://example.test/pixel.png";
  assert.deepEqual(evidenceParts(`![shot](${outside})`), [
    { kind: "run", parts: [{ text: "![shot](" }, { text: outside, url: outside }, { text: ")" }] },
  ]);
  assert.deepEqual(evidenceParts("http://passalong.dev/v1/shots/abc123"), [
    { kind: "shot", url: "http://passalong.dev/v1/shots/abc123", alt: "" },
  ]);
});

test("nothing, or only whitespace, is nothing to show", () => {
  assert.deepEqual(evidenceParts(""), []);
  assert.deepEqual(evidenceParts("   \n\n "), []);
  assert.deepEqual(evidenceParts(`\n${SHOT}\n \n`), [{ kind: "shot", url: SHOT, alt: "" }]);
});

test("a trailing full stop is not part of the link", () => {
  const pr = "https://github.com/acme/shop/pull/311";
  assert.deepEqual(evidenceParts(`see ${pr}.`), [
    { kind: "run", parts: [{ text: "see " }, { text: pr, url: pr }, { text: "." }] },
  ]);
});
