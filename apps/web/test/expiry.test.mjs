import assert from "node:assert/strict";
import { test } from "node:test";
import { expiryLine, timeLeft } from "../app/utils/expiry.ts";

const at = Date.parse("2026-10-08T12:00:00Z");
const from = (ms) => new Date(at + ms).toISOString();
const H = 3_600_000;
const D = 24 * H;

test("time left reads as a person would say it", () => {
  assert.equal(timeLeft(from(10 * 60_000), at), "under an hour");
  assert.equal(timeLeft(from(-5 * D), at), "under an hour", "past due is soon, never negative");
  assert.equal(timeLeft(from(H), at), "1 hour");
  assert.equal(timeLeft(from(30 * H), at), "30 hours");
  assert.equal(timeLeft(from(3 * D + 2 * H), at), "3 days");
  assert.equal(timeLeft("not a date", at), "under an hour");
});

test("proof deletion is said before shelving, and nothing is said when nothing is due", () => {
  assert.equal(expiryLine({}, at), null);
  assert.deepEqual(expiryLine({ proof_expires: from(3 * D) }, at), {
    text: "Screenshots deleted in 3 days",
    soon: false,
  });
  assert.deepEqual(expiryLine({ shelves_at: from(10 * H) }, at), {
    text: "Shelved in 10 hours if nobody opens it",
    soon: true,
  });
  assert.match(
    expiryLine({ proof_expires: from(4 * D), shelves_at: from(D) }, at)?.text ?? "",
    /^Screenshots/,
  );
});
