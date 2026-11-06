// The board's bulk bar (2026-11-06). Its colours were white at a low opacity, which vanished on the
// light bar a dark page gets, so its buttons had no edge and nothing led. Now it is drawn from its
// own colours, the count leads in a badge, each act has an icon, and Clear is an x.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const bar = readFileSync(new URL("../app/components/hub/BulkBar.vue", import.meta.url), "utf8");

test("nothing is drawn in white, which disappears on the bar a dark page gets", () => {
  assert.doesNotMatch(bar, /white\//);
  assert.match(bar, /hover:!bg-on-ink\/10/);
  assert.match(bar, /border-t border-on-ink\/15/);
});

test("the count leads, in a badge, and each act says what it is with an icon", () => {
  assert.match(bar, /rounded-full bg-coral[^"]*">\{\{ picked\.length \}\}<\/span>/);
  for (const icon of ["give", "board", "run", "archive"])
    assert.match(bar, new RegExp(`<AppIcon name="${icon}" />`), icon);
});

test("clearing is an x at the end, and says Esc does it too", () => {
  assert.match(bar, /title="Clear the selection \(Esc\)"/);
  assert.match(bar, /<AppIcon name="x" \/>/);
});

test("the board's sideways scroller leaves room for the first column's card edges", () => {
  // 2026-11-06: By person scrolls sideways, and a scroller clips at its own edge, which cut the
  // Draft column's cards off at their left border. It reaches past the edge and pads back.
  const board = readFileSync(new URL("../app/components/hub/Board.vue", import.meta.url), "utf8");
  assert.match(board, /md:-mx-1\.5 md:overflow-x-auto md:px-1\.5 md:pt-1\.5 md:-mt-1\.5/);
});
