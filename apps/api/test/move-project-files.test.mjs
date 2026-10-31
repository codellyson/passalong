import assert from "node:assert/strict";
import test from "node:test";
import { plan } from "../../../scripts/move-project-files.mjs";

test("each project file moves from folders/ to projects/ under the same project and id", () => {
  assert.deepEqual(plan([{ id: "a1", project_id: "p1" }]), [
    { from: "folders/p1/a1", to: "projects/p1/a1" },
  ]);
  assert.deepEqual(plan([]), []);
});
