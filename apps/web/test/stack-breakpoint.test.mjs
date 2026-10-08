// The lists turn into cards below one width, and four components and one stylesheet each have to
// agree on it. They disagreed once: the stylesheet said 1280px and the components still said md
// (768px), because a rename done with BSD sed's `\b` changed nothing and said nothing. A table of
// seven columns then showed its hidden cells inside a card between 768px and 1279px.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const at = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const COMPONENTS = ["GuideTable", "InboxRow", "ReportRow", "TaskTable"].map((n) => [
  n,
  at(`../app/components/hub/${n}.vue`),
]);
const CSS = at("../app/assets/css/styles.css");

/** Tailwind's own breakpoints, in rem, so the test says which one the stylesheet is matching. */
const BREAKPOINT = { sm: 40, md: 48, lg: 64, xl: 80, "2xl": 96 };
const CUT_OVER = "xl";

test("the stylesheet's card layout stops where the component classes say the table starts", () => {
  const queries = [...CSS.matchAll(/@media \(max-width: ([\d.]+)rem\)\s*\{\s*table\.rows\.stack/g)];
  assert.equal(queries.length, 1, "one media query holds the card layout");
  assert.equal(
    Number(queries[0][1]),
    BREAKPOINT[CUT_OVER] - 0.01,
    `the cards stop just under ${CUT_OVER} (${BREAKPOINT[CUT_OVER]}rem)`,
  );
});

test("every responsive class in the lists uses that same breakpoint", () => {
  for (const [name, src] of COMPONENTS) {
    const used = new Set(
      [...src.matchAll(/(?<![\w-])(sm|md|lg|xl|2xl):[\w[\]-]+/g)].map((m) => m[1]),
    );
    assert.deepEqual(
      [...used],
      [CUT_OVER],
      `${name} uses only ${CUT_OVER}: variants, found ${[...used]}`,
    );
  }
});
