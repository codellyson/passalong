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
  agent: "agent-ada",
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
    "@ada's agent took it",
    "@hybee1 opened it",
  ]);
});

test("work for nobody in particular is written, not sent", () => {
  const [first] = progressOf(ctx({ work: { to: "", to_name: "" } }));
  assert.equal(first.what, "wrote it");
});

test("an agent's hold says whose agent, never which repo or machine, and only going quiet is said", () => {
  const held = progressOf(ctx({ claims: [claim("claimed", "mapping admin routes")] }));
  // What it says as it goes is in the conversation on the same page; Progress keeps milestones.
  assert.deepEqual(say(held).slice(1), ["@ada's agent took it"]);
  assert.doesNotMatch(JSON.stringify(held), /techchak-backend|mbp/, "no repo, no host");
  const yours = progressOf(ctx({ claims: [{ ...claim("claimed", ""), mine: true }] }));
  assert.equal(yours[1].who, "Your agent");
  const person = progressOf(ctx({ claims: [{ ...claim("claimed", ""), agent: "person-x" }] }));
  assert.equal(person[1].who, "@ada", "a hold taken in the browser is the person's");

  const quiet = progressOf(ctx({ claims: [claim("stalled", "halfway")] }));
  assert.equal(quiet[2].what, "went silent after saying");
  assert.equal(quiet[2].tone, "warn");
});

test("finishing is the moment and its line; what it was finished with is shown once, above", () => {
  const proof = {
    ok: true,
    by: { handle: "ada", name: "Ada" },
    note: "done",
    detail: "![works](/v1/shots/abc123)",
    at: T(9),
  };
  const done = progressOf(ctx({ proofs: [proof] })).at(-1);
  assert.equal(done.what, "finished it");
  assert.equal(done.who, "Ada");
  assert.equal(done.proof, undefined, "the page's Finished with section shows it");
  assert.equal(done.said, undefined, "Finished with says it");
  assert.equal(done.tone, "ok");
  assert.equal(progressOf(ctx({ proofs: [{ ...proof, agent: true }] })).at(-1).who, "Ada's agent");
  assert.equal(
    progressOf(ctx({ proofs: [{ ...proof, agent: true, mine: true }] })).at(-1).who,
    "Your agent",
    "an agent's hand-in is never said as You",
  );
  // One that did not work has no such section, so its evidence stays here.
  const bad = progressOf(ctx({ proofs: [{ ...proof, ok: false }] })).at(-1);
  assert.equal(bad.proof, "![works](/v1/shots/abc123)");
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
