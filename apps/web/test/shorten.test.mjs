// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { shorten } from "../app/utils/shorten.ts";

test("leaves a value that fits alone, minus the parts nobody reads", () => {
  assert.deepEqual(shorten("production"), {
    text: "production",
    full: "production",
    clipped: false,
  });
  // Dropping the scheme is often the whole fix: this one fits once it is gone.
  assert.deepEqual(shorten("https://github.com/org/repo"), {
    text: "github.com/org/repo",
    full: "github.com/org/repo",
    clipped: false,
  });
});

test("keeps the name and drops the URL, rather than cutting inside it", () => {
  const s = shorten("techchak-backend (https://github.com/codellyson/techchak-backend)");
  assert.equal(s.text, "techchak-backend …");
  assert.equal(s.full, "techchak-backend (github.com/codellyson/techchak-backend)");
  assert.ok(s.clipped);
});

test("cuts on a word boundary and takes the dangling punctuation with it", () => {
  const s = shorten("assumes Khaime API /api/v1, node 20, pnpm", 30);
  assert.equal(s.text, "assumes Khaime API /api/v1 …");
  assert.ok(!/,\s…$/.test(s.text));
});

test("falls back to path segments when there are no spaces to give", () => {
  const s = shorten(
    "https://github.com/codellyson/passalong/blob/master/apps/web/nuxt.config.ts",
    30,
  );
  assert.equal(s.text, "github.com/codellyson/…");
  assert.ok(s.clipped);
});

test("returns an unbreakable value whole rather than saying nothing", () => {
  const long = "a".repeat(60);
  const s = shorten(long, 20);
  assert.equal(s.text, long);
  assert.ok(!s.clipped, "nothing was hidden, so nothing is offered");
});

test("nothing is a value too", () => {
  assert.deepEqual(shorten(null), { text: "", full: "", clipped: false });
  assert.deepEqual(shorten(undefined), { text: "", full: "", clipped: false });
});
