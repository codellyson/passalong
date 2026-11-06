// The Turnstile check in front of signing up, signing in and asking for a reset.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTurnstile, SITEVERIFY } from "../src/turnstile.ts";

// Cloudflare's published test secrets: the first always passes, the second always fails.
const PASS = "1x0000000000000000000000000000000AA";
const FAIL = "2x0000000000000000000000000000000AA";

const LIVE = "https://passalong.dev/v1/auth/signup";
const LOCAL = "http://localhost:3000/v1/auth/signup";

/** A stand-in for Siteverify that answers `reply` and remembers what it was sent. */
function siteverify(reply, status = 200) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, body: Object.fromEntries(new URLSearchParams(String(init.body))) });
    return new Response(JSON.stringify(reply), { status });
  };
  return { fetcher, calls };
}

const real = (over = {}) => ({
  success: true,
  action: "signup",
  hostname: "passalong.dev",
  "error-codes": [],
  ...over,
});

test("with no secret set there is no check, and Siteverify is never asked", async () => {
  const { fetcher, calls } = siteverify(real());
  const r = await checkTurnstile({}, { token: undefined, action: "signup", url: LIVE }, fetcher);
  assert.deepEqual(r, { ok: true });
  assert.equal(calls.length, 0);
});

test("a token Siteverify accepts for this form and this host lets the request through", async () => {
  const { fetcher, calls } = siteverify(real());
  const r = await checkTurnstile(
    { TURNSTILE_SECRET: "real-secret" },
    { token: "tok", action: "signup", url: LIVE, ip: "203.0.113.9" },
    fetcher,
  );
  assert.deepEqual(r, { ok: true });
  assert.equal(calls[0].url, SITEVERIFY);
  assert.deepEqual(calls[0].body, {
    secret: "real-secret",
    response: "tok",
    remoteip: "203.0.113.9",
  });
});

test("no token, an empty one, a non-string or an oversized one is refused before Siteverify", async () => {
  const { fetcher, calls } = siteverify(real());
  for (const token of [undefined, "", 42, "x".repeat(2049)]) {
    const r = await checkTurnstile(
      { TURNSTILE_SECRET: "s" },
      { token, action: "signup", url: LIVE },
      fetcher,
    );
    assert.deepEqual(r, { ok: false, reason: "missing-token" }, String(token).slice(0, 10));
  }
  assert.equal(calls.length, 0);
});

test("a token Siteverify rejects is refused, with its error codes as the reason", async () => {
  const { fetcher } = siteverify({
    success: false,
    "error-codes": ["timeout-or-duplicate"],
  });
  const r = await checkTurnstile(
    { TURNSTILE_SECRET: "s" },
    { token: "used", action: "login", url: LIVE },
    fetcher,
  );
  assert.deepEqual(r, { ok: false, reason: "timeout-or-duplicate" });
});

test("a token solved on another form does not open this one", async () => {
  const { fetcher } = siteverify(real({ action: "login" }));
  const r = await checkTurnstile(
    { TURNSTILE_SECRET: "s" },
    { token: "tok", action: "signup", url: LIVE },
    fetcher,
  );
  assert.deepEqual(r, { ok: false, reason: "wrong-action" });
});

test("a token solved on another host is refused", async () => {
  const { fetcher } = siteverify(real({ hostname: "passalong.kreativekorna.com" }));
  const r = await checkTurnstile(
    { TURNSTILE_SECRET: "s" },
    { token: "tok", action: "signup", url: LIVE },
    fetcher,
  );
  assert.deepEqual(r, { ok: false, reason: "wrong-hostname" });
  // The same token is fine on the host it was solved on: every serving host checks its own.
  const ok = await checkTurnstile(
    { TURNSTILE_SECRET: "s" },
    { token: "tok", action: "signup", url: "https://passalong.kreativekorna.com/v1/auth/signup" },
    fetcher,
  );
  assert.deepEqual(ok, { ok: true });
});

test("Siteverify down, erroring or answering nonsense fails closed", async () => {
  const env = { TURNSTILE_SECRET: "s" };
  const input = { token: "tok", action: "forgot", url: LIVE };
  const down = async () => {
    throw new TypeError("fetch failed");
  };
  assert.deepEqual(await checkTurnstile(env, input, down), {
    ok: false,
    reason: "siteverify-unreachable",
  });
  assert.deepEqual(await checkTurnstile(env, input, siteverify(real(), 500).fetcher), {
    ok: false,
    reason: "siteverify-500",
  });
  const html = async () => new Response("<html>", { status: 200 });
  assert.deepEqual(await checkTurnstile(env, input, html), {
    ok: false,
    reason: "siteverify-unreachable",
  });
});

test("a test-key result passes on localhost and is refused on a real host", async () => {
  // What Siteverify answers for the always-pass test secret: example.com, and no action.
  const testing = {
    success: true,
    hostname: "example.com",
    "error-codes": [],
    metadata: { result_with_testing_key: true },
  };
  const env = { TURNSTILE_SECRET: PASS };
  const local = await checkTurnstile(
    env,
    { token: "XXXX.DUMMY.TOKEN.XXXX", action: "signup", url: LOCAL },
    siteverify(testing).fetcher,
  );
  assert.deepEqual(local, { ok: true });
  const live = await checkTurnstile(
    env,
    { token: "XXXX.DUMMY.TOKEN.XXXX", action: "signup", url: LIVE },
    siteverify(testing).fetcher,
  );
  assert.deepEqual(live, { ok: false, reason: "testing-key" });
});

test("the always-fail test secret is refused", async () => {
  const { fetcher } = siteverify({
    success: false,
    "error-codes": ["invalid-input-response"],
    metadata: { result_with_testing_key: true },
  });
  const r = await checkTurnstile(
    { TURNSTILE_SECRET: FAIL },
    { token: "XXXX.DUMMY.TOKEN.XXXX", action: "login", url: LOCAL },
    fetcher,
  );
  assert.deepEqual(r, { ok: false, reason: "invalid-input-response" });
});
