// "It works" is shown, not said: the verdict route refuses a "works" with no screenshot.
//
// Pinned by reading the route's source, as the other route tests are: the app is not importable
// under type stripping. The storage side — proof removed PROOF_DAYS after closing — is exercised
// against real SQLite in shots.test.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const verdict = index.slice(
  index.indexOf('app.put("/v1/guides/:id/verdict"'),
  index.indexOf('app.put("/v1/guides/:id/ack"'),
);

test('"it works" needs a screenshot the sender uploaded, and claims it for the guide', () => {
  assert.ok(verdict.length > 0, "found the route");
  assert.match(verdict, /if \(body\.ok\) \{/);
  assert.match(verdict, /SELECT id FROM shot WHERE account_id = \? AND id IN/);
  assert.match(verdict, /if \(!own\.length\) return err\(c, 400, NEEDS_PROOF\)/);
  assert.match(verdict, /claimEvidenceShots\(c, account, found\.row\.id/);
});
