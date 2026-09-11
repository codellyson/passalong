// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptsNewWork,
  COUNTED,
  ceilingFor,
  isFull,
  limitFor,
  PLANS,
  SYNC_PLANS,
  seatsFull,
} from "../src/quota.ts";

test("an account's own limit wins over the deployment's", () => {
  assert.equal(limitFor(200, "25"), 200);
  assert.equal(limitFor("200", 25), 200, "the column arrives as whatever D1 hands back");
});

test("zero means nobody set one, not a limit of zero", () => {
  assert.equal(limitFor(0, "25"), 25);
  assert.equal(limitFor(null, "25"), 25);
  assert.equal(limitFor(undefined, "25"), 25);
});

test("a missing or unreadable env default still leaves a working ceiling", () => {
  assert.equal(limitFor(0, undefined), 25, "an unset var must not mean a limit of zero");
  assert.equal(limitFor(0, ""), 25);
  assert.equal(limitFor(0, "not a number"), 25);
  assert.equal(limitFor(0, "-5"), 25, "and neither must a nonsense one");
});

test("only the statuses that occupy room are counted", () => {
  assert.deepEqual([...COUNTED], ["published", "promoted"]);
  assert.ok(!COUNTED.includes("consumed"), "archiving is what makes room, so it cannot count");
  assert.ok(!COUNTED.includes("draft"));
});

test("a seat lifts whoever is sitting in it, paid for or not", () => {
  // §11 sells the team, so a free member of a paid team publishes without a ceiling. One paid team
  // is enough; being in five changes nothing, and an override cannot lower it.
  assert.equal(ceilingFor(1, 0, "25").plan, "unlimited");
  assert.equal(ceilingFor(3, 0, "25").plan, "unlimited");
  assert.equal(ceilingFor(1, 200, "25", 0, "0").plan, "unlimited");
});

test("an account that was already here keeps the ceiling it had", () => {
  // The free tier closing is a decision about people who have not arrived yet. Doing it to accounts
  // that have been syncing for months under a different promise is §10 with extra steps.
  assert.deepEqual(ceilingFor(0, 0, "25", 1, "0"), { plan: "free", limit: 25 });
  assert.equal(ceilingFor(0, 200, "25", 1, "0").limit, 200, "a personal override still applies");
});

test("a new account gets nothing once signup is closed, and the free ceiling until then", () => {
  // The switch defaults open, because the Solo plan on the landing page has no purchase path yet:
  // closing it first would leave a new account able to create itself and do nothing else.
  assert.equal(ceilingFor(0, 0, "25", 0, "0").plan, "none");
  assert.equal(ceilingFor(0, 0, "25", 0, "1").plan, "free");
  assert.equal(ceilingFor(0, 0, "25", 0, undefined).plan, "free", "unset means still open");
  assert.equal(ceilingFor(0, 0, "25").plan, "free", "and so does not passing it at all");
});

test("a lapsed team lifts nobody", () => {
  // The query counts only `plan = 'team'`, so a lapsed team arrives here as zero paid teams.
  assert.equal(ceilingFor(0, 0, "25", 1, "0").plan, "free");
});

test("full is decided by the plan, never by the number alone", () => {
  // The trap this shape exists to avoid: "no ceiling" and "may sync nothing" both carry a falsy
  // limit, so anything testing truthiness tells the second account it is the first.
  assert.equal(isFull(10_000, { plan: "unlimited", limit: 0 }), false);
  assert.equal(isFull(0, { plan: "none", limit: 0 }), true, "no plan is full at zero guides");
  assert.equal(isFull(24, { plan: "free", limit: 25 }), false);
  assert.equal(isFull(25, { plan: "free", limit: 25 }), true);
});

test("a sync plan is one field with three values", () => {
  assert.deepEqual([...SYNC_PLANS], ["unlimited", "free", "none"]);
});

test("seats only limit a paid team", () => {
  assert.equal(seatsFull("team", 3, 3), true, "the third member fills three seats");
  assert.equal(seatsFull("team", 3, 2), false);
  assert.equal(seatsFull("team", 0, 99), false, "a paid team with no seat count is not full");
  assert.equal(seatsFull("free", 0, 99), false, "seats are not what limits a free team");
  assert.equal(
    seatsFull("lapsed", 1, 99),
    false,
    "a lapsed team is refused before seats are asked",
  );
});

test("read-only stops work coming in and nothing else", () => {
  assert.equal(acceptsNewWork("free"), true);
  assert.equal(acceptsNewWork("team"), true);
  assert.equal(acceptsNewWork("lapsed"), false);
});

test("a plan is one column with three values", () => {
  // `free` + `lapsed` is not a state a team can be in, and two columns could store it.
  assert.deepEqual([...PLANS], ["free", "team", "lapsed"]);
});
