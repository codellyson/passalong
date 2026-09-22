// Runs on Node 22.18+ with built-in type stripping (`node --test`). The module imports only types,
// which the stripper erases, so it loads without Nuxt.
import assert from "node:assert/strict";
import { test } from "node:test";
import { boardStates, stateOf } from "../app/utils/guide-state.ts";

const guide = (over = {}) => ({ id: "a1", mine: false, ...over });
const board = (over = {}) => ({ waiting: [], failing: [], in_flight: [], landed: [], ...over });

test("an unanswered handoff leads with the ack, an answered one with the pull", () => {
  const fresh = boardStates(board({ waiting: [guide()] })).get("a1");
  assert.equal(fresh.key, "unanswered");
  assert.equal(fresh.action, "ack", "before pulling anything, the sender is owed one word");

  const taken = boardStates(
    board({ waiting: [guide({ my_ack: { taken: true, note: "", at: "now" } })] }),
  ).get("a1");
  assert.equal(taken.action, "pull", "you took it; the next move is to fetch it");
  assert.equal(taken.label, "waiting on you", "and it is still yours to do");
});

test("a guide nobody took is not a guide nobody noticed", () => {
  const own = { id: "a1", mine: true };
  const quiet = boardStates(board({ in_flight: [{ ...own }] })).get("a1");
  assert.equal(quiet.key, "flight");
  assert.equal(quiet.attention, false, "silence is not yet actionable");

  const passed = boardStates(
    board({ in_flight: [{ ...own, declined: [{ by: "ada", note: "not mine", at: "now" }] }] }),
  ).get("a1");
  assert.equal(passed.key, "passed");
  assert.equal(passed.attention, true, "somebody answered and only the author can act on it");

  const held = boardStates(board({ in_flight: [{ ...own, taken_by: ["ada"] }] })).get("a1");
  assert.equal(held.key, "taken");
  assert.equal(held.attention, false, "answered, and nothing is owed by anyone yet");
});

test("a decline outranks a take: one person passing still needs re-homing", () => {
  const state = boardStates(
    board({
      in_flight: [
        { id: "a1", mine: true, taken_by: ["bo"], declined: [{ by: "ada", note: "no", at: "n" }] },
      ],
    }),
  ).get("a1");
  assert.equal(state.key, "passed");
});

test("a guide you passed on is in transit for you no longer", () => {
  const g = guide({ my_ack: { taken: false, note: "not mine", at: "now" } });
  assert.equal(stateOf(g, new Map(), "me"), null, "you answered; it is off your board");

  const kept = guide({ my_ack: { taken: true, note: "", at: "now" } });
  assert.equal(
    stateOf(kept, new Map(), "me").key,
    "unjudged",
    "taking it leaves you owing the sender a verdict",
  );
});

// A guide sent to a team or a group asks one of them, not each of them. Once a teammate has taken
// it or said how it went, it is not waiting on the rest — leaving it in their Needs you is how two
// people end up doing the same work.
test("a team's guide a teammate already handled is not waiting on you", () => {
  const worked = guide({
    team: "acme",
    verdict: { ok: true, by: "ada", by_name: "Ada", note: "", at: "t" },
  });
  assert.equal(stateOf(worked, new Map(), "me"), null, "Ada said it worked: nothing owed by me");

  const taken = guide({ team: "acme", taken_by: ["ada"], taken_by_names: ["Ada"] });
  assert.equal(stateOf(taken, new Map(), "me"), null, "Ada is on it: nothing owed by me");

  // Still yours when it was asked of you, or when you took it yourself.
  const named = guide({
    team: "acme",
    for_me: true,
    verdict: { ok: true, by: "ada", note: "", at: "t" },
  });
  assert.equal(stateOf(named, new Map(), "me").key, "unjudged");
  const mineToo = guide({
    team: "acme",
    taken_by: ["ada", "me"],
    my_ack: { taken: true, note: "", at: "t" },
  });
  assert.equal(stateOf(mineToo, new Map(), "me").key, "unjudged");

  // Nobody has touched it: you opened it, so how it went is still yours to say.
  assert.equal(stateOf(guide({ team: "acme" }), new Map(), "me").key, "unjudged");
});
