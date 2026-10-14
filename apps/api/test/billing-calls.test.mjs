// What actually goes out to Bachs, asserted without Bachs.
//
// Real keys cannot answer that here — they are the operator's, they belong in `.dev.vars`, and
// nothing in this repository should hold one. What real keys *would* add over these tests is Bachs
// validating ids that only exist in our account: a product id, a live subscription. Everything this
// side of that — the host, the field names, where the metadata goes, how an error is read back —
// is ours to get wrong, and it is what is pinned here.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { BillingError, portalSession, startCheckout } from "../src/billing.ts";

const KEYS = {
  BACHS_SECRET: "sk_sandbox_example",
  BACHS_TEAM_PRODUCT: "prod_team",
  BACHS_SOLO_PRODUCT: "prod_solo",
};

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});

/** Records every request and answers with whatever the test lined up. */
function stub(...answers) {
  const seen = [];
  let i = 0;
  globalThis.fetch = async (url, init = {}) => {
    seen.push({
      url: String(url),
      method: init.method ?? "GET",
      headers: init.headers ?? {},
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    const a = answers[Math.min(i++, answers.length - 1)] ?? { ok: true, json: {} };
    return {
      ok: a.ok !== false,
      status: a.status ?? (a.ok === false ? 400 : 200),
      statusText: a.statusText ?? "OK",
      text: async () => JSON.stringify(a.json ?? {}),
    };
  };
  return seen;
}

const team = { subject: { kind: "team", id: "t1" }, email: "a@b.c", returnTo: "https://x/hub" };

test("a team checkout buys one Team product, with the team in metadata", async () => {
  const seen = stub({ json: { checkout_url: "https://checkout.bachs.io/s/1" } });
  const out = await startCheckout(KEYS, team);
  assert.deepEqual(out, { url: "https://checkout.bachs.io/s/1", mode: "test" });
  assert.equal(seen[0].url, "https://sandbox-api.bachs.io/v1/checkout-sessions");
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].headers.authorization, "Bearer sk_sandbox_example");
  assert.deepEqual(seen[0].body, {
    product_cart: [{ product_id: "prod_team", quantity: 1 }],
    customer: { email: "a@b.c" },
    billing_currency: "USD",
    metadata: { team: "t1" },
    success_url: "https://x/hub?billing=done",
    cancel_url: "https://x/hub?billing=cancelled",
  });
});

test("a Solo checkout buys the Solo product and names the account", async () => {
  const seen = stub({ json: { checkout_url: "https://c/2" } });
  await startCheckout(KEYS, { ...team, subject: { kind: "account", id: "a1" } });
  assert.equal(seen[0].body.product_cart[0].product_id, "prod_solo");
  assert.deepEqual(seen[0].body.metadata, { account: "a1" });
});

test("a live key goes to the live host and says it is live", async () => {
  const seen = stub({ json: { checkout_url: "https://c/3" } });
  const out = await startCheckout({ ...KEYS, BACHS_SECRET: "sk_live_x" }, team);
  assert.equal(out.mode, "live");
  assert.ok(seen[0].url.startsWith("https://api.bachs.io/"));
});

test("a missing product is refused before any request is made", async () => {
  const seen = stub();
  await assert.rejects(startCheckout({ ...KEYS, BACHS_TEAM_PRODUCT: "" }, team), BillingError);
  assert.equal(seen.length, 0);
});

test("Bachs's own words come back, and an answer with no page is not a success", async () => {
  stub({ ok: false, status: 404, json: { error: { message: "Product not found" } } });
  await assert.rejects(startCheckout(KEYS, team), { message: "Product not found" });
  stub({ json: {} });
  await assert.rejects(startCheckout(KEYS, team), /no checkout page/);
});

test("the billing page reads the customer off the subscription, then asks for a portal", async () => {
  const seen = stub(
    { json: { subscription_id: "sub/1", customer: { customer_id: "cus_1" } } },
    { json: { id: "ps_1", url: "https://portal.bachs.io/p/1" } },
  );
  const out = await portalSession(KEYS, "sub/1");
  assert.deepEqual(out, { url: "https://portal.bachs.io/p/1", mode: "test" });
  assert.equal(seen[0].url, "https://sandbox-api.bachs.io/v1/subscriptions/sub%2F1");
  assert.equal(seen[0].method, "GET");
  assert.equal(seen[1].url, "https://sandbox-api.bachs.io/v1/customers/cus_1/portal-sessions");
  assert.equal(seen[1].method, "POST");
});

test("a subscription with no customer says so rather than opening nothing", async () => {
  stub({ json: { subscription_id: "sub_1" } });
  await assert.rejects(portalSession(KEYS, "sub_1"), /no customer/);
});
