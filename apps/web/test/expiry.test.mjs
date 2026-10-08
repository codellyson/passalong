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

test("proof deletion is said before archiving, and nothing is said when nothing is due", () => {
  assert.equal(expiryLine({}, at), null);
  const proof = expiryLine({ proof_expires: from(3 * D) }, at);
  assert.equal(proof?.text, "Screenshots deleted in 3 days");
  assert.equal(proof?.soon, false);
  assert.match(proof?.why ?? "", /can't be brought back/, "the tooltip says what cannot be undone");
  const shelf = expiryLine({ archives_at: from(10 * H) }, at);
  assert.equal(shelf?.text, "Archived in 10 hours");
  assert.equal(shelf?.soon, true);
  assert.match(shelf?.why ?? "", /unarchive it/);
  assert.match(
    expiryLine({ proof_expires: from(4 * D), archives_at: from(D) }, at)?.text ?? "",
    /^Screenshots/,
  );
});
