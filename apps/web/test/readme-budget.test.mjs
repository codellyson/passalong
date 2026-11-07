// Writers see how much of a README reaches an agent (utils/readme-budget.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isReadme, README_SHOWN, readmeBudget } from "../app/utils/readme-budget.ts";

test("the limit is the one the API shows agents", () => {
  const api = readFileSync(new URL("../../api/src/project-tree.ts", import.meta.url), "utf8");
  assert.match(api, new RegExp(`export const README_SHOWN = ${README_SHOWN};`));
});

test("a short README is seen whole; a long one says where agents stop", () => {
  assert.deepEqual(readmeBudget("# Shop\n\nShort."), { length: 14, cut: false, stopsAt: "" });
  const long = `${"word ".repeat(790)}the last words agents see${" after".repeat(200)}`;
  const b = readmeBudget(long);
  assert.equal(b.cut, true);
  assert.ok(b.stopsAt.startsWith("…") && b.stopsAt.length <= 71, b.stopsAt);
  assert.ok(!b.stopsAt.includes("  "));
});

test("only a README counts", () => {
  assert.equal(isReadme("README"), true);
  assert.equal(isReadme("readme.md"), true);
  assert.equal(isReadme("Payments"), false);
});

test("the README note sits inside the document's branch, so the text still shows under it", () => {
  const doc = readFileSync(
    new URL("../app/components/hub/ProjectDocument.vue", import.meta.url),
    "utf8",
  );
  // The note between the editing form and the document split the v-if chain, and a README over the
  // limit showed the note and none of its text (2026-11-08).
  assert.match(doc, /<\/form>[\s\S]{0,400}<template v-else-if="shown">\s*<p v-if="budget\?\.cut"/);
});
