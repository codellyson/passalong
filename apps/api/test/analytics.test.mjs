// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { track } from "../src/analytics.ts";

const spy = (impl) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return impl ? impl() : { ok: true };
  };
  fn.calls = calls;
  return fn;
};

test("no key, no call — an unconfigured deployment stays silent", async () => {
  const f = spy();
  await track({}, "guide_shared", { team: true }, f);
  await track({ APTABASE_KEY: "" }, "guide_shared", {}, f);
  assert.equal(f.calls.length, 0);
});

test("the key picks the region", async () => {
  const us = spy();
  await track({ APTABASE_KEY: "A-US-0000000000" }, "guide_shared", {}, us);
  assert.match(us.calls[0].url, /^https:\/\/us\.aptabase\.com\/api\/v0\/event$/);
  const eu = spy();
  await track({ APTABASE_KEY: "A-EU-0000000000" }, "guide_shared", {}, eu);
  assert.match(eu.calls[0].url, /^https:\/\/eu\.aptabase\.com\//);
});

test("the payload carries the event and nothing it was not given", async () => {
  const f = spy();
  await track(
    { APTABASE_KEY: "A-US-1", ENVIRONMENT: "production" },
    "guide_pulled",
    { via: "cli" },
    f,
  );
  const [{ init, body }] = f.calls;
  assert.equal(init.headers["app-key"], "A-US-1");
  // One object, not an array: the /api/v0/events batch form silently drops everything, and the
  // ingest answers 200 either way, so only a test keeps this honest.
  assert.ok(!Array.isArray(body), "the singular endpoint takes one object");
  assert.equal(body.eventName, "guide_pulled");
  assert.deepEqual(body.props, { via: "cli" });
  assert.equal(body.systemProps.isDebug, false);
  assert.deepEqual(Object.keys(body.systemProps).sort(), [
    "appVersion",
    "isDebug",
    "locale",
    "sdkVersion",
  ]);
  // The session is a bucket of time, not a person: nothing here should be durable or identifying.
  // It must also *parse as recent* — Aptabase reads it as a timestamp and rejects anything old
  // with "Session is too old", which the batch endpoint used to hide behind a 200.
  assert.match(body.sessionId, /^\d{18}$/);
  const asSeconds = Number(body.sessionId.slice(0, 10));
  assert.ok(Math.abs(asSeconds - Date.now() / 1000) < 3700, "must read as the current hour");
  assert.equal(asSeconds % 3600, 0, "and be the top of it, so everyone in that hour shares one");
});

test("non-production is flagged as debug so real numbers stay clean", async () => {
  const f = spy();
  await track({ APTABASE_KEY: "A-US-1" }, "x", {}, f);
  assert.equal(f.calls[0].body.systemProps.isDebug, true);
});

test("analytics can never break the request that triggered it", async () => {
  await track({ APTABASE_KEY: "A-US-1" }, "x", {}, async () => {
    throw new Error("aptabase is down");
  });
  // Reaching here without throwing is the assertion.
  assert.ok(true);
});
