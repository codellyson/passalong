// Push delivery: what reaches a device, and the two events that had no way to reach you before.
//
// The routes are pinned by reading their source, as the other route tests are — the app is not
// importable under type stripping. The bytes on the wire are checked in webpush.test.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { KINDS, PUSHED, pushes } from "../src/notify.ts";

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const notifySrc = readFileSync(new URL("../src/notify.ts", import.meta.url), "utf8");

test("what needs you, and each step of the loop on work you sent, is pushed; the rest stays in the feed", () => {
  assert.deepEqual([...PUSHED].sort(), [
    "asked",
    "at_limit",
    "blocked",
    "child_done",
    "email_sender",
    "emailed",
    "hooked",
    "near_limit",
    "passed",
    "plan_ending",
    "pulled",
    "reader_unsure",
    "reopened",
    "replied",
    "sent_to_you",
    "stalled",
    "stuck",
    "task_claimed",
    "task_finished",
    "untaken",
  ]);
  for (const quiet of ["joined", "shared", "archived", "said", "task_released"])
    assert.ok(!PUSHED.has(quiet), `${quiet} is not pushed`);
  for (const k of PUSHED) assert.ok(KINDS.includes(k), `${k} is a real kind`);
});

test("taken, handed in, passed back and replied to push every time", () => {
  for (const k of ["task_claimed", "task_finished", "passed", "replied", "asked"])
    assert.ok(pushes(k, 3, "acct"), `${k} pushes`);
  assert.ok(!pushes("said", 1, "acct"), "talk on held work is not pushed");
});

test("an open pushes only the first time a named person opens it", () => {
  assert.ok(pushes("pulled", 1, "acct"));
  assert.ok(!pushes("pulled", 2, "acct"), "a reread is not news");
  assert.ok(!pushes("pulled", 1, ""), "an anonymous link read has no who");
  assert.ok(!pushes("pulled", 1, undefined));
});

test("a push never fails the action that caused it", () => {
  const hook = notifySrc.slice(
    notifySrc.indexOf("if (row && pushes(e.kind, row.times, e.actor_id))"),
  );
  assert.match(hook.slice(0, 900), /\.catch\(/);
});

test("the app wires delivery, and a private device's notice names nothing", () => {
  assert.match(index, /flushOutbox\(env, \(to, m\) => deliverPush\(env, to, m\), now\)/);
  assert.match(index, /body: d\.private \? "Something needs you in Passalong\." : m\.text/);
  // A subscription the push service says is gone is forgotten.
  assert.match(
    index,
    /if \(out\.outcome === "gone"\)\s+await env\.DB\.prepare\("DELETE FROM push_subscription WHERE id = \?"\)/,
  );
});

test("a failed send is logged with what the push service said, never dropped", () => {
  assert.match(index, /if \(out\.outcome !== "sent"\)\s+console\.error\(\s*"push"/);
});

test("the Settings test reports the push service's answer", () => {
  const route = index.slice(index.indexOf('app.post("/v1/push/subscriptions/:id/test"'));
  assert.match(route, /out\.outcome === "failed"/);
});

test("a push is shown even with the hub open: it is never closed for being looked at", () => {
  const sw = readFileSync(new URL("../../web/public/sw.js", import.meta.url), "utf8");
  const handler = sw.slice(
    sw.indexOf('addEventListener("push"'),
    sw.indexOf('addEventListener("notificationclick"'),
  );
  assert.match(handler, /showNotification\(/);
  assert.doesNotMatch(handler, /\.close\(\)/);
});

test("your own agent finishing your task reaches you, without an actor", () => {
  assert.match(
    index,
    /actor_id: kind === "task_finished" && c\.get\("account"\) === recipient \? "" : c\.get\("account"\)/,
  );
});

test("an agent stuck on you is told once, when the block starts", () => {
  const route = index.slice(
    index.indexOf('app.put("/v1/work/:id/progress"'),
    index.indexOf("const fenceIn"),
  );
  assert.match(route, /blocked\.test\(claim\.note\) && !blocked\.test\(before\?\.note \|\| ""\)/);
  assert.match(route, /kind: "blocked",\s+work_id: claim\.work_id,\s+actor_id: "",/);
});

test("a subscription must be an https endpoint with browser-shaped keys", () => {
  const route = index.slice(index.indexOf('app.post("/v1/push/subscriptions"'));
  assert.match(route.slice(0, 2000), /protocol === "https:"/);
  assert.match(route.slice(0, 2000), /b64len\(p256dh\) !== 65/);
  assert.match(route.slice(0, 2000), /b64len\(auth\) !== 16/);
});
