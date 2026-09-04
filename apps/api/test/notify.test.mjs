// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { KINDS, line, summary } from "../src/notify.ts";

const row = (over = {}) => ({
  id: 1,
  kind: "pulled",
  guide_id: "k3mq2xa7",
  actor_id: "acc_bob",
  team_id: "t1",
  at: "2026-09-04T10:00:00.000Z",
  times: 1,
  read_at: "",
  note: "",
  title: "Add Paystack webhook verification",
  actor: "bob",
  team: "khaime",
  ...over,
});

test("every kind renders a sentence naming who did what", () => {
  const seen = KINDS.map((kind) => line(row({ kind })));
  assert.deepEqual(seen, [
    '@bob handed you "Add Paystack webhook verification" in khaime',
    '@bob shared "Add Paystack webhook verification" with khaime',
    '@bob pulled "Add Paystack webhook verification"',
    '@bob marked "Add Paystack webhook verification" consumed',
    '@bob verified "Add Paystack webhook verification"',
    '@bob says "Add Paystack webhook verification" does not work',
    "@bob joined khaime",
  ]);
});

test("a failing verdict carries its reason into the line", () => {
  const r = row({ kind: "failed", note: "401 on a valid signature too" });
  assert.equal(
    line(r),
    '@bob says "Add Paystack webhook verification" does not work: 401 on a valid signature too',
  );
  assert.equal(summary(r).note, "401 on a valid signature too");
  // A reason is the point of the verdict; without one the line still reads.
  assert.doesNotMatch(line(row({ kind: "failed" })), /:\s*$/);
});

test("an anonymous share-link reader is named as one", () => {
  assert.equal(
    line(row({ actor: "" })),
    'someone with the link pulled "Add Paystack webhook verification"',
  );
});

test("repeat events read as one line with a count", () => {
  assert.match(line(row({ times: 4 })), /pulled "Add Paystack webhook verification" \(4×\)/);
  assert.doesNotMatch(line(row({ times: 1 })), /×/, "a single event carries no count");
  // Only pulls repeat in practice; a handoff says nothing about how many times it was addressed.
  assert.doesNotMatch(line(row({ kind: "handoff", times: 3 })), /×/);
});

test("a guide that has since been deleted still reads", () => {
  assert.equal(line(row({ title: "" })), "@bob pulled a guide");
});

test("summary carries the rendered line and the read flag", () => {
  const s = summary(row({ read_at: "2026-09-04T11:00:00.000Z" }));
  assert.equal(s.guide, "k3mq2xa7");
  assert.equal(s.read, true);
  assert.equal(s.text, line(row()));
  assert.equal(summary(row()).read, false);
});
