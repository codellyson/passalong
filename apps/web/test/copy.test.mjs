// Every Copy button in the hub goes through utils/copy.ts. It failed in silence: with no clipboard
// API (plain http from another machine) or one that refused, the button did nothing at all, and a
// second press inside the 1.2s left it saying "copied" for good (2026-11-03).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync(new URL("../app/utils/copy.ts", import.meta.url), "utf8");
const fn = src.slice(src.indexOf("export function copy("));
const body = fn.slice(0, fn.indexOf("\n}\n"));

test("with no clipboard API, or one that refuses, it falls back to the copy command", () => {
  assert.match(body, /if \(!navigator\.clipboard\?\.writeText\) return say\(legacyCopy\(text\)\);/);
  assert.match(body, /\(\) => say\(true\),\s*\(\) => say\(legacyCopy\(text\)\),/);
  assert.match(src, /document\.execCommand\("copy"\)/);
});

test("it says when nothing worked, rather than doing nothing", () => {
  assert.match(body, /ok \? "copied" : "couldn't copy"/);
});

test("pressing again puts back the label from before the first press", () => {
  assert.match(body, /if \(before\) clearTimeout\(before\.timer\);/);
  assert.match(body, /const text = before \? before\.text : label\.textContent;/);
});
