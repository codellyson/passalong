// Work events for app channels (src/work-events.ts): which writes are events, the body, the signature.
import assert from "node:assert/strict";
import { test } from "node:test";
import { eventBody, eventFor, signature, takesNext, verify } from "../src/work-events.ts";

test("each act on a piece of work is its event, and reads are not", () => {
  assert.equal(eventFor("POST", "/v1/take"), "taken");
  assert.equal(eventFor("POST", "/v1/tasks/next"), "taken");
  assert.equal(eventFor("POST", "/v1/tasks/ab12cd34/person-take"), "taken");
  assert.equal(eventFor("PUT", "/v1/work/ab12cd34/progress"), "progress");
  assert.equal(eventFor("POST", "/v1/work/ab12cd34/ask"), "asked");
  assert.equal(eventFor("POST", "/v1/work/ab12cd34/hand_in"), "handed_in");
  assert.equal(eventFor("POST", "/v1/tasks/ab12cd34/person-hand_in"), "handed_in");
  assert.equal(eventFor("POST", "/v1/work/ab12cd34/finish"), "done");
  assert.equal(eventFor("POST", "/v1/work/ab12cd34/reopen"), "reopened");
  assert.equal(eventFor("PATCH", "/v1/work/ab12cd34/status"), "status");
  assert.equal(eventFor("GET", "/v1/work/ab12cd34/thread"), null);
  assert.equal(eventFor("POST", "/v1/work/ab12cd34/share"), null);
  assert.equal(eventFor("POST", "/v1/work/ab12cd34/hand_in/extra"), null);
  // Only the two takes that name no work read the id from the answer.
  assert.equal(takesNext("POST", "/v1/take"), true);
  assert.equal(takesNext("POST", "/v1/tasks/next"), true);
  assert.equal(takesNext("POST", "/v1/tasks/ab12cd34/person-take"), false);
  assert.equal(takesNext("GET", "/v1/take"), false);
});

test("the body carries ids and status, never what a person wrote", () => {
  const body = eventBody({
    event: "handed_in",
    work: "ab12cd34",
    status: "ready",
    team: "t1",
    url: "https://passalong.dev/hub/w/ab12cd34",
    at: "2026-11-27T10:00:00.000Z",
  });
  assert.deepEqual(Object.keys(JSON.parse(body)), ["event", "work", "status", "team", "url", "at"]);
});

test("a receiver can check the signature, and a changed body or an old one fails", async () => {
  const body = '{"event":"taken","work":"ab12cd34"}';
  const sig = await signature("whsec_test", 1_800_000_000, body);
  assert.match(sig, /^t=1800000000,v1=[0-9a-f]{64}$/);
  assert.equal(await verify("whsec_test", sig, body, 1_800_000_010), true);
  assert.equal(await verify("whsec_other", sig, body, 1_800_000_010), false);
  assert.equal(await verify("whsec_test", sig, `${body} `, 1_800_000_010), false);
  assert.equal(await verify("whsec_test", sig, body, 1_800_000_000 + 301), false);
});
