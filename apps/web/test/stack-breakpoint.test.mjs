// The lists are cards below md, a compact table from md, and the whole table from xl. Four
// components and one stylesheet each have to agree on where. They disagreed once: the stylesheet
// said 1280px and the components still said md (768px), because a rename done with BSD sed's `\b`
// changed nothing and said nothing, so a card showed the table's extra cells.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const at = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const COMPONENTS = ["GuideTable", "InboxRow", "ReportRow", "TaskTable"].map((n) => [
  n,
  at(`../app/components/hub/${n}.vue`),
]);
const CSS = at("../app/assets/css/styles.css");

/** Tailwind's own breakpoints, in rem, so the test says which ones the layouts are matching. */
const BREAKPOINT = { sm: 40, md: 48, lg: 64, xl: 80, "2xl": 96 };
const CARDS_BELOW = "md";
const FULL_TABLE_FROM = "xl";

test("the card layout stops where the compact table starts", () => {
  const queries = [...CSS.matchAll(/@media \(max-width: ([\d.]+)rem\)\s*\{\s*table\.rows\.stack/g)];
  assert.equal(queries.length, 1, "one media query holds the card layout");
  assert.equal(
    Number(queries[0][1]),
    BREAKPOINT[CARDS_BELOW] - 0.01,
    `the cards stop just under ${CARDS_BELOW} (${BREAKPOINT[CARDS_BELOW]}rem)`,
  );
});

test("the lists switch at those two widths only, and keep their extra columns until the second", () => {
  for (const [name, src] of COMPONENTS) {
    const used = new Set(
      [...src.matchAll(/(?<![\w-])(sm|md|lg|xl|2xl):[\w[\]-]+/g)].map((m) => m[1]),
    );
    for (const v of used)
      assert.ok(
        [CARDS_BELOW, FULL_TABLE_FROM].includes(v),
        `${name} uses ${v}:, which no layout here switches at`,
      );
    assert.ok(
      /class="[^"]*(?<![\w-])hidden(?![\w-])[^"]*(?<![\w-])xl:table-cell/.test(src),
      `${name} hides its extra columns until ${FULL_TABLE_FROM}`,
    );
  }
});
