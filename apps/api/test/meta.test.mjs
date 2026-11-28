// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { metaEvent } from "../src/meta.ts";

const spy = () => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true };
  };
  fn.calls = calls;
  return fn;
};

const env = { META_PIXEL_ID: "123", META_CAPI_TOKEN: "tok" };

test("unconfigured deployments send nothing", async () => {
  const f = spy();
  await metaEvent({}, { name: "CompleteRegistration", email: "a@b.co" }, f);
  await metaEvent({ META_PIXEL_ID: "123" }, { name: "CompleteRegistration", email: "a@b.co" }, f);
  assert.equal(f.calls.length, 0);
});

test("an event with nobody to match is not sent", async () => {
  const f = spy();
  await metaEvent(env, { name: "Subscribe" }, f);
  assert.equal(f.calls.length, 0);
});

test("a browser event hashes the email and carries ip and user agent, nothing else", async () => {
  const f = spy();
  await metaEvent(
    env,
    {
      name: "CompleteRegistration",
      email: " Ada@Example.COM ",
      ip: "1.2.3.4",
      ua: "UA",
      url: "https://passalong.dev/hub",
      id: "acc1",
    },
    f,
  );
  const [{ url, body }] = f.calls;
  assert.equal(url, "https://graph.facebook.com/v26.0/123/events");
  assert.equal(body.access_token, "tok");
  const [ev] = body.data;
  assert.equal(ev.event_name, "CompleteRegistration");
  assert.equal(ev.action_source, "website");
  assert.equal(ev.event_id, "acc1");
  assert.equal(ev.event_source_url, "https://passalong.dev/hub");
  assert.deepEqual(Object.keys(ev.user_data).sort(), [
    "client_ip_address",
    "client_user_agent",
    "em",
  ]);
  assert.equal(ev.user_data.client_ip_address, "1.2.3.4");
  assert.equal(ev.user_data.client_user_agent, "UA");
  // Trimmed and lowercased before hashing, as Meta requires.
  const expected = [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ada@example.com")),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  assert.equal(ev.user_data.em[0], expected);
  assert.equal(body.test_event_code, undefined);
});

test("a webhook event with only an email is system_generated", async () => {
  const f = spy();
  await metaEvent({ ...env, META_TEST_CODE: "TEST1" }, { name: "Subscribe", email: "a@b.co" }, f);
  const [{ body }] = f.calls;
  assert.equal(body.data[0].action_source, "system_generated");
  assert.equal(body.data[0].user_data.client_ip_address, undefined);
  assert.equal(body.test_event_code, "TEST1");
});

test("a failure never throws", async () => {
  await metaEvent(env, { name: "Subscribe", email: "a@b.co" }, async () => {
    throw new Error("down");
  });
  await metaEvent(env, { name: "Subscribe", email: "a@b.co" }, async () => ({
    ok: false,
    status: 400,
    text: async () => "bad",
  }));
});
