// The Work board's empty state when filters leave nothing (2026-11-06). It was a heading and a lone
// Clear filter button in a wide empty space, which said what was missing but not why, which filter
// did it, or what to do about it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const work = readFileSync(new URL("../app/pages/hub/work.vue", import.meta.url), "utf8");

test("filters that leave nothing say why, which filters did it, and how much they hide", () => {
  assert.match(work, /title: "Nothing matches these filters together"/);
  assert.match(work, /v-if="activeFilters\.length > 1"/);
  assert.match(work, /:aria-label="`Remove the filter: \$\{f\.label\}`"/);
  assert.match(
    work,
    /hidden by \{\{ activeFilters\.length === 1 \? "this filter" : "these filters" \}\}/,
  );
  assert.doesNotMatch(work, />Clear filter</);
});
