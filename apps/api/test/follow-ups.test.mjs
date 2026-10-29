// `GET /v1/guides/:id/parent?markdown=1` — the work this came from, with its content.
//
// The app is not importable under type stripping (its siblings are imported as `./x.js`; see
// hosts.ts), so the route is pinned two ways: the clipping it relies on is exercised directly from
// guide.ts, and the route's own source is read for the properties that matter most and are easiest
// to lose in a later edit — no pull recorded for the children, and the readability filter intact.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { clipFollowUp, FOLLOW_UP_BYTES } from "../src/guide.ts";

test("the cap is 32 KB", () => {
  assert.equal(FOLLOW_UP_BYTES, 32 * 1024);
});

test("a follow-up under the limit is handed over untouched", () => {
  const md = "---\nid: aaaa2222\n---\n\n## Problem\nx\n";
  assert.equal(clipFollowUp("aaaa2222", md), md);
  assert.equal(clipFollowUp("aaaa2222", "x".repeat(FOLLOW_UP_BYTES)), "x".repeat(FOLLOW_UP_BYTES));
});

test("one over the limit is cut, and says so and where to get the rest", () => {
  const out = clipFollowUp("aaaa2222", "x".repeat(FOLLOW_UP_BYTES + 5000));
  assert.ok(out.startsWith("x".repeat(FOLLOW_UP_BYTES)));
  assert.ok(!out.startsWith("x".repeat(FOLLOW_UP_BYTES + 1)));
  assert.match(
    out,
    /\[passalong: truncated at 32 KB of 37 KB — find_work aaaa2222 for the whole of it\]\n$/,
  );
});

test("a cut inside a multi-byte character drops it rather than emitting half", () => {
  // "é" is two bytes; a 5-byte budget lands in the middle of the third.
  const out = clipFollowUp("aaaa2222", "ééé", 5);
  assert.ok(out.startsWith("éé\n\n[passalong: truncated"));
  assert.ok(!out.includes("\uFFFD"));
});

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const upward = index.slice(
  index.indexOf('app.get("/v1/guides/:id/parent"'),
  index.indexOf('app.get("/v1/guides/:id/context"'),
);

test("the guide a follow-up came out of travels with it, clipped the same way", () => {
  assert.ok(upward.length > 0, "found the route");
  assert.match(upward, /clipFollowUp\(parent\.row\.id, parent\.row\.markdown\)/);
  assert.match(upward, /c\.req\.query\("markdown"\)/);
  // Where the parent has got to is what decides whether the follow-up can be acted on.
  for (const state of ["done", "draft", "handed in", "held", "open"])
    assert.ok(upward.includes(`"${state}"`), `says when a parent is ${state}`);
});

test("reading the parent is not opening it, and it is filtered on its own", () => {
  assert.doesNotMatch(upward, /recordPull|recordReceipt|INSERT INTO pull|pulls = pulls/);
  // Readable on the follow-up is not readable on the parent: a follow-up shared with your team
  // must not hand you a guide from a team you are not in.
  assert.match(upward, /readableGuide\(c, found\.row\.parent_id\)/);
  assert.match(upward, /if \(!parent\) return c\.json\(none\)/);
});
