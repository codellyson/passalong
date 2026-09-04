// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearCookie,
  hashPassword,
  passwordProblem,
  readCookie,
  sessionCookie,
  verifyPassword,
} from "../src/auth.ts";

test("a password verifies against its own hash and nothing else", async () => {
  const stored = await hashPassword("correct-horse-battery");
  assert.equal(await verifyPassword("correct-horse-battery", stored), true);
  assert.equal(await verifyPassword("correct-horse-batterY", stored), false);
  assert.equal(await verifyPassword("", stored), false);
});

test("the same password hashes differently every time", async () => {
  const [a, b] = [
    await hashPassword("correct-horse-battery"),
    await hashPassword("correct-horse-battery"),
  ];
  assert.notEqual(a, b, "a shared salt would let one crack answer for every account");
  assert.equal(await verifyPassword("correct-horse-battery", b), true);
});

test("the stored form carries its own parameters", async () => {
  const [scheme, iterations, salt, hash] = (await hashPassword("correct-horse-battery")).split("$");
  assert.equal(scheme, "pbkdf2");
  assert.ok(Number(iterations) >= 210_000, "iterations must not silently drop");
  assert.ok(salt.length > 20 && hash.length > 20);
  // Parameters live in the record so they can be raised later without invalidating old passwords.
  assert.equal(await verifyPassword("correct-horse-battery", `pbkdf2$1000$${salt}$${hash}`), false);
});

test("garbage in the hash column fails closed", async () => {
  for (const stored of ["", "not-a-hash", "pbkdf2$", "bcrypt$10$x$y", "pbkdf2$210000$$"]) {
    assert.equal(await verifyPassword("correct-horse-battery", stored), false, stored);
  }
});

test("password rules are about length, not character zoos", () => {
  assert.match(passwordProblem("short"), /at least 10/);
  assert.match(passwordProblem("          "), /only spaces/);
  assert.match(passwordProblem("x".repeat(201)), /too long/);
  assert.equal(passwordProblem("a-brand-new-passphrase"), null);
});

test("the session cookie cannot be read by script and is https-only in production", () => {
  const live = sessionCookie("abc123", "https://passalong.kreativekorna.com/v1/auth/login");
  assert.match(live, /^pa_session=abc123;/);
  assert.match(live, /HttpOnly/);
  assert.match(live, /SameSite=Lax/);
  assert.match(live, /Secure/);
  // Dropped on http so a localhost dev session can exist at all.
  assert.doesNotMatch(sessionCookie("abc123", "http://localhost:8787/x"), /Secure/);
  assert.match(clearCookie("https://x.test/y"), /Max-Age=0/);
});

test("reading a cookie picks the right one out of the header", () => {
  assert.equal(readCookie("a=1; pa_session=xyz; b=2", "pa_session"), "xyz");
  assert.equal(readCookie("pa_session=xyz", "pa_session"), "xyz");
  assert.equal(readCookie("other=1", "pa_session"), "");
  assert.equal(readCookie(undefined, "pa_session"), "");
  // A value containing "=" survives the split.
  assert.equal(readCookie("pa_session=a=b=c", "pa_session"), "a=b=c");
});
