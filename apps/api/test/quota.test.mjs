// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { COUNTED, isFull, limitFor } from "../src/quota.ts";

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
