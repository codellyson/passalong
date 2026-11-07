import assert from "node:assert/strict";
import { test } from "node:test";
import { changeLabel } from "../app/utils/change.ts";

test("a hand-in's link is named for what it is, never shown as an address", () => {
  assert.equal(changeLabel("https://github.com/acme/shop/pull/12"), "pull request #12");
  assert.equal(changeLabel("https://github.com/acme/shop/pull/12/files"), "pull request #12");
  assert.equal(changeLabel("https://gitlab.com/acme/shop/-/merge_requests/4"), "merge request #4");
  assert.equal(changeLabel("https://github.com/acme/shop/commit/3f9a2c1d"), "the commit");
  assert.equal(changeLabel("https://github.com/acme/shop/tree/fix-price"), "the branch");
  assert.equal(changeLabel("https://example.com/review/77"), "the change");
  assert.equal(changeLabel("3f9a2c1d"), "");
});
