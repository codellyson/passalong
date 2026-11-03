// What you read in the hub is set as a work's page sets it. A work's text was always Newsreader at
// 18px — its share page, framed on the work page — while #162 put a project's documents in the sans
// beside it, so the hub read two ways. The frame was the one people preferred (2026-11-03).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("../app/assets/css/styles.css");
const doc = read("../app/components/hub/ProjectDocument.vue");
const project = read("../app/pages/hub/projects/[id].vue");

const rule = (src, selector) => {
  const at = src.indexOf(`${selector} {`);
  assert.ok(at >= 0, `${selector} exists`);
  return src.slice(at, src.indexOf("}", at));
};

test("the hub keeps the serif, so what asks for it gets Newsreader", () => {
  assert.doesNotMatch(rule(css, ".hub-app"), /--font-serif:/, "no longer mapped to the sans");
});

test("a document reads, and is edited, as a work's text is: the serif at 18px", () => {
  const frame = rule(css, "article.prose");
  assert.match(frame, /font-family: var\(--font-serif\);/);
  assert.match(frame, /font-size: 1\.125rem;/);
  for (const [src, selector] of [
    [doc, ".project-doc"],
    [project, ".project-prose"],
  ]) {
    const r = rule(src, selector);
    assert.match(r, /font-family: var\(--font-serif\);/, `${selector} is in the serif`);
    assert.match(r, /font-size: 1\.125rem;/, `${selector} is 18px`);
    assert.match(r, /line-height: 1\.65;/);
    assert.match(r, /max-width: 40rem;/);
  }
  assert.match(
    rule(css, ".doc-writer"),
    /font: 1\.125rem \/ 1\.65 var\(--font-serif\);/,
    "the editor too",
  );
});
