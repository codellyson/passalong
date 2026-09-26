// `GET /v1/guides/:id/context` — everything around one guide, for the hub's page about it.
//
// Pinned by reading the route's source, as follow-ups.test.mjs does and for the same reason: the
// app is not importable under type stripping. What matters most here is easy to lose in an edit —
// looking at your own board must not count as opening the guide, every related guide is filtered
// on its own, and the reviewer's risk line stays the author's.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const route = index.slice(
  index.indexOf('app.get("/v1/guides/:id/context"'),
  index.indexOf('app.patch("/v1/guides/:id/status"'),
);

test("the route exists and is gated on reading the guide", () => {
  assert.ok(route.length > 0, "found the route");
  assert.match(route, /readableGuide\(c, c\.req\.param\("id"\)\)/);
  assert.match(route, /if \(!found\) return err\(c, 404, GUIDE_GONE\)/);
});

test("reading the context is not opening the guide: no pull, no receipt, no markdown", () => {
  assert.doesNotMatch(route, /recordPull|recordReceipt|INSERT INTO pull|pulls = pulls/);
  assert.doesNotMatch(route, /\.markdown\b/);
});

test("every related guide is filtered for this caller on its own", () => {
  const readable = route.match(/\$\{readable\}/g) ?? [];
  // parent, children, blockers, what it blocks, and the hand-ins' write-ups.
  assert.equal(readable.length, 5);
  assert.match(route, /team_id IN \(SELECT team_id FROM membership WHERE account_id = \?\)/);
});

test("follow-ups skip drafts, the way /children does", () => {
  assert.match(route, /g\.parent_id = \? AND g\.status <> 'draft'/);
});

test("the risk line is the reviewer's, so only the author gets it", () => {
  assert.match(route, /risk: found\.owner \? k\.risk : ""/);
});
