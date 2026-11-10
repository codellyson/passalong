// Settings that only work with a partner: a group set halfway is named, never its values.
import assert from "node:assert/strict";
import { test } from "node:test";
import { halfSet } from "../src/config.ts";

test("nothing set is not half set: every integration is off", () => {
  assert.deepEqual(halfSet({}), []);
  assert.deepEqual(halfSet({ ENVIRONMENT: "production", TURNSTILE_SECRET: "" }), []);
});

test("the Turnstile secret without its site key is named (what broke production)", () => {
  assert.deepEqual(halfSet({ TURNSTILE_SECRET: "0xsecret" }), ["turnstile"]);
  assert.deepEqual(halfSet({ NUXT_PUBLIC_TURNSTILE_SITE_KEY: "0xsite" }), ["turnstile"]);
  assert.deepEqual(
    halfSet({ TURNSTILE_SECRET: "0xsecret", NUXT_PUBLIC_TURNSTILE_SITE_KEY: "0xsite" }),
    [],
  );
});

test("push needs both keys; the subject has a default", () => {
  assert.deepEqual(halfSet({ VAPID_PUBLIC_KEY: "p" }), ["push"]);
  assert.deepEqual(halfSet({ VAPID_SUBJECT: "mailto:a@b.c" }), ["push"]);
  assert.deepEqual(halfSet({ VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "q" }), []);
});

test("billing needs the key, the webhook secret and both products", () => {
  const all = {
    BACHS_SECRET: "sk_sandbox_x",
    BACHS_WEBHOOK_SECRET: "w",
    BACHS_TEAM_PRODUCT: "t",
    BACHS_SOLO_PRODUCT: "s",
  };
  assert.deepEqual(halfSet(all), []);
  for (const name of Object.keys(all)) {
    assert.deepEqual(halfSet({ ...all, [name]: undefined }), ["billing"], name);
  }
});

test("the reader needs a known provider, a key, a model, and an address for openai-compatible", () => {
  const on = { READER_PROVIDER: "anthropic", READER_KEY: "k", READER_MODEL: "m" };
  assert.deepEqual(halfSet(on), []);
  assert.deepEqual(halfSet({ ...on, READER_MODEL: "" }), ["reader"]);
  assert.deepEqual(halfSet({ ...on, READER_PROVIDER: "antropic" }), ["reader"]);
  assert.deepEqual(halfSet({ ...on, READER_PROVIDER: "openai-compatible" }), ["reader"]);
  assert.deepEqual(
    halfSet({ ...on, READER_PROVIDER: "openai-compatible", READER_URL: "https://x" }),
    [],
  );
  assert.deepEqual(halfSet({ READER_URL: "https://x" }), ["reader"]);
});

test("only names come back, never a value", () => {
  const env = { TURNSTILE_SECRET: "s3cret", VAPID_PRIVATE_KEY: "priv", READER_KEY: "rk" };
  const out = halfSet(env);
  assert.deepEqual(out, ["turnstile", "push", "reader"]);
  for (const v of Object.values(env)) assert.ok(!JSON.stringify(out).includes(v));
});
