// Runs on Node 22.18+ with built-in type stripping (`node --test`). The modules import only types,
// which the stripper erases, so they load without Nuxt.
import assert from "node:assert/strict";
import { test } from "node:test";
import { draftMarkdown, followUpDefaults } from "../app/utils/guide-draft.ts";
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

test("a guide written in the browser is the document the CLI would write", () => {
  const md = draftMarkdown("abc12345", {
    title: "Fix: invoice PDF",
    team: "khaime",
    to: "@bami",
    problem: "PDFs time out.",
    solution: "",
    steps: "1. Stream it.",
    verification: "Download works.",
    gotchas: "",
  });
  assert.match(md, /^---\nid: abc12345\ntitle: "Fix: invoice PDF"\nkind: transfer\n/);
  assert.match(md, /\nteam: khaime\nto: bami\n---\n/);
  assert.match(md, /## Problem\n\nPDFs time out\.\n\n## Steps\n\n1\. Stream it\./);
  assert.doesNotMatch(md, /Solution shape|Gotchas/, "empty sections are left out");
});

test("a follow-up goes to the people the original is for", () => {
  assert.deepEqual(
    followUpDefaults({ mine: true, team: "khaime", from: "me", to: "ada" }),
    { team: "khaime", to: "ada" },
    "context for your own guide reaches whoever you sent it to",
  );
  assert.deepEqual(
    followUpDefaults({ mine: true, team: "khaime", from: "me", to: null }),
    { team: "khaime", to: "" },
    "a guide sent to the whole team gets its context sent to the whole team",
  );
  assert.deepEqual(
    followUpDefaults({ mine: false, team: "khaime", from: "bami", to: "me" }),
    { team: "khaime", to: "bami" },
    "context for someone else's guide goes to its author",
  );
  assert.deepEqual(
    followUpDefaults({ mine: false, team: null, from: "bami", to: null }),
    { team: "", to: "" },
    "no team, no address",
  );
});
