// A piece of work's progress as the things that happened to it, in order (utils/progress.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { progressOf } from "../app/utils/progress.ts";

const T = (m) => `2026-09-16T10:${String(m).padStart(2, "0")}:00.000Z`;
const work = (over = {}) => ({
  id: "g1",
  title: "Map the modules",
  mine: true,
  created: T(0),
  to: "ibrahim",
  to_name: "Ibrahim Adekunle",
  pulled_by: [],
  ...over,
});
const ctx = (over = {}) => ({
  work: work(over.work),
  owner: true,
  claims: [],
  proofs: [],
  parent: null,
  children: [],
  blocked_by: [],
  blocks: [],
  ...over,
  ...(over.work ? { work: work(over.work) } : {}),
});
const say = (beats) => beats.map((b) => `${b.who} ${b.what}`);
const claim = (state, note) => ({
  state,
  by: { handle: "ada", name: "" },
  repo: "khaime/techchak-backend",
  host: "mbp",
  note,
  evidence: "",
  claimed_at: T(1),
  updated: T(2),
});

test("it starts with the sending and runs in time order, whatever order the rows arrive in", () => {
  const beats = progressOf(
    ctx({
      work: { pulled_by: [{ handle: "hybee1", at: T(5) }] },
      claims: [claim("claimed", "")],
    }),
  );
  assert.deepEqual(say(beats), [
    "You sent it to Ibrahim Adekunle",
    "@ada took it in khaime/techchak-backend on mbp",
    "@hybee1 opened it",
  ]);
});

test("work for nobody in particular is written, not sent", () => {
  const [first] = progressOf(ctx({ work: { to: "", to_name: "" } }));
  assert.equal(first.what, "wrote it");
});

test("an agent's hold says where, then its last word", () => {
  const held = progressOf(ctx({ claims: [claim("claimed", "mapping admin routes")] }));
  assert.deepEqual(say(held).slice(1), [
    "@ada took it in khaime/techchak-backend on mbp",
    "@ada said",
  ]);
  assert.equal(held[2].said, "mapping admin routes");

  const quiet = progressOf(ctx({ claims: [claim("stalled", "halfway")] }));
  assert.equal(quiet[2].what, "went silent after saying");
  assert.equal(quiet[2].tone, "warn");
});

test("finishing carries what it was finished with", () => {
  const beats = progressOf(
    ctx({
      proofs: [
        {
          ok: true,
          by: { handle: "ada", name: "Ada" },
          note: "done",
          detail: "![works](/v1/shots/abc123)",
          at: T(9),
        },
      ],
    }),
  );
  const done = beats.at(-1);
  assert.equal(done.what, "finished it");
  assert.equal(done.proof, "![works](/v1/shots/abc123)");
  assert.equal(done.said, undefined, "the proof says it; the note is not said twice");
  assert.equal(done.tone, "ok");
});

test("a receipt is not someone opening it", () => {
  const beats = progressOf(ctx({ work: { pulled_by: [{ handle: "bo", via: "web", at: T(3) }] } }));
  assert.deepEqual(say(beats), ["You sent it to Ibrahim Adekunle"]);
});

test("work made from it links to itself", () => {
  const beats = progressOf(
    ctx({
      children: [{ id: "c1", title: "Fix the login", created: T(4), mine: false, from: "bo" }],
    }),
  );
  assert.deepEqual(beats.at(-1).link, { id: "c1", title: "Fix the login" });
  assert.equal(beats.at(-1).what, "made more work from it");
});
