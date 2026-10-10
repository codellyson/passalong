// The lists are cards below md. Guide lists stay compact because the hub's capped width cannot
// hold their summary and recipient as extra columns beside long states and actions. Task lists
// add those columns when their own container is 64rem wide, never by the window's width. Components and CSS must agree: a prior breakpoint mismatch showed extra cells
// inside cards, and a viewport breakpoint later expanded a table beyond its rounded surface.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const at = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const GUIDE_COMPONENTS = ["GuideTable", "InboxRow", "ReportRow"].map((n) => [
  n,
  at(`../app/components/hub/${n}.vue`),
]);
const TASK_TABLE = at("../app/components/hub/TaskTable.vue");
const CSS = at("../app/assets/css/styles.css");

/** Tailwind's own breakpoints, in rem, so the test says which ones the layouts are matching. */
const BREAKPOINT = { sm: 40, md: 48, lg: 64, xl: 80, "2xl": 96 };
const CARDS_BELOW = "md";

test("the card layout stops where the compact table starts", () => {
  const queries = [...CSS.matchAll(/@media \(max-width: ([\d.]+)rem\)\s*\{\s*table\.rows\.stack/g)];
  assert.equal(queries.length, 1, "one media query holds the card layout");
  assert.equal(
    Number(queries[0][1]),
    BREAKPOINT[CARDS_BELOW] - 0.01,
    `the cards stop just under ${CARDS_BELOW} (${BREAKPOINT[CARDS_BELOW]}rem)`,
  );
});

test("guide lists keep five columns within the hub; tasks expand at xl", () => {
  for (const [name, src] of GUIDE_COMPONENTS) {
    const used = new Set(
      [...src.matchAll(/(?<![\w-])(sm|md|lg|xl|2xl):[\w[\]-]+/g)].map((m) => m[1]),
    );
    for (const v of used)
      assert.ok([CARDS_BELOW].includes(v), `${name} uses ${v}:, which no layout here switches at`);
    assert.doesNotMatch(src, /xl:table-cell/, `${name} must not expand outside the capped hub`);
  }
  assert.equal([...GUIDE_COMPONENTS[0][1].matchAll(/<th(?:\s|>)/g)].length, 5);
  for (const [name, src] of GUIDE_COMPONENTS.slice(1))
    assert.match(src, /colspan="4"/, `${name} detail row spans the four cells after selection`);
});

// The task table sits in a board column narrower than the window, so a window breakpoint showed
// columns its card could not hold and the table ran out of it. It decides by its own width now.
test("the task table's columns follow its container, and its layout is fixed", () => {
  assert.match(TASK_TABLE, /class="@container /, "the table's card is the container");
  assert.match(
    TASK_TABLE,
    /hidden w-\[\d+%\] @5xl:table-cell/,
    "summary column appears by container",
  );
  assert.doesNotMatch(
    TASK_TABLE,
    /(?<![\w@-])(lg|xl|2xl):(table-cell|hidden)/,
    "no column is shown or hidden by the window's width",
  );
  assert.match(TASK_TABLE, /task-rows/);
  assert.match(
    CSS,
    /table\.rows\.task-rows\s*\{\s*table-layout: fixed;/,
    "set widths, so nothing widens it",
  );
});
