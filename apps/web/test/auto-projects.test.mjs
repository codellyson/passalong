// Every piece of work is in a project (claims.fileWork, 2026-11-07): the hub asks the one question
// about a new repo, and stops saying "Not in a project" on cards and rows.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../app/${p}`, import.meta.url), "utf8");

test("Needs you asks once whether a new repo is part of a product", () => {
  const q = read("components/hub/RepoQuestions.vue");
  assert.match(q, /\/v1\/projects\/questions/);
  assert.match(q, /\/join`, json\("POST", \{ into \}\)/);
  assert.match(q, /It's its own/);
  assert.match(read("pages/hub/index.vue"), /<HubRepoQuestions \/>/);
});

test("cards and rows no longer say Not in a project", () => {
  for (const p of ["components/hub/BoardCard.vue", "pages/hub/index.vue", "pages/hub/next.vue"])
    assert.doesNotMatch(read(p), /Not in a project/, p);
});
