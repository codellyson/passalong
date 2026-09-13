// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { displayName, KINDS, line, summary } from "../src/notify.ts";

test("a person is named by their name, then their handle, then their account id", () => {
  assert.equal(displayName({ id: "acc_1", handle: "ada", name: "Ada Lovelace" }), "Ada Lovelace");
  assert.equal(displayName({ id: "acc_1", handle: "ada", name: "  Ada  " }), "Ada");
  // A name that is only spaces is not a name.
  assert.equal(displayName({ id: "acc_1", handle: "ada", name: "   " }), "@ada");
  assert.equal(displayName({ id: "acc_1", handle: "ada", name: null }), "@ada");
  assert.equal(displayName({ id: "acc_1", handle: "", name: "" }), "@acc_1");
  assert.equal(displayName({ id: "acc_1", handle: null, name: null }), "@acc_1");
  // A real account is never "someone": that word is kept for a reader with no account at all.
  assert.doesNotMatch(displayName({ id: "x", handle: "", name: "" }), /someone/);
});

test("a notification carries the actor and the team as a person reads them", () => {
  const named = summary(row({ actor_real: "Bob Marley", team_name: "Khaime" }));
  assert.equal(named.actor_name, "Bob Marley");
  assert.equal(named.actor, "bob", "the handle stays for anything that already reads it");
  assert.equal(named.team_name, "Khaime");
  assert.equal(named.team, "khaime");
  assert.equal(summary(row({ actor_real: "" })).actor_name, "@bob");
  assert.equal(summary(row({ actor: "", actor_real: "" })).actor_name, "@acc_bob");
  // Nobody at all: an anonymous share-link reader has no name to give.
  assert.equal(summary(row({ actor_id: "", actor: "", actor_real: "" })).actor_name, "");
});

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
    '@bob is on "Add Paystack webhook verification"',
    '@bob passed on "Add Paystack webhook verification"',
    '@bob pulled "Add Paystack webhook verification"',
    '@bob marked "Add Paystack webhook verification" consumed',
    '@bob put "Add Paystack webhook verification" back on your board',
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

test("a decline carries its reason, because that is the whole point of saying no", () => {
  const r = row({ kind: "declined", note: "no context on the payments side" });
  assert.equal(
    line(r),
    '@bob passed on "Add Paystack webhook verification": no context on the payments side',
  );
  assert.equal(summary(r).note, "no context on the payments side");
  // "on it" needs no reason, and the line must still read without one.
  assert.equal(line(row({ kind: "taken" })), '@bob is on "Add Paystack webhook verification"');
});
