import assert from "node:assert/strict";
import { test } from "node:test";
import { groupNotes } from "../app/utils/activity.ts";

const n = (id, kind, who, extra = {}) => ({
  id: String(id),
  at: "2026-10-02T10:00:00Z",
  text: `${who} ${kind} "g${id}"`,
  guide: `g${id}`,
  read: false,
  kind,
  actor_name: who,
  team_name: "Khaime",
  ...extra,
});

test("a run of three or more from one person folds into one line with the count", () => {
  const out = groupNotes([
    n(1, "shared", "Bamiboy"),
    n(2, "shared", "Bamiboy"),
    n(3, "shared", "Bamiboy"),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "group");
  assert.equal(out[0].text, "Bamiboy shared 3 guides with Khaime");
  assert.equal(out[0].notes.length, 3);
});

test("two stay two lines", () => {
  assert.equal(groupNotes([n(1, "shared", "Bamiboy"), n(2, "shared", "Bamiboy")]).length, 2);
});

test("a different person or kind between breaks the run, and order is kept", () => {
  const out = groupNotes([
    n(1, "shared", "A"),
    n(2, "shared", "A"),
    n(3, "pulled", "B"),
    n(4, "shared", "A"),
  ]);
  assert.deepEqual(
    out.map((e) => e.kind),
    ["note", "note", "note", "note"],
  );
});

test("kinds with no count in their sentence are never folded", () => {
  const out = groupNotes([1, 2, 3, 4].map((i) => n(i, "stalled", "A")));
  assert.equal(out.length, 4);
});

test("a group is unread while any of its notes is", () => {
  const out = groupNotes([
    n(1, "pulled", "A", { read: true }),
    n(2, "pulled", "A"),
    n(3, "pulled", "A", { read: true }),
  ]);
  assert.equal(out[0].read, false);
});
