// Runs on Node 22.18+ with built-in type stripping (`node --test`). The modules import only types,
// which the stripper erases, so they load without Nuxt.
import assert from "node:assert/strict";
import { test } from "node:test";
import { arrange, laneOf, statusLine } from "../app/utils/lanes.ts";
import { handleFrom, personName } from "../app/utils/people.ts";

const state = (key, attention = false) => ({ key, attention });
const row = (g, key, attention) => ({
  g: { id: "a1", mine: false, status: "published", created: "2026-09-01T00:00:00Z", ...g },
  state: key ? state(key, attention) : null,
});

test("each guide lands in exactly one of the three sections", () => {
  assert.equal(laneOf(row({}, "unanswered")), "needs", "sent to you and unanswered");
  assert.equal(laneOf(row({}, "unjudged")), "needs", "opened and no verdict yet");
  assert.equal(laneOf(row({ mine: true }, "flight")), "sent");
  assert.equal(laneOf(row({ mine: true }, "passed", true)), "sent");
  assert.equal(
    laneOf(row({ mine: true, verdict: { ok: true, by: "ada", note: "" } }, "landed")),
    "done",
    "a handoff someone said worked is finished",
  );
  assert.equal(laneOf(row({ status: "consumed" }, "unanswered")), "done", "archived beats state");
  assert.equal(laneOf(row({}, null)), "done", "sent to you and passed on");
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
  assert.equal(statusLine(opened).text, "opened by someone with the link, nobody has taken it");
  assert.equal(statusLine(row({ mine: true }, "flight")).text, "not opened yet");
});

test("rows say what happened in words people use, with names", () => {
  assert.equal(statusLine(row({}, "waiting")).text, "you're taking it", "not 'did it work?' yet");
  assert.doesNotMatch(statusLine(row({}, "unjudged")).text, /pull/);
  const passed = row(
    { mine: true, declined: [{ by: "ada", by_name: "Ada Okafor", note: "not mine", at: "n" }] },
    "passed",
    true,
  );
  assert.equal(statusLine(passed).text, "Ada Okafor passed: not mine");
  const taken = row({ mine: true, taken_by: ["bo"], taken_by_names: ["Bo"] }, "taken");
  assert.equal(statusLine(taken).text, "Bo is taking it");
});

test("a person is their name, then @handle, then @account id", () => {
  assert.equal(personName("Ada", "ada", "acc1"), "Ada");
  assert.equal(personName("  ", "ada", "acc1"), "@ada");
  assert.equal(personName(null, null, "acc1"), "@acc1");
  assert.equal(handleFrom("Ada Ọkafor!"), "ada-okafor");
});

test("the follow-up dock is an address: open, close, and room for four", async () => {
  const { dockHref, parseWith, withClosed, withOpened } = await import("../app/utils/dock.ts");
  assert.deepEqual(withOpened(["a"], "b"), ["a", "b"]);
  assert.deepEqual(withOpened(["a", "b"], "a"), ["a", "b"], "already open is a no-op");
  assert.deepEqual(
    withOpened(["a", "b", "c", "d"], "e"),
    ["b", "c", "d", "e"],
    "past four, the one opened first makes room",
  );
  assert.deepEqual(withClosed(["a", "b"], "a"), ["b"]);
  assert.equal(dockHref("/g/x/k", ["a", "b"], { jump: "b" }), "/g/x/k?with=a,b#f-b");
  assert.equal(dockHref("/g/x/k", [], { verify: true }), "/g/x/k?view=verify");
  assert.equal(dockHref("/g/x/k", []), "/g/x/k");
  assert.deepEqual(parseWith("abc123, abc123,../x,def456", /^[a-z0-9]{6,12}$/), [
    "abc123",
    "def456",
  ]);
});

test("a team's guide a teammate handled says who, instead of asking you", () => {
  const g = {
    id: "a1",
    mine: false,
    team: "acme",
    verdict: { ok: true, by: "ada", by_name: "Ada", note: "", at: "t" },
  };
  assert.equal(statusLine({ g, state: null }).text, "Ada said it worked");
  const t = { id: "a2", mine: false, team: "acme", taken_by: ["bo"], taken_by_names: ["Bo"] };
  assert.equal(statusLine({ g: t, state: null }).text, "Bo is taking it");
});
