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
  seatsFull,
  UNLIMITED,
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

test("full is at the limit, not past it", () => {
  assert.equal(isFull(24, 25), false);
  assert.equal(isFull(25, 25), true, "the 25th guide fills it; the 26th is what gets refused");
  assert.equal(isFull(31, 25), true);
});

test("only the statuses that occupy room are counted", () => {
  assert.deepEqual([...COUNTED], ["published", "promoted"]);
  assert.ok(!COUNTED.includes("consumed"), "archiving is what makes room, so it cannot count");
  assert.ok(!COUNTED.includes("draft"));
});

test("a seat lifts whoever is sitting in it, paid for or not", () => {
  // §11 sells the team, so a free member of a paid team publishes without a ceiling. One paid team
  // is enough; being in five changes nothing.
  assert.equal(ceilingFor(1, 0, "25"), UNLIMITED);
  assert.equal(ceilingFor(3, 0, "25"), UNLIMITED);
  assert.equal(ceilingFor(1, 200, "25"), UNLIMITED, "an override cannot lower it either");
});

test("a lapsed team lifts nobody, and the fall is back to their own ceiling", () => {
  // The query counts only `plan = 'team'`, so a lapsed team arrives here as zero paid teams.
  assert.equal(ceilingFor(0, 0, "25"), 25);
  assert.equal(ceilingFor(0, 200, "25"), 200, "a personal override still applies");
});

test("unlimited is never full, at any number of guides", () => {
  assert.equal(isFull(0, UNLIMITED), false);
  assert.equal(isFull(10_000, UNLIMITED), false);
  // And the ordinary ceiling still behaves exactly as it did.
  assert.equal(isFull(25, 25), true);
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
