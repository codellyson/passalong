// A guide's progress as the things that happened to it, in order (utils/progress.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { progressOf } from "../app/utils/progress.ts";

const T = (m) => `2026-09-16T10:${String(m).padStart(2, "0")}:00.000Z`;
const guide = (over = {}) => ({
  id: "g1",
  title: "Map the modules",
  kind: "task",
  mine: true,
  created: T(0),
  to: "ibrahim",
  to_name: "Ibrahim Adekunle",
  pulled_by: [],
  ...over,
});
const ctx = (over = {}) => ({
  guide: guide(over.guide),
  owner: true,
  claims: [],
  verdicts: [],
  acks: [],
  parent: null,
  children: [],
  blocked_by: [],
  blocks: [],
  ...over,
  ...(over.guide ? { guide: guide(over.guide) } : {}),
});
const say = (beats) => beats.map((b) => `${b.who} ${b.what}`);

test("it starts with the sending and runs in time order, whatever order the rows arrive in", () => {
  const beats = progressOf(
    ctx({
      guide: { pulled_by: [{ handle: "hybee1", at: T(5) }] },
      acks: [
        { taken: true, by: { handle: "ibrahim", name: "Ibrahim Adekunle" }, note: "", at: T(3) },
      ],
    }),
  );
  assert.deepEqual(say(beats), [
    "You wrote the task",
    "Ibrahim Adekunle said they're taking it",
    "@hybee1 opened it",
  ]);
});

test("a pass carries its reason", () => {
  const [, passed] = progressOf(
    ctx({
      acks: [{ taken: false, by: { handle: "bo", name: "" }, note: "not my repo", at: T(1) }],
    }),
  );
  assert.equal(passed.what, "passed");
  assert.equal(passed.said, "not my repo");
  assert.equal(passed.tone, "warn");
});

test("an agent's hold says where, then its last word, then its hand-in with the evidence", () => {
  const claim = (state, note, evidence = "") => ({
    place: "",
    state,
    by: { handle: "ada", name: "" },
    repo: "khaime/techchak-backend",
    host: "mbp",
    note,
    evidence,
    claimed_at: T(1),
    updated: T(2),
    report: null,
  });
  const held = progressOf(ctx({ claims: [claim("claimed", "mapping admin routes")] }));
  assert.deepEqual(say(held).slice(1), [
    "@ada took it in khaime/techchak-backend on mbp",
    "@ada said",
  ]);
  assert.equal(held[2].said, "mapping admin routes");

  const quiet = progressOf(ctx({ claims: [claim("stalled", "halfway")] }));
  assert.equal(quiet[2].what, "went quiet after saying");

  const [, , handed] = progressOf(
    ctx({ claims: [claim("review", "done", "$ pnpm test\n# pass 12")] }),
  );
  assert.equal(handed.what, "handed it in");
  assert.equal(handed.proof, "$ pnpm test\n# pass 12");
});

test("a person's browser hand-in and their verdict show the screenshots once, on the verdict", () => {
  const proof = "works\n![paid](https://passalong.dev/v1/shots/abc123def456)";
  const beats = progressOf(
    ctx({
      claims: [
        {
          place: "",
          state: "review",
          by: { handle: "bo", name: "" },
          note: "works",
          evidence: proof,
          claimed_at: T(1),
          updated: T(2),
          report: null,
        },
      ],
      verdicts: [
        { ok: true, by: { handle: "bo", name: "" }, note: "works", detail: proof, at: T(2) },
      ],
    }),
  );
  assert.equal(beats.filter((b) => b.proof === proof).length, 1);
  assert.equal(beats.find((b) => b.what === "says it works")?.proof, proof);
});

test("a follow-up links to itself", () => {
  const beats = progressOf(
    ctx({
      children: [{ id: "f1", title: "Rewrite plan", created: T(9), mine: false, from: "rae" }],
    }),
  );
  assert.deepEqual(beats.at(-1).link, { id: "f1", title: "Rewrite plan" });
  assert.equal(beats.at(-1).who, "@rae");
});

test("a receipt a verdict wrote is not someone opening it", () => {
  const beats = progressOf(
    ctx({
      guide: {
        pulled_by: [
          { handle: "bo", via: "verdict", at: T(4) },
          { handle: "ada", via: "cli", at: T(2) },
        ],
      },
    }),
  );
  assert.deepEqual(say(beats), ["You wrote the task", "@ada opened it"]);
});

test("a verdict's proof reads as prose; a hand-in's evidence stays terminal output", () => {
  const beats = progressOf(
    ctx({
      claims: [
        {
          place: "",
          state: "review",
          by: { handle: "agent", name: "" },
          note: "",
          evidence: "$ pnpm test\n# pass 3",
          claimed_at: T(1),
          updated: T(2),
          report: null,
        },
      ],
      verdicts: [
        { ok: true, by: { handle: "bo", name: "" }, note: "", detail: "flipped to Paid", at: T(3) },
      ],
    }),
  );
  assert.equal(beats.find((b) => b.what === "handed it in").prose, undefined);
  assert.equal(beats.find((b) => b.what === "says it works").prose, true);
});

test("a hand-in whose evidence opens with its note says the note once", () => {
  const beats = progressOf(
    ctx({
      claims: [
        {
          place: "",
          state: "review",
          by: { handle: "bo", name: "" },
          note: "Refunded in Stripe",
          evidence: "Refunded in Stripe\n![s](https://x/v1/shots/abc123def456)",
          claimed_at: T(1),
          updated: T(2),
          report: null,
        },
      ],
    }),
  );
  const handed = beats.find((b) => b.what === "handed it in");
  assert.equal(handed.said, undefined);
  assert.ok(handed.proof.startsWith("Refunded in Stripe"));
});
