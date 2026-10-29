import assert from "node:assert/strict";
import { test } from "node:test";
import { age, byLine, projectsFrom, storedTone, toneOf } from "../app/utils/projects.ts";

test("a project keeps its folder's colour, never coral, and is stable without one", () => {
  assert.equal(toneOf({ id: "a", color: "blue" }), "blue");
  assert.equal(toneOf({ id: "a", color: "coral" }), "stone");
  assert.equal(toneOf({ id: "abc", color: "" }), toneOf({ id: "abc", color: "" }));
  assert.notEqual(toneOf({ id: "abc", color: "" }), "coral");
  assert.equal(storedTone("coral"), "stone");
  assert.equal(storedTone(""), "");
  assert.equal(storedTone("violet"), "violet");
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
      ["a", 0, ""],
      ["w", 6, "something"],
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

test("a project rolls up documents, its last change and what changed in it", () => {
  const folders = [
    {
      id: "w",
      title: "Website",
      color: "",
      parent_id: "",
      documents: 2,
      updated: "2026-10-01",
      last_change: { name: "README", by: "Ada", at: "2026-10-01" },
      changed: 0,
    },
    {
      id: "p",
      title: "Pages",
      color: "",
      parent_id: "w",
      documents: 3,
      updated: "2026-10-20",
      last_change: { name: "Pricing", by: "Bola", at: "2026-10-20" },
      changed: 1,
      changed_what: "Pricing",
    },
  ];
  const [w] = projectsFrom(folders);
  assert.equal(w.documents, 5);
  assert.equal(w.updated, "2026-10-20");
  assert.deepEqual(w.last, { name: "Pricing", by: "Bola", at: "2026-10-20" });
  assert.equal(w.changed, "Pricing");
  assert.equal(byLine("Bola", "agent"), "Bola, an agent");
  assert.equal(byLine("Ada", "person"), "Ada");
});
