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
  assert.match(us.calls[0].url, /^https:\/\/us\.aptabase\.com\/api\/v0\/events$/);
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
  assert.ok(Array.isArray(body), "the ingest endpoint takes a batch");
  assert.equal(body[0].eventName, "guide_pulled");
  assert.deepEqual(body[0].props, { via: "cli" });
  assert.equal(body[0].systemProps.isDebug, false);
  // The session is a bucket of time, not a person: nothing here should be durable or identifying.
  assert.match(body[0].sessionId, /^\d+$/);
  assert.equal(body[0].sessionId, String(Math.floor(Date.parse(body[0].timestamp) / 3600e3)));
});

test("non-production is flagged as debug so real numbers stay clean", async () => {
  const f = spy();
  await track({ APTABASE_KEY: "A-US-1" }, "x", {}, f);
  assert.equal(f.calls[0].body[0].systemProps.isDebug, true);
});

test("analytics can never break the request that triggered it", async () => {
  await track({ APTABASE_KEY: "A-US-1" }, "x", {}, async () => {
    throw new Error("aptabase is down");
  });
  // Reaching here without throwing is the assertion.
  assert.ok(true);
});
