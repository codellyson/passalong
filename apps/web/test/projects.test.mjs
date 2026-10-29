import assert from "node:assert/strict";
import { test } from "node:test";
import { age, projectsFrom, toneOf } from "../app/utils/projects.ts";

test("a project keeps its folder's colour, never coral, and is stable without one", () => {
  assert.equal(toneOf({ id: "a", color: "blue" }), "blue");
  assert.equal(toneOf({ id: "a", color: "coral" }), "plum");
  assert.equal(toneOf({ id: "abc", color: "" }), toneOf({ id: "abc", color: "" }));
  assert.notEqual(toneOf({ id: "abc", color: "" }), "coral");
});

test("projects are the top folders, counting everything beneath them", () => {
  const got = projectsFrom([
    { id: "w", title: "Website", color: "green", parent_id: "", open: 1, changed: 0 },
    { id: "p", title: "Pages", color: "", parent_id: "w", open: 2, changed: 1 },
    { id: "pp", title: "Deep", color: "", parent_id: "p", open: 3, changed: 0 },
    { id: "a", title: "App", color: "", parent_id: "", open: 0, changed: 0 },
  ]);
  assert.deepEqual(
    got.map((p) => [p.id, p.open, p.changed]),
    [
      ["a", 0, false],
      ["w", 6, true],
    ],
  );
});

test("age reads in one unit", () => {
  const now = Date.parse("2026-10-29T09:00:00Z");
  assert.equal(age("2026-10-29T08:59:50Z", now), "1m");
  assert.equal(age("2026-10-28T07:00:00Z", now), "26h");
  assert.equal(age("2026-10-25T09:00:00Z", now), "4d");
  assert.equal(age("2026-09-01T09:00:00Z", now), "8w");
});
