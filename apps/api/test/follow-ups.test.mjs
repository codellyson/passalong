// `GET /v1/guides/:id/children?markdown=1` — a guide's follow-ups with their content.
//
// The app is not importable under type stripping (its siblings are imported as `./x.js`; see
// hosts.ts), so the route is pinned two ways: the clipping it relies on is exercised directly from
// guide.ts, and the route's own source is read for the properties that matter most and are easiest
// to lose in a later edit — no pull recorded for the children, and the readability filter intact.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { clipFollowUp, FOLLOW_UP_BYTES, FOLLOW_UPS_MAX } from "../src/guide.ts";

test("the caps are 20 follow-ups and 32 KB each", () => {
  assert.equal(FOLLOW_UPS_MAX, 20);
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
    /\[passalong: follow-up truncated at 32 KB of 37 KB — pull aaaa2222 for the whole guide\]\n$/,
  );
});

test("a cut inside a multi-byte character drops it rather than emitting half", () => {
  // "é" is two bytes; a 5-byte budget lands in the middle of the third.
  const out = clipFollowUp("aaaa2222", "ééé", 5);
  assert.ok(out.startsWith("éé\n\n[passalong: follow-up truncated"));
  assert.ok(!out.includes("\uFFFD"));
});

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const route = index.slice(
  index.indexOf('app.get("/v1/guides/:id/children"'),
  index.indexOf('app.patch("/v1/guides/:id/status"'),
);

test("the children route opts in to markdown, oldest first and capped", () => {
  assert.ok(route.length > 0, "found the route");
  assert.match(route, /c\.req\.query\("markdown"\)/);
  assert.match(route, /ORDER BY created \$\{withMarkdown \? "ASC" : "DESC"\}/);
  assert.match(route, /withMarkdown \? FOLLOW_UPS_MAX : 100/);
  assert.match(route, /clipFollowUp\(r\.id, r\.markdown\)/);
});

test("fetching follow-ups is not opening them: no pull is recorded for the children", () => {
  assert.doesNotMatch(route, /recordPull|recordReceipt|INSERT INTO pull|pulls = pulls/);
});

test("readability still holds: readable parent, each child yours or your team's, no drafts", () => {
  assert.match(route, /readableGuide\(c, c\.req\.param\("id"\)\)/);
  assert.match(route, /status <> 'draft'/);
  assert.match(
    route,
    /account_id = \? OR team_id IN \(SELECT team_id FROM membership WHERE account_id = \?\)/,
  );
});
