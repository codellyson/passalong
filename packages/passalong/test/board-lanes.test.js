import assert from "node:assert/strict";
import { test } from "node:test";
import { todoLanes } from "../src/passalong.js";

// The agent's board groups Ready the way the hub's board does (lanesOf() in apps/api): you, each
// teammate, each group, then Anyone. Draft, held and finished work is not Ready.
test("Ready comes back by lane, you first and Anyone last", () => {
  const t = (id, state, extra = {}) => ({
    id,
    title: `work ${id}`,
    state,
    url: `u/${id}`,
    ...extra,
  });
  const lanes = todoLanes([
    t("old", "ready"),
    t("mine", "ready", { to: "@me", for_me: true }),
    t("mark", "ready", { to: "@mark" }),
    t("pair", "blocked", { to: "@mark @brian" }),
    t("fe", "ready", { to: "#frontend", for_me: true }),
    t("new", "ready"),
    t("d", "draft"),
    t("held", "claimed", { to: "@mark" }),
    t("x", "done"),
  ]);
  assert.deepEqual(
    lanes.map((l) => [l.lane, l.work.map((w) => w.id)]),
    [
      ["You", ["mine"]],
      ["@brian", ["pair"]],
      ["@mark", ["pair", "mark"]],
      ["#frontend", ["fe"]],
      ["Anyone", ["new", "old"]],
    ],
  );
});
