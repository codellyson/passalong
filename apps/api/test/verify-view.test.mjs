// Runs on Node 22.18+ with built-in type stripping (`node --test`).
//
// These cover the layout decision, not the HTML. render.ts cannot be imported here: it resolves
// "./guide.js", which type stripping does not map back to guide.ts. That is a reason to keep the
// decision in guide.ts anyway — the rule about what a verifier sees is part of the guide model.
import assert from "node:assert/strict";
import { test } from "node:test";
import { splitSections, verifyLayout } from "../src/guide.ts";

const BODY = `Some preamble nobody expected.

## Problem
Webhooks were accepted without checking the signature.

## Solution shape
Verify the HMAC before doing anything else.

## Steps
1. Add the check.

## Verification
Send a webhook with a bad signature; expect 401.

## Gotchas
The raw body must be read before any JSON parsing.

## Rollout
Staging first.
`;

test("splitSections keeps the preamble, the order, and every section", () => {
  const { intro, order, by } = splitSections(BODY);
  assert.equal(intro, "Some preamble nobody expected.");
  assert.deepEqual(order, [
    "Problem",
    "Solution shape",
    "Steps",
    "Verification",
    "Gotchas",
    "Rollout",
  ]);
  assert.match(by.Verification, /expect 401/);
  assert.deepEqual(splitSections("no headings at all"), {
    intro: "no headings at all",
    order: [],
    by: {},
  });
});

test("the verify view leads with what a verifier needs", () => {
  const { lead, folded } = verifyLayout(BODY);
  assert.deepEqual(lead, ["Problem", "Verification", "Gotchas"]);
  assert.deepEqual(folded, ["Solution shape", "Steps", "Rollout"]);
});

test("nothing in the guide is lost — every section is led with or folded", () => {
  const { intro, lead, folded, by } = verifyLayout(BODY);
  const { order, intro: original } = splitSections(BODY);
  assert.deepEqual([...lead, ...folded].sort(), [...order].sort(), "no section unaccounted for");
  assert.equal(intro, original, "the preamble survives");
  for (const s of order) assert.ok(by[s], `${s} kept its text`);
});

test("a guide with no Verification section is flagged, not quietly reordered", () => {
  const l = verifyLayout("## Problem\nIt broke.\n\n## Steps\n1. Fix it.\n");
  assert.equal(l.hasVerification, false);
  assert.deepEqual(l.lead, ["Problem"]);
  assert.deepEqual(l.folded, ["Steps"], "the work still reaches the reader, folded");
});

test("an unsectioned guide folds into notes rather than vanishing", () => {
  const l = verifyLayout("just some prose, no headings");
  assert.deepEqual(l.lead, []);
  assert.deepEqual(l.folded, []);
  assert.equal(l.intro, "just some prose, no headings");
});
