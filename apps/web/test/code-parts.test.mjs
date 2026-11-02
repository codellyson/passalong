// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { codeParts } from "../app/utils/code-parts.ts";

test("backticks become code parts, and everything else stays text", () => {
  assert.deepEqual(codeParts("run `npm test` twice"), [
    { code: false, text: "run " },
    { code: true, text: "npm test" },
    { code: false, text: " twice" },
  ]);
  assert.deepEqual(codeParts("no code"), [{ code: false, text: "no code" }]);
  // An unpaired backtick is prose, not the start of code that never ends.
  assert.deepEqual(codeParts("it's a ` tick"), [{ code: false, text: "it's a ` tick" }]);
});
