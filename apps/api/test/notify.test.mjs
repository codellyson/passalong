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
    '@bob sent you "Add Paystack webhook verification" in khaime',
    '@bob shared "Add Paystack webhook verification" with khaime',
    '@bob is taking "Add Paystack webhook verification"',
    '@bob passed on "Add Paystack webhook verification"',
    '@bob opened "Add Paystack webhook verification"',
    '@bob is done with "Add Paystack webhook verification"',
    '@bob put "Add Paystack webhook verification" back on your list',
    '@bob said "Add Paystack webhook verification" worked',
    '@bob said "Add Paystack webhook verification" didn\'t work',
    "@bob joined khaime",
    '@bob\'s agent took the task "Add Paystack webhook verification"',
    '@bob\'s agent finished "Add Paystack webhook verification", and it is waiting for your review',
    '@bob approved "Add Paystack webhook verification"',
    '@bob sent "Add Paystack webhook verification" back',
    '@bob took "Add Paystack webhook verification" back from your agent',
    '@bob accepted your work on "Add Paystack webhook verification", and closed it',
    '@bob sent "Add Paystack webhook verification" back',
    '@bob gave "Add Paystack webhook verification" to someone else',
  ]);
});

test("a person's name and a team's name win over their handle and slug", () => {
  const named = (over) => line(row({ actor_real: "Hybee1", team_name: "Khaime", ...over }));
  assert.equal(
    named({ kind: "handoff" }),
    'Hybee1 sent you "Add Paystack webhook verification" in Khaime',
  );
  assert.equal(named({ kind: "joined" }), "Hybee1 joined Khaime");
  assert.equal(named({ kind: "taken" }), 'Hybee1 is taking "Add Paystack webhook verification"');
  assert.equal(
    named({ kind: "consumed" }),
    'Hybee1 is done with "Add Paystack webhook verification"',
  );
});

test("a room is never told 'you': a handoff there says who it went to", () => {
  const text = line({
    kind: "handoff",
    actor_name: "Hybee1",
    title: "Add Paystack webhook verification",
    team_name: "Khaime",
    to: "Ada",
    times: 1,
  });
  assert.equal(text, 'Hybee1 sent "Add Paystack webhook verification" to Ada in Khaime');
  assert.doesNotMatch(text, /\byou\b/);
  assert.equal(
    line({ kind: "shared", actor_name: "Hybee1", title: "X", team_name: "Khaime", times: 1 }),
    'Hybee1 shared "X" with Khaime',
  );
});

test("a failing verdict carries its reason into the line", () => {
  const r = row({ kind: "failed", note: "401 on a valid signature too" });
  assert.equal(
    line(r),
    '@bob said "Add Paystack webhook verification" didn\'t work: 401 on a valid signature too',
  );
  assert.equal(summary(r).note, "401 on a valid signature too");
  // A reason is the point of the verdict; without one the line still reads.
  assert.doesNotMatch(line(row({ kind: "failed" })), /:\s*$/);
});

test("an anonymous share-link reader is the only 'Someone'", () => {
  assert.equal(
    line(row({ actor: "", actor_id: "" })),
    'Someone opened "Add Paystack webhook verification"',
  );
  // An account with no handle and no name is still an account, and is named by its id.
  assert.equal(line(row({ actor: "" })), '@acc_bob opened "Add Paystack webhook verification"');
});

test("repeat opens read as one line that says how many times", () => {
  assert.equal(line(row({ times: 4 })), '@bob opened "Add Paystack webhook verification" 4 times');
  assert.doesNotMatch(line(row({ times: 1 })), /times|×/, "a single event carries no count");
  // Only opens repeat in practice; a handoff says nothing about how many times it was addressed.
  assert.doesNotMatch(line(row({ kind: "handoff", times: 3 })), /times|×/);
});

test("a guide that has since been deleted still reads", () => {
  assert.equal(line(row({ title: "" })), "@bob opened a guide");
});

test("no sentence uses the words the product retired", () => {
  const everything = KINDS.flatMap((kind) => [
    line(row({ kind })),
    line(row({ kind, note: "why", times: 3 })),
  ]).join("\n");
  for (const word of [/pulled/, /consumed/, /handed/, /verified/, /promote/, /×/, /someone with/]) {
    assert.doesNotMatch(everything, word);
  }
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
  // Taking it needs no reason, and the line must still read without one.
  assert.equal(line(row({ kind: "taken" })), '@bob is taking "Add Paystack webhook verification"');
});

test("a rejection says why", () => {
  assert.equal(
    line(row({ kind: "task_rejected", note: "toggle does nothing on Safari" })),
    '@bob sent "Add Paystack webhook verification" back: toggle does nothing on Safari',
  );
});
