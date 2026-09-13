// Runs on Node 22.18+ with built-in type stripping (`node --test`). The module imports only types,
// which the stripper erases, so it loads without Nuxt.
import assert from "node:assert/strict";
import { test } from "node:test";
import { arrange, laneOf, statusLine } from "../app/utils/lanes.ts";

const state = (key, attention = false) => ({ key, attention });
const row = (g, key, attention) => ({
  g: { id: "a1", mine: false, status: "published", created: "2026-09-01T00:00:00Z", ...g },
  state: key ? state(key, attention) : null,
});

test("each guide lands in exactly one of the three sections", () => {
  assert.equal(laneOf(row({}, "unanswered")), "needs", "handed to you and unanswered");
  assert.equal(laneOf(row({}, "unjudged")), "needs", "pulled and no verdict yet");
  assert.equal(laneOf(row({ mine: true }, "flight")), "sent");
  assert.equal(laneOf(row({ mine: true }, "passed", true)), "sent");
  assert.equal(
    laneOf(row({ mine: true, verdict: { ok: true, by: "ada", note: "" } }, "landed")),
    "done",
    "a handoff someone said worked is finished",
  );
  assert.equal(laneOf(row({ status: "consumed" }, "unanswered")), "done", "archived beats state");
  assert.equal(laneOf(row({}, null)), "done", "handed to you and passed on");
});

test("bugs from one report collapse into one row, blocker first", () => {
  const bug = (id, severity, created) =>
    row({ id, mine: true, report: "r1", report_title: "Audit", severity, created }, "flight");
  const { sent } = arrange([
    bug("minor", "s3", "2026-09-03T00:00:00Z"),
    bug("blocker", "s1", "2026-09-01T00:00:00Z"),
    bug("major", "s2", "2026-09-02T00:00:00Z"),
  ]);
  assert.equal(sent.length, 1);
  assert.deepEqual(
    sent[0].group.rows.map((r) => r.g.id),
    ["blocker", "major", "minor"],
  );
  assert.equal(
    sent[0].group.created,
    "2026-09-03T00:00:00Z",
    "a report is as new as its newest bug",
  );
});

test("a report down to one bug is shown as that bug", () => {
  const { sent } = arrange([row({ mine: true, report: "r1" }, "flight")]);
  assert.ok("row" in sent[0]);
});

test("newest first, except a guide handed back leads what you sent", () => {
  const { sent, needs } = arrange([
    row({ id: "old", mine: true, created: "2026-09-01T00:00:00Z" }, "passed", true),
    row({ id: "new", mine: true, created: "2026-09-05T00:00:00Z" }, "flight"),
    row({ id: "n-old", created: "2026-09-01T00:00:00Z" }, "unanswered"),
    row({ id: "n-new", created: "2026-09-05T00:00:00Z" }, "unanswered"),
  ]);
  assert.deepEqual(
    sent.map((e) => e.row.g.id),
    ["old", "new"],
  );
  assert.deepEqual(
    needs.map((r) => r.g.id),
    ["n-new", "n-old"],
  );
});

test("a row never says a guide is unopened when someone opened it", () => {
  const opened = row({ mine: true, pulled_by: [{ handle: null, at: "now" }] }, "flight");
  assert.equal(statusLine(opened).text, "opened by a link");
  assert.equal(statusLine(row({ mine: true }, "flight")).text, "not opened yet");
});
