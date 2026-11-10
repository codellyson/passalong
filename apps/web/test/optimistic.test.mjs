// Runs on Node 22.18+ with built-in type stripping (`node --test`). The modules import only types,
// which the stripper erases, so they load without Nuxt.
import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError, SignedOut, shouldRetry } from "../app/utils/http.ts";
import {
  ctxFinished,
  ctxFreed,
  ctxTaken,
  dropFromBoard,
  freed,
  givenTo,
  moved,
  personAgent,
  taken,
  withStatus,
} from "../app/utils/optimistic.ts";

const work = (id, over = {}) => ({ id, mine: false, status: "ready", ...over });
const board = () => ({
  waiting: [work("a"), work("b")],
  failing: [],
  in_flight: [work("c", { mine: true })],
  landed: [],
});

test("passing, answering or deleting takes a piece of work off the board", () => {
  const b = dropFromBoard(board(), "a");
  assert.deepEqual(
    b.waiting.map((g) => g.id),
    ["b"],
  );
  assert.equal(b.in_flight.length, 1);
});

test("an archive is what the list would say once the server agrees", () => {
  assert.equal(withStatus(work("a"), "done").status, "done");
});

test("a failed load is retried, but not a signed-out session or a refusal", () => {
  assert.equal(shouldRetry(0, new Error("network")), true);
  assert.equal(shouldRetry(2, new Error("network")), false, "twice at most");
  assert.equal(shouldRetry(0, new SignedOut()), false);
  assert.equal(shouldRetry(0, new HttpError("not in that team", 403)), false);
  assert.equal(shouldRetry(0, new HttpError("on our side", 503)), true);
});

// Every act on work answers before the server does (2026-11-04): the card moves to the column it will
// land in, and the work page shows the state it will have.
const ME = { account: "V7kq8h5ynh", handle: "ada", name: "Ada" };
const AT = "2026-11-04T10:00:00.000Z";
const ctx = (over = {}) => ({
  work: work("w", { stage: "todo", held_by: [] }),
  claims: [],
  proofs: [],
  ...over,
});

test("Draft, Ready and Done move the card to their column; only Done keeps an outcome", () => {
  assert.equal(moved(work("w"), "draft").stage, "draft");
  assert.equal(moved(work("w", { outcome: "finished" }), "ready").outcome, "");
  assert.deepEqual(
    (({ status, stage, outcome }) => ({ status, stage, outcome }))(
      moved(work("w"), "done", "finished"),
    ),
    { status: "done", stage: "done", outcome: "finished" },
  );
});

test("I'll do this puts it in progress, held by you, as the page and the board show it", () => {
  const g = taken(work("w", { stage: "todo" }), ME, AT);
  assert.equal(g.stage, "working");
  assert.deepEqual(g.held_by, [{ name: "Ada", agent: "", you: true, health: "person", since: AT }]);
  const c = ctxTaken(ctx(), ME, AT);
  assert.equal(c.claims[0].agent, "person-v7kq8h5ynh", "the agent name the server takes it under");
  assert.equal(c.claims[0].agent, personAgent(ME.account));
  assert.equal(c.claims[0].mine, true);
});

test("marked done, it is finished with what you said, and nobody holds it", () => {
  const before = ctx({
    claims: [{ mine: true }],
    proofs: [{ ok: true, mine: false, note: "theirs" }],
  });
  const c = ctxFinished(before, ME, "Shipped it", AT);
  assert.equal(c.work.status, "done");
  assert.equal(c.work.outcome, "finished");
  assert.deepEqual(c.claims, []);
  assert.equal(c.proofs[0].note, "Shipped it");
  assert.equal(c.proofs[0].mine, true);
  assert.equal(c.proofs[1].note, "theirs", "the others' stay");
});

test("passed back or stopped, it is Ready and held by nobody", () => {
  const g = freed(work("w", { stage: "working", held_by: [{ you: true }] }));
  assert.equal(g.stage, "todo");
  assert.deepEqual(g.held_by, []);
  assert.deepEqual(ctxFreed(ctx({ claims: [{ mine: true }] })).claims, []);
});

test("given to someone, it names them as the server will", () => {
  assert.deepEqual((({ to, to_group }) => ({ to, to_group }))(givenTo(work("w"), "@bola")), {
    to: "bola",
    to_group: "",
  });
  assert.deepEqual(givenTo(work("w"), "#payments").lanes, ["#payments"]);
  assert.deepEqual(givenTo(work("w", { to: "bola" }), "").to, null);
});
