// Deleting a project was only at the foot of its Edit form, where nobody looking to delete one
// thought to look (2026-11-05). It sits beside Edit and Share now, for whoever can manage it, and
// still asks in place before anything goes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("../app/pages/hub/projects/[id].vue", import.meta.url), "utf8");

test("Delete is beside the project's other actions, only for whoever can manage it", () => {
  const actions = page.slice(page.indexOf('<div v-if="!editing" class="flex flex-wrap gap-2">'));
  const row = actions.slice(0, actions.indexOf("</div>"));
  assert.match(
    row,
    /<button v-if="project\.manage" class="btn sm outline danger"[^>]*>Delete…<\/button>/,
  );
});

test("it asks first, saying what goes, and it is no longer hidden in Edit", () => {
  assert.match(
    page,
    /<div v-if="confirmingDelete && project\.manage && !editing"[^>]*role="alert">/,
  );
  assert.match(page, /<p class="m-0 min-w-0 grow font-ui text-sm">\{\{ deleteWhat \}\}<\/p>/);
  assert.equal(page.split('@click="remove"').length - 1, 1, "one Delete that deletes");
  assert.doesNotMatch(page, /Delete project…/);
});
