// Reading a guide in parts, and how big one may be. The same rules live in
// packages/passalong/src/guide.js; this holds the two to the same answers.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as cli from "../../../packages/passalong/src/guide.js";
import { outlineOf, sectionOf } from "../src/mcp-http.ts";
import * as api from "../src/sections.ts";

const DOC = [
  "---",
  "title: T",
  "kind: task",
  "---",
  "",
  "# Not a section of anything: it is in the frontmatter's shadow",
  "",
  "## Goal",
  "Ship it.",
  "",
  "## Context",
  "Some context.",
  "",
  "### Nested",
  "```sh",
  "## not a heading, it is inside a fence",
  "```",
  "",
  "## Acceptance",
  "- it builds",
  "",
].join("\n");

test("an outline lists every heading with the characters in its section, fences ignored", () => {
  const out = api.outline(DOC);
  assert.deepEqual(
    out.map((h) => [h.level, h.heading]),
    [
      [1, "Not a section of anything: it is in the frontmatter's shadow"],
      [2, "Goal"],
      [2, "Context"],
      [3, "Nested"],
      [2, "Acceptance"],
    ],
  );
  const context = out.find((h) => h.heading === "Context");
  const nested = out.find((h) => h.heading === "Nested");
  assert.ok(context.chars > nested.chars, "a section's size includes what is nested in it");
  assert.equal(DOC.includes("## not a heading"), true);
});

test("a section is found by its heading — exact, then its start, then what it contains", () => {
  assert.equal(api.section(DOC, "Acceptance").text, "## Acceptance\n- it builds");
  assert.equal(api.section(DOC, "accept").heading, "Acceptance");
  assert.equal(api.section(DOC, "ontex").heading, "Context");
  assert.match(api.section(DOC, "Context").text, /### Nested[\s\S]*not a heading/);
  assert.equal(api.section(DOC, "Goal").text, "## Goal\nShip it.");
  assert.equal(api.section(DOC, "nothing like it"), null);
  assert.equal(api.section(DOC, ""), null);
});

test("the CLI's copy and the server's answer the same", () => {
  assert.deepEqual(cli.outline(DOC), api.outline(DOC));
  for (const name of ["Goal", "context", "Nested", "Acceptance", "zzz"])
    assert.deepEqual(cli.section(DOC, name), api.section(DOC, name), name);
  assert.equal(cli.GUIDE_WARN, api.GUIDE_WARN);
  assert.equal(cli.GUIDE_MAX, api.GUIDE_MAX);
  assert.equal(cli.sizeWarning(25_000), api.sizeWarning(25_000));
});

test("the hosted MCP's copy answers the same too", () => {
  assert.deepEqual(outlineOf(DOC), api.outline(DOC));
  for (const name of ["Goal", "context", "Nested", "Acceptance", "zzz"])
    assert.deepEqual(sectionOf(DOC, name), api.section(DOC, name), name);
});

test("a new guide over the limit is refused, and one stored larger before keeps its size", () => {
  assert.equal(api.sizeProblem(api.GUIDE_MAX), null);
  assert.match(api.sizeProblem(api.GUIDE_MAX + 1) || "", /attach_file/);
  assert.equal(api.sizeProblem(354_338, 354_338), null, "a guide already that big may be re-saved");
  assert.ok(api.sizeProblem(354_339, 354_338), "but not made bigger");
  assert.equal(api.sizeWarning(api.GUIDE_WARN), null);
  assert.match(api.sizeWarning(api.GUIDE_WARN + 1) || "", /outline/);
});
