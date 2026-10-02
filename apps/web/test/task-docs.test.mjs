// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLines, codeParts, matchChecks, sectionsOf } from "../app/utils/task-docs.ts";

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

// ---- evidence against the line it answers (apps/api/migrations/0028_evidence_checks.sql) -------

test("each Acceptance line gets the evidence the agent filed for it", () => {
  const asked = ["Six resets in a minute: the sixth is refused with 429", "Esc clears"];
  const { rows, extra } = matchChecks(asked, [
    { check: "Esc clears", ran: "$ open board → Esc empties the box" },
    { check: "six resets in a minute: the sixth is refused with 429", ran: "200 200 429" },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.asked, r.ran]),
    [
      ["Six resets in a minute: the sixth is refused with 429", "200 200 429"],
      ["Esc clears", "$ open board → Esc empties the box"],
    ],
  );
  assert.deepEqual(extra, []);
});

test("a shortened check still finds its line, and code ticks do not matter", () => {
  const { rows } = matchChecks(
    ["Typing filters every column", "`Esc` clears the search"],
    [
      { check: "the sixth is refused", ran: "429" },
      { check: "Esc clears the search", ran: "$ open board → cleared" },
      { check: "Typing filters every column", ran: "$ type ada → 2 rows" },
    ],
  );
  assert.equal(rows[0].ran, "$ type ada → 2 rows");
  assert.equal(rows[1].ran, "$ open board → cleared");
});

test("a line with no evidence stays empty, and evidence for no line is kept apart", () => {
  // Never by position: a hand-in that skipped the second of three checks would otherwise file its
  // third piece of evidence under the second line, and the reviewer would read a pairing the agent
  // never claimed.
  const { rows, extra } = matchChecks(
    ["Typing filters every column", "Esc clears", "The count is right"],
    [
      { check: "Typing filters every column", ran: "$ type ada → 2 rows" },
      { check: "I also upgraded the router", ran: "$ npm test → 285 pass" },
    ],
  );
  assert.deepEqual(
    rows.map((r) => r.ran),
    ["$ type ada → 2 rows", "", ""],
  );
  assert.deepEqual(extra, [{ check: "I also upgraded the router", ran: "$ npm test → 285 pass" }]);
});

test("no checks at all leaves every line empty and nothing extra", () => {
  const { rows, extra } = matchChecks(["Esc clears"], []);
  assert.deepEqual(rows, [{ asked: "Esc clears", ran: "", says: "", ok: true }]);
  assert.deepEqual(extra, []);
});

test("inlineParts reads code and bold, and leaves everything else as typed", async () => {
  const { inlineParts } = await import("../app/utils/task-docs.ts");
  assert.deepEqual(inlineParts("A captured order shows a green **Paid** badge"), [
    { kind: "text", text: "A captured order shows a green " },
    { kind: "bold", text: "Paid" },
    { kind: "text", text: " badge" },
  ]);
  assert.deepEqual(inlineParts("`pnpm test` passes **fully**"), [
    { kind: "code", text: "pnpm test" },
    { kind: "text", text: " passes " },
    { kind: "bold", text: "fully" },
  ]);
  assert.deepEqual(inlineParts("`**not bold**` in code"), [
    { kind: "code", text: "**not bold**" },
    { kind: "text", text: " in code" },
  ]);
  assert.deepEqual(inlineParts("a lone ** stays"), [{ kind: "text", text: "a lone ** stays" }]);
});

test("matchChecks carries the agent's sentence and whether a run failed", () => {
  const { rows } = matchChecks(
    ["Esc clears", "Typing filters"],
    [
      { check: "Esc clears", ran: "ok", says: "Esc empties the box.", ok: true },
      { check: "Typing filters", ran: "boom", ok: false },
    ],
  );
  assert.equal(rows[0].says, "Esc empties the box.");
  assert.equal(rows[0].ok, true);
  assert.equal(rows[1].says, "");
  assert.equal(rows[1].ok, false);
});

test("matchChecks treats a check with no runner verdict as not failed", () => {
  const { rows } = matchChecks(["a"], [{ check: "a", ran: "x" }]);
  assert.equal(rows[0].ok, true);
});
