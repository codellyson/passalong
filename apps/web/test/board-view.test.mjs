// The board's toggles are remembered in the browser, and a link that names a view still wins.
import assert from "node:assert/strict";
import { test } from "node:test";
import { nextView, readView, restoreView } from "../app/utils/board-view.ts";

test("a plain Work page opens as it was last left", () => {
  assert.deepEqual(restoreView({}, { mine: "1", by: "status" }), { mine: "1", by: "status" });
  assert.equal(restoreView({}, {}), null, "nothing remembered: the defaults");
});

test("a link that names a view opens as it was shared", () => {
  assert.equal(restoreView({ by: "status" }, { mine: "1" }), null);
  assert.equal(restoreView({ mine: "1" }, { by: "status" }), null);
});

test("flipping a toggle remembers the whole view, and turning one back off forgets it", () => {
  assert.deepEqual(nextView({ by: "status" }, { mine: "1" }), { mine: "1", by: "status" });
  assert.deepEqual(nextView({ mine: "1" }, { mine: undefined }), {});
});

test("anything stored that is not a view is no view", () => {
  for (const raw of [null, "", "nope", "[]", '{"mine":true}', '{"by":"person"}'])
    assert.deepEqual(readView(raw), {}, String(raw));
});
