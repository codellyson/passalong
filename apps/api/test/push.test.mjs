// Push delivery: what reaches a device, and the two events that had no way to reach you before.
//
// The routes are pinned by reading their source, as the other route tests are — the app is not
// importable under type stripping. The bytes on the wire are checked in webpush.test.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { KINDS, PUSHED } from "../src/notify.ts";

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const notifySrc = readFileSync(new URL("../src/notify.ts", import.meta.url), "utf8");

test("only what needs you is pushed; the rest stays in the feed and the toasts", () => {
  assert.deepEqual([...PUSHED].sort(), [
    "blocked",
    "failed",
    "handoff",
    "sent_back",
    "stalled",
    "task_finished",
    "task_rejected",
    "verified",
  ]);
  for (const quiet of ["pulled", "taken", "joined", "shared", "consumed", "task_claimed"])
    assert.ok(!PUSHED.has(quiet), `${quiet} is not pushed`);
  for (const k of PUSHED) assert.ok(KINDS.includes(k), `${k} is a real kind`);
});

test("a push never fails the action that caused it", () => {
  const hook = notifySrc.slice(notifySrc.indexOf("if (row && deliver && PUSHED.has(e.kind))"));
  assert.match(hook.slice(0, 700), /\.catch\(/);
});

test("the app wires delivery, and a private device's notice names nothing", () => {
  assert.match(index, /onPush\(\(env, to, m\) => deliverPush\(env as Env, to, m\)\)/);
  assert.match(index, /body: d\.private \? "Something needs you in Passalong\." : m\.text/);
  // A subscription the push service says is gone is forgotten.
  assert.match(
    index,
    /if \(out === "gone"\)\s+await env\.DB\.prepare\("DELETE FROM push_subscription WHERE id = \?"\)/,
  );
});

test("your own agent finishing your task reaches you, without an actor", () => {
  assert.match(
    index,
    /actor_id: kind === "task_finished" && c\.get\("account"\) === recipient \? "" : c\.get\("account"\)/,
  );
});

test("an agent stuck on you is told once, when the block starts", () => {
  const route = index.slice(
    index.indexOf('app.put("/v1/guides/:id/progress"'),
    index.indexOf("const fenceIn"),
  );
  assert.match(route, /blocked\.test\(claim\.note\) && !blocked\.test\(before\?\.note \|\| ""\)/);
  assert.match(route, /kind: "blocked",\s+guide_id: claim\.guide_id,\s+actor_id: "",/);
});

test("a subscription must be an https endpoint with browser-shaped keys", () => {
  const route = index.slice(index.indexOf('app.post("/v1/push/subscriptions"'));
  assert.match(route.slice(0, 2000), /protocol === "https:"/);
  assert.match(route.slice(0, 2000), /b64len\(p256dh\) !== 65/);
  assert.match(route.slice(0, 2000), /b64len\(auth\) !== 16/);
});
