// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLines, codeParts, sectionsOf } from "../app/utils/task-docs.ts";

const TASK = `---
id: ab12cd34
title: Export guides as CSV
kind: task
---

## Goal
Settings offers a CSV of every guide.

## Acceptance
- Settings → Export downloads \`guides.csv\`
- One row per guide: id, title, kind, status, created
- Titles with commas and quotes are escaped
`;

test("a document splits into its sections, frontmatter left out", () => {
  const s = sectionsOf(TASK);
  assert.deepEqual(Object.keys(s), ["Goal", "Acceptance"]);
  assert.equal(s.Goal, "Settings offers a CSV of every guide.");
  assert.ok(!("id" in s));
});

test("a section's list becomes one check per line, bullets and numbers stripped", () => {
  assert.deepEqual(checkLines(sectionsOf(TASK).Acceptance), [
    "Settings → Export downloads `guides.csv`",
    "One row per guide: id, title, kind, status, created",
    "Titles with commas and quotes are escaped",
  ]);
  assert.deepEqual(checkLines("1. first\n2. second\n\n"), ["first", "second"]);
  assert.deepEqual(checkLines(undefined), []);
});

test("a heading that is not a level-two heading stays inside its section", () => {
  const s = sectionsOf("## Steps\n### Detail\n1. x\n");
  assert.deepEqual(Object.keys(s), ["Steps"]);
  assert.match(s.Steps, /### Detail/);
});

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
