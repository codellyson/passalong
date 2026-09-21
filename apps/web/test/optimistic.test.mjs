// Runs on Node 22.18+ with built-in type stripping (`node --test`). The modules import only types,
// which the stripper erases, so they load without Nuxt.
import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError, SignedOut, shouldRetry } from "../app/utils/http.ts";
import {
  dropFromBoard,
  patchBoard,
  withAck,
  withStatus,
  withVerdict,
} from "../app/utils/optimistic.ts";

const guide = (id, over = {}) => ({ id, mine: false, status: "published", ...over });
const board = () => ({
  waiting: [guide("a"), guide("b")],
  failing: [],
  in_flight: [guide("c", { mine: true })],
  landed: [],
});

test("taking a guide writes your answer onto it, and nothing else", () => {
  const b = patchBoard(board(), "a", (g) => withAck(g, true, "", "now"));
  assert.deepEqual(b.waiting[0].my_ack, { taken: true, note: "", at: "now" });
  assert.equal(b.waiting[1].my_ack, undefined, "the other guide is untouched");
});

test("passing, answering or deleting takes a guide off the board", () => {
  const b = dropFromBoard(board(), "a");
  assert.deepEqual(
    b.waiting.map((g) => g.id),
    ["b"],
  );
  assert.equal(b.in_flight.length, 1);
});

test("a verdict and an archive are what the list would say once the server agrees", () => {
  const judged = withVerdict(guide("a"), false, "flag missing", "ada", "Ada");
  assert.deepEqual(judged.verdict, { ok: false, note: "flag missing", by: "ada", by_name: "Ada" });
  assert.equal(withStatus(guide("a"), "consumed").status, "consumed");
});

test("a failed load is retried, but not a signed-out session or a refusal", () => {
  assert.equal(shouldRetry(0, new Error("network")), true);
  assert.equal(shouldRetry(2, new Error("network")), false, "twice at most");
  assert.equal(shouldRetry(0, new SignedOut()), false);
  assert.equal(shouldRetry(0, new HttpError("not in that team", 403)), false);
  assert.equal(shouldRetry(0, new HttpError("on our side", 503)), true);
});
